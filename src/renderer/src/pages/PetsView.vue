<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/app'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const appStore = useAppStore()

// 精灵图参数
const COLS = 8 // 列数
const FRAME_W = 192 // 单帧宽度
const FRAME_H = 208 // 单帧高度
const FPS = 2 // 帧率（慢速，悬停时加速）
/** 画布显示尺寸（CSS px）— 主进程窗 bounds 以此为内容尺寸 */
const CANVAS_DISPLAY_W = 138
const CANVAS_DISPLAY_H = 145

// 当前动画状态
let currentRow = 0 // 动画行（0=idle, 1=walk-right, 2=walk-left, 3=jump, 4=sit）
let currentFrame = 0 // 当前帧（0-7）
let animationId: number | null = null
let spritesheet: HTMLImageElement | null = null
let isDragging = false
let isHovered = false
let hoverAnimRow = 0 // 悬停时播放的动画行
/** 最近一次 click-through 状态，避免每帧重复 IPC */
let lastClickThroughIgnore: boolean | null = null

// 精灵图每行的有效帧数
const ROW_FRAMES = [6, 8, 8, 4, 5, 8, 6, 6, 6]
const HOVER_ROWS = [1, 2, 3, 4, 5, 6, 7, 8] // 悬停时可选的动画行
let removeChangedListener: (() => void) | null = null

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
 * 加载精灵图
 */
async function loadSpritesheet(): Promise<void> {
  try {
    const petId = await window.api.petsGetCurrent()
    if (!petId) {
      return
    }

    const base64Data = await window.api.petsGetSpritesheet(petId)
    if (!base64Data) {
      return
    }

    const img = new Image()
    img.src = base64Data

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('精灵图解码失败'))
    })

    spritesheet = img
    startAnimation()
  }
  catch {
    // 加载失败静默处理
  }
}

/**
 * 开始逐帧动画（双缓冲避免透明窗口闪烁）
 */
function startAnimation(): void {
  stopAnimation()

  const canvas = canvasRef.value
  if (!canvas || !spritesheet)
    return
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  // 创建离屏 canvas 用于双缓冲
  const offscreen = document.createElement('canvas')
  offscreen.width = FRAME_W
  offscreen.height = FRAME_H
  const offCtx = offscreen.getContext('2d')
  if (!offCtx)
    return

  let lastTime = 0
  const interval = isHovered ? 1000 / 8 : 1000 / FPS

  currentRow = 0
  currentFrame = 0

  function animate(timestamp: number): void {
    if (timestamp - lastTime >= interval) {
      lastTime = timestamp

      if (offCtx && ctx && spritesheet && canvas) {
        // 在离屏 canvas 绘制当前帧
        offCtx.clearRect(0, 0, FRAME_W, FRAME_H)
        offCtx.drawImage(
          spritesheet,
          currentFrame * FRAME_W,
          currentRow * FRAME_H,
          FRAME_W,
          FRAME_H,
          0,
          0,
          FRAME_W,
          FRAME_H,
        )
        // 检查离屏 canvas 是否有内容（跳过透明帧）
        const hasContent = offCtx.getImageData(
          FRAME_W / 2,
          FRAME_H / 2,
          1,
          1,
        ).data[3] > 0

        if (hasContent) {
          // copy 模式：直接替换像素，不经过透明中间态
          ctx.globalCompositeOperation = 'copy'
          ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height)
          ctx.globalCompositeOperation = 'source-over'
        }

        const maxFrames = ROW_FRAMES[currentRow] || COLS
        currentFrame = (currentFrame + 1) % maxFrames
      }
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
}

/**
 * 处理宠物切换
 */
async function handlePetChange(_petId: string): Promise<void> {
  console.log('[Pets] 收到宠物切换通知')
  stopAnimation()
  spritesheet = null
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
 * 鼠标移动：仅 canvas 上关穿透 + 悬停动画（Codex 式内容命中）
 */
function handleMouseMove(e: MouseEvent): void {
  if (isDragging)
    return

  const onCanvas = isPointerOnCanvas(e)
  if (onCanvas && !isHovered) {
    hoverAnimRow = HOVER_ROWS[Math.floor(Math.random() * HOVER_ROWS.length)]
    currentRow = hoverAnimRow
    currentFrame = 0
  }
  else if (!onCanvas && isHovered) {
    currentRow = 0
    currentFrame = 0
  }
  isHovered = onCanvas

  // 只在精灵上吃点击；canvas 外保持穿透
  setPetsClickThrough(!onCanvas)
}

function handleMouseLeave(): void {
  if (isDragging)
    return
  isHovered = false
  currentRow = 0
  currentFrame = 0
  setPetsClickThrough(true)
}

/**
 * 鼠标按下处理（拖拽）
 */
function handleMouseDown(e: MouseEvent): void {
  if (e.button !== 0)
    return
  // 仅在精灵上开始拖动
  if (!isPointerOnCanvas(e))
    return

  isDragging = true
  setPetsClickThrough(false)
  window.api.hideHover()
  window.api.dragStart()

  const handleMouseMoveGlobal = (): void => {
    if (isDragging) {
      window.api.dragMove()
    }
  }

  const handleMouseUpGlobal = (): void => {
    if (isDragging) {
      isDragging = false
      window.api.dragEnd()
      window.removeEventListener('mousemove', handleMouseMoveGlobal)
      window.removeEventListener('mouseup', handleMouseUpGlobal)
    }
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
    containerRef.value.addEventListener('mousemove', handleMouseMove)
    containerRef.value.addEventListener('mouseleave', handleMouseLeave)
    containerRef.value.addEventListener('dblclick', handleDblClick)
    containerRef.value.addEventListener('contextmenu', handleContextMenu)
  }

  // 监听宠物切换事件
  removeChangedListener = window.api.petsOnChanged(handlePetChange)

  // 默认穿透；内容命中时再关闭
  setPetsClickThrough(true)
  reportContentSize()
  loadSpritesheet()
})

onUnmounted(() => {
  stopAnimation()
  if (containerRef.value) {
    containerRef.value.removeEventListener('mousedown', handleMouseDown)
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
