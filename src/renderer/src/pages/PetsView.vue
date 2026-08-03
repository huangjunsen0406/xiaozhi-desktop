<script setup lang="ts">
/**
 * Sprite pets 渲染：Codex v1/v2 动画状态机 + look 方向
 * 窗口壳（content bounds / click-through / bubble）已由既有逻辑负责，这里只做动画。
 */
import type { DeviceState, PetAnimationState, PetSpriteVersion } from '@shared/types'
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/app'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const appStore = useAppStore()

// —— Atlas 常量（Codex 兼容，8 列）——
const FRAME_W = 192
const FRAME_H = 208
/** 画布显示尺寸（CSS px）— 主进程窗 bounds 以此为内容尺寸 */
const CANVAS_DISPLAY_W = 138
const CANVAS_DISPLAY_H = 145

/** 建立拖动方向的阈值（屏幕 delta，px） */
const DRAG_DIR_THRESHOLD = 4
/**
 * 反向翻转阈值：需更强的反向位移才切换 running-left/right，
 * 避免小抖动在左右跑之间来回切。
 */
const DRAG_DIR_FLIP_THRESHOLD = 8
/** look 死区半径（相对宠物中心，CSS px） */
const LOOK_DEADZONE_PX = 6

interface AnimClip {
  row: number
  frames: number
  /** 每帧持续时间 ms，长度 = frames */
  durations: number[]
}

/** Codex 标准行动画表（rows 0–8） */
const ANIM_CLIPS: Record<PetAnimationState, AnimClip> = {
  'idle': {
    row: 0,
    frames: 6,
    durations: [280, 110, 110, 140, 140, 320],
  },
  'running-right': {
    row: 1,
    frames: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
  },
  'running-left': {
    row: 2,
    frames: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
  },
  'waving': {
    row: 3,
    frames: 4,
    durations: [140, 140, 140, 280],
  },
  'jumping': {
    row: 4,
    frames: 5,
    durations: [140, 140, 140, 140, 280],
  },
  'failed': {
    row: 5,
    frames: 8,
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
  },
  'waiting': {
    row: 6,
    frames: 6,
    durations: [150, 150, 150, 150, 150, 260],
  },
  /** task work，非脚跑 */
  'running': {
    row: 7,
    frames: 6,
    durations: [120, 120, 120, 120, 120, 220],
  },
  'review': {
    row: 8,
    frames: 6,
    durations: [150, 150, 150, 150, 150, 280],
  },
}

// —— 运行时状态 ——
let animationId: number | null = null
let spritesheet: HTMLImageElement | null = null
let spriteVersion: PetSpriteVersion = 1
let isDragging = false
/** 拖动期间平滑水平位移（用于建立/翻转方向） */
let dragDeltaX = 0
let lastDragScreenX = 0
/**
 * 拖动粘滞方向：一旦建立，整段拖动保持 running-left/right，
 * 不会因慢速/停顿回 idle（Codex 拖动期间持续 walk/run）。
 */
let lastDragDir: 'left' | 'right' | null = null
/**
 * 指针是否在精灵 canvas 上（enter/move 置 true，leave 置 false）
 * 用于 v1 hover jumping 与 v2 look 入口。
 */
let isHovered = false
/**
 * v2 look：0–15 对应 22.5° 步进（0=UP）；null = 死区/无 look
 */
let lookFrame: number | null = null
/** 当前播放 clip 与帧 */
let activeState: PetAnimationState = 'idle'
let currentFrame = 0
let frameElapsedMs = 0
let lastTimestamp = 0
/** 最近一次 click-through 状态，避免每帧重复 IPC */
let lastClickThroughIgnore: boolean | null = null
let removeChangedListener: (() => void) | null = null

/**
 * deviceState → 基础动画（无 drag / look 时）
 */
function baseStateFromDevice(deviceState: DeviceState): PetAnimationState {
  switch (deviceState) {
    case 'connecting':
    case 'listening':
      return 'waiting'
    case 'speaking':
      return 'running'
    case 'idle':
    default:
      return 'idle'
  }
}

/**
 * 状态优先级（Codex 对齐）：
 * drag sticky running-left/right
 *   > look (v2，指针在精灵上且非死区)
 *   > hover jumping（v1 全程 hover；v2 死区/无 look 时）
 *   > device base (waiting/running/idle)
 *   > idle
 */
function resolveEffectivePlayback():
  | { mode: 'anim', state: PetAnimationState }
  | { mode: 'look', index: number } {
  if (isDragging) {
    // 粘滞方向：拖动全程保持 run，慢速/停顿不再回 idle
    if (lastDragDir === 'right')
      return { mode: 'anim', state: 'running-right' }
    if (lastDragDir === 'left')
      return { mode: 'anim', state: 'running-left' }
    // 尚未越过阈值（刚按下几乎无位移）：短暂 idle，不进入 look
    return { mode: 'anim', state: 'idle' }
  }

  if (spriteVersion >= 2 && lookFrame !== null)
    return { mode: 'look', index: lookFrame }

  // Hover 反馈：v1 无 look 行；v2 死区内也给 jumping（Codex respondToHover）
  if (isHovered)
    return { mode: 'anim', state: 'jumping' }

  return { mode: 'anim', state: baseStateFromDevice(appStore.deviceState) }
}

/**
 * 根据平滑 delta 更新粘滞拖动方向。
 * - 尚无方向：|delta| ≥ DRAG_DIR_THRESHOLD 建立
 * - 已有方向：需反向 |delta| ≥ DRAG_DIR_FLIP_THRESHOLD 才翻转
 */
function updateDragDirection(): void {
  if (lastDragDir === null) {
    if (dragDeltaX >= DRAG_DIR_THRESHOLD)
      lastDragDir = 'right'
    else if (dragDeltaX <= -DRAG_DIR_THRESHOLD)
      lastDragDir = 'left'
    return
  }

  if (lastDragDir === 'right' && dragDeltaX <= -DRAG_DIR_FLIP_THRESHOLD)
    lastDragDir = 'left'
  else if (lastDragDir === 'left' && dragDeltaX >= DRAG_DIR_FLIP_THRESHOLD)
    lastDragDir = 'right'
}

/**
 * look 索引 → 行/列（rows 9–10）
 */
function lookCell(index: number): { row: number, col: number } {
  const i = ((index % 16) + 16) % 16
  return {
    row: 9 + Math.floor(i / 8),
    col: i % 8,
  }
}

/**
 * 指针相对 canvas 中心 → look 索引；死区内返回 null
 */
function computeLookIndex(clientX: number, clientY: number): number | null {
  const canvas = canvasRef.value
  if (!canvas)
    return null

  const rect = canvas.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = clientX - cx
  // 屏幕 y 向下为正；Codex：0° = UP，使用 atan2(dx, -dy)
  const dy = clientY - cy
  const dist = Math.hypot(dx, dy)
  if (dist <= LOOK_DEADZONE_PX)
    return null

  const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360
  return Math.round(angle / 22.5) % 16
}

/**
 * 上报内容尺寸，主进程 setBounds 紧包精灵（Codex 式小窗）
 */
function reportContentSize(): void {
  window.api.bubbleSetContentSize('pets', {
    width: CANVAS_DISPLAY_W,
    height: CANVAS_DISPLAY_H,
    // 精灵贴底绘制，头顶约在 canvas 顶
    anchorOffsetY: 0,
  })
}

function setPetsClickThrough(ignore: boolean): void {
  if (lastClickThroughIgnore === ignore)
    return
  lastClickThroughIgnore = ignore
  window.api.setClickThrough('pets', ignore)
}

/**
 * 切换 clip 时重置帧时间线
 */
function switchAnimState(next: PetAnimationState): void {
  if (activeState === next)
    return
  activeState = next
  currentFrame = 0
  frameElapsedMs = 0
}

/**
 * 加载精灵图（结构化 payload：dataUrl + version）
 */
async function loadSpritesheet(): Promise<void> {
  try {
    const petId = await window.api.petsGetCurrent()
    if (!petId) {
      return
    }

    const payload = await window.api.petsGetSpritesheet(petId)
    if (!payload?.dataUrl) {
      return
    }

    const img = new Image()
    img.src = payload.dataUrl

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('精灵图解码失败'))
    })

    spritesheet = img
    // 主进程已解析 manifest/高度；再按 naturalHeight 兜底
    const fromPayload = payload.spriteVersionNumber === 2 ? 2 : 1
    if (fromPayload === 2 || img.naturalHeight >= FRAME_H * 11 - FRAME_H / 2) {
      spriteVersion = 2
    }
    else {
      spriteVersion = 1
    }

    lookFrame = null
    dragDeltaX = 0
    lastDragDir = null
    isHovered = false
    console.log(
      `[Pets] spritesheet loaded version=${spriteVersion} natural=${img.naturalWidth}x${img.naturalHeight} payloadVersion=${payload.spriteVersionNumber}`,
    )
    switchAnimState(baseStateFromDevice(appStore.deviceState))
    startAnimation()
  }
  catch {
    // 加载失败静默处理
  }
}

/**
 * 开始逐帧动画（双缓冲避免透明窗口闪烁；按 per-frame duration 推进）
 */
function startAnimation(): void {
  stopAnimation()

  const canvas = canvasRef.value
  if (!canvas || !spritesheet)
    return
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const offscreen = document.createElement('canvas')
  offscreen.width = FRAME_W
  offscreen.height = FRAME_H
  const offCtx = offscreen.getContext('2d')
  if (!offCtx)
    return

  lastTimestamp = 0
  frameElapsedMs = 0

  function drawCell(row: number, col: number): void {
    if (!offCtx || !ctx || !spritesheet || !canvas)
      return

    offCtx.clearRect(0, 0, FRAME_W, FRAME_H)
    offCtx.drawImage(
      spritesheet,
      col * FRAME_W,
      row * FRAME_H,
      FRAME_W,
      FRAME_H,
      0,
      0,
      FRAME_W,
      FRAME_H,
    )

    // 跳过中心完全透明帧（未使用格）
    const hasContent = offCtx.getImageData(
      FRAME_W / 2,
      FRAME_H / 2,
      1,
      1,
    ).data[3] > 0

    if (hasContent) {
      ctx.globalCompositeOperation = 'copy'
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  function animate(timestamp: number): void {
    if (!lastTimestamp)
      lastTimestamp = timestamp
    const dt = Math.min(100, timestamp - lastTimestamp)
    lastTimestamp = timestamp

    const playback = resolveEffectivePlayback()

    if (playback.mode === 'look') {
      const { row, col } = lookCell(playback.index)
      drawCell(row, col)
      // look 为静态格，不推进动画时间线
    }
    else {
      switchAnimState(playback.state)
      const clip = ANIM_CLIPS[activeState]
      frameElapsedMs += dt

      // 卡顿时最多追赶若干帧，避免一次跳完整圈
      let guard = 0
      while (guard < 8) {
        const frameDuration = clip.durations[currentFrame] ?? 150
        if (frameElapsedMs < frameDuration)
          break
        frameElapsedMs -= frameDuration
        currentFrame = (currentFrame + 1) % clip.frames
        guard += 1
      }

      drawCell(clip.row, currentFrame)
    }

    animationId = requestAnimationFrame(animate)
  }

  animationId = requestAnimationFrame(animate)
}

/**
 * 停止动画
 */
function stopAnimation(): void {
  if (animationId !== null) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  lastTimestamp = 0
}

/**
 * 处理宠物切换
 */
async function handlePetChange(_petId: string): Promise<void> {
  console.log('[Pets] 收到宠物切换通知')
  stopAnimation()
  spritesheet = null
  spriteVersion = 1
  lookFrame = null
  lastDragDir = null
  dragDeltaX = 0
  isHovered = false
  await loadSpritesheet()
}

/**
 * 双击窗口区域切换通话状态
 */
async function toggleCall() {
  try {
    if (appStore.deviceState !== 'idle') {
      console.log('[Pets] 挂断电话')
      await appStore.stopAutoConversation()
    }
    else {
      console.log('[Pets] 拨打电话')
      await appStore.startAutoConversation()
    }
  }
  catch (error) {
    console.error('[Pets] 切换通话状态失败', error)
  }
}

/**
 * 是否在精灵 canvas 上（内容命中，非整窗）
 */
function isPointerOnCanvas(e: MouseEvent): boolean {
  const canvas = canvasRef.value
  if (!canvas)
    return false
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  return x >= 0 && x <= rect.width && y >= 0 && y <= rect.height
}

/**
 * 根据指针位置刷新 hover / look / click-through
 */
function applyPointerHoverState(e: MouseEvent): void {
  const onCanvas = isPointerOnCanvas(e)
  isHovered = onCanvas

  if (onCanvas && spriteVersion >= 2) {
    lookFrame = computeLookIndex(e.clientX, e.clientY)
  }
  else {
    lookFrame = null
  }

  // 只在精灵上吃点击；canvas 外保持穿透
  setPetsClickThrough(!onCanvas)
}

/**
 * 鼠标进入：立即进入 hover（jumping / look），不依赖首次 move
 */
function handleMouseEnter(e: MouseEvent): void {
  if (isDragging)
    return
  applyPointerHoverState(e)
}

/**
 * 鼠标移动：内容命中穿透 + v2 look / v1 hover
 */
function handleMouseMove(e: MouseEvent): void {
  if (isDragging)
    return
  applyPointerHoverState(e)
}

function handleMouseLeave(): void {
  if (isDragging)
    return
  isHovered = false
  lookFrame = null
  setPetsClickThrough(true)
}

/**
 * 鼠标按下处理（拖拽 + 粘滞方向动画）
 */
function handleMouseDown(e: MouseEvent): void {
  if (e.button !== 0)
    return
  // 仅在精灵上开始拖动
  if (!isPointerOnCanvas(e))
    return

  isDragging = true
  isHovered = true
  lookFrame = null
  dragDeltaX = 0
  lastDragDir = null
  lastDragScreenX = e.screenX
  setPetsClickThrough(false)
  window.api.hideHover()
  window.api.dragStart()

  const handleMouseMoveGlobal = (ev: MouseEvent): void => {
    if (!isDragging)
      return
    const dx = ev.screenX - lastDragScreenX
    lastDragScreenX = ev.screenX
    // 平滑一点：最近位移主导，保留少量惯性
    dragDeltaX = dragDeltaX * 0.35 + dx
    updateDragDirection()
    window.api.dragMove()
  }

  const handleMouseUpGlobal = (ev: MouseEvent): void => {
    if (!isDragging)
      return
    isDragging = false
    dragDeltaX = 0
    lastDragDir = null
    window.api.dragEnd()
    window.removeEventListener('mousemove', handleMouseMoveGlobal)
    window.removeEventListener('mouseup', handleMouseUpGlobal)

    // 松手后按当前指针位置恢复 look / hover / 穿透
    applyPointerHoverState(ev)
  }

  window.addEventListener('mousemove', handleMouseMoveGlobal)
  window.addEventListener('mouseup', handleMouseUpGlobal)
}

/**
 * 精灵上右键：独立 Hover 菜单窗（与 Mini 同一套，避免父窗裁切）
 */
function handleContextMenu(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()

  if (isDragging)
    return
  if (!isPointerOnCanvas(e))
    return

  setPetsClickThrough(false)
  window.api.showHoverFor('pets', e.screenX, e.screenY)
}

function handleDblClick(e: MouseEvent): void {
  if (!isPointerOnCanvas(e))
    return
  void toggleCall()
}

onMounted(() => {
  if (containerRef.value) {
    containerRef.value.addEventListener('mousedown', handleMouseDown)
    containerRef.value.addEventListener('mouseenter', handleMouseEnter)
    containerRef.value.addEventListener('mousemove', handleMouseMove)
    containerRef.value.addEventListener('mouseleave', handleMouseLeave)
    containerRef.value.addEventListener('dblclick', handleDblClick)
    containerRef.value.addEventListener('contextmenu', handleContextMenu)
  }

  removeChangedListener = window.api.petsOnChanged(handlePetChange)

  setPetsClickThrough(true)
  reportContentSize()
  loadSpritesheet()
})

onUnmounted(() => {
  stopAnimation()
  if (containerRef.value) {
    containerRef.value.removeEventListener('mousedown', handleMouseDown)
    containerRef.value.removeEventListener('mouseenter', handleMouseEnter)
    containerRef.value.removeEventListener('mousemove', handleMouseMove)
    containerRef.value.removeEventListener('mouseleave', handleMouseLeave)
    containerRef.value.removeEventListener('dblclick', handleDblClick)
    containerRef.value.removeEventListener('contextmenu', handleContextMenu)
  }
  if (removeChangedListener) {
    removeChangedListener()
    removeChangedListener = null
  }
})
</script>

<template>
  <div ref="containerRef" class="pets-container">
    <!-- 精灵 Canvas -->
    <canvas
      ref="canvasRef"
      :width="CANVAS_DISPLAY_W"
      :height="CANVAS_DISPLAY_H"
    />
  </div>
</template>

<style scoped>
/* 容器铺满窗客户区；窗本身由主进程按 canvas 内容缩 bounds */
.pets-container {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  overflow: hidden;
}

canvas {
  image-rendering: pixelated;
  cursor: move;
  width: 138px;
  height: 145px;
}
</style>
