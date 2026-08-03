<script setup lang="ts">
import type { Ref } from 'vue'
import * as pixiFnPatch from '@pixi/unsafe-eval'
import {
  clampPetDisplayWidth,
  live2dViewportFromDisplayWidth,
  PET_DISPLAY_WIDTH_DEFAULT,
} from '@shared/types'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import * as PIXI from 'pixi.js'
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/app'

// @ts-expect-error - PIXI 需要挂载到 window
window.PIXI = PIXI
pixiFnPatch.install(PIXI)

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
/**
 * Live2D 视口：默认 200×400（displayWidth=112），
 * 按 displayWidth/112 缩放（80→~143×286，224→400×800 再被主进程 max 夹取）。
 * 不按 mesh/getBounds 收缩画布，避免半身裁切。
 */
const displayWidthPx = ref(PET_DISPLAY_WIDTH_DEFAULT)
const canvasSize: Ref<{ width: number, height: number }> = ref(
  live2dViewportFromDisplayWidth(PET_DISPLAY_WIDTH_DEFAULT),
)
const appStore = useAppStore()

// 默认模型（首次加载或配置为空时使用）
const DEFAULT_MODEL = 'Hiyori'

let app: PIXI.Application | null = null
let model: Live2DModel | null = null
let isDragging = false
let currentModelId = '' // 当前加载的模型ID
let removeAudioVolumeListener: (() => void) | null = null
let removeModelChangedListener: (() => void) | null = null
let removeDisplayWidthListener: (() => void) | null = null
/** 最近一次 click-through 状态，避免每帧重复 IPC */
let lastClickThroughIgnore: boolean | null = null
/** 取消进行中的锚点复测（模型切换时） */
let layoutToken = 0

/** 当前逻辑视口（与 canvasSize 同步） */
function getViewport(): { width: number, height: number } {
  return canvasSize.value
}

const status = ref({
  canvas: false,
  app: false,
  model: false,
  error: '',
})

// 口型同步相关
let currentMouthValue = 0 // 当前嘴巴开合度
let targetMouthValue = 0 // 目标嘴巴开合度
let lipSyncAnimationId: number | null = null

/**
 * 获取当前配置的模型ID
 */
async function getCurrentModelId(): Promise<string> {
  try {
    const modelId = await window.api.modelGetCurrent()
    return modelId || DEFAULT_MODEL
  }
  catch (error) {
    console.warn('[Live2D] 获取当前模型配置失败，使用默认模型', error)
    return DEFAULT_MODEL
  }
}

/**
 * 构建模型URL（使用自定义协议）
 */
function buildModelUrl(modelId: string): string {
  // 使用 live2d-model:// 协议访问 userData/models/ 中的模型
  return `live2d-model://${modelId}/model.json`
}

/**
 * 加载模型
 */
async function loadModel(modelId: string): Promise<void> {
  if (!app) {
    console.error('[Live2D] PIXI Application 未初始化')
    return
  }

  // 如果是同一个模型，不重新加载
  if (modelId === currentModelId && model) {
    console.log('[Live2D] 模型已加载，跳过:', modelId)
    return
  }

  console.log('[Live2D] 开始加载模型:', modelId)

  // 清理旧模型
  if (model) {
    console.log('[Live2D] 清理旧模型:', currentModelId)
    app.stage.removeChild(model)
    model.destroy()
    model = null
  }

  try {
    const modelPath = buildModelUrl(modelId)
    console.log('[Live2D] 模型路径:', modelPath)

    model = await Live2DModel.from(modelPath)
    console.log('[Live2D] 模型加载成功:', model)

    currentModelId = modelId
    status.value.model = true
    status.value.error = ''

    // 添加模型到舞台
    app.stage.addChild(model)
    setupModel(model)
    console.log('[Live2D] 模型已添加到舞台')

    // 监听模型点击事件
    model.on('hit', (...args: unknown[]) => {
      const hitAreas = args[0]
      console.log('[Live2D] Hit areas:', hitAreas)
    })
  }
  catch (error) {
    console.error('[Live2D] 加载模型失败:', error)
    status.value.model = false
    if (error instanceof Error) {
      status.value.error = error.message
    }
    // 如果加载失败且不是默认模型，尝试加载默认模型
    if (modelId !== DEFAULT_MODEL) {
      console.log('[Live2D] 尝试加载默认模型...')
      await loadModel(DEFAULT_MODEL)
    }
  }
}

/**
 * 模型切换处理
 */
async function handleModelChange(newModelId: string): Promise<void> {
  console.log('[Live2D] 收到模型切换通知:', newModelId)
  if (newModelId && newModelId !== currentModelId) {
    await loadModel(newModelId)
  }
}

/**
 * 同步 PIXI 渲染缓冲到当前逻辑视口（CSS px）。
 * 只走 renderer.resize；禁止 Vue 写 canvas width/height 属性，
 * 否则会与 autoDensity/devicePixelRatio 抢 backing store → 只显示局部裁切。
 */
function resizeRendererToViewport(viewport: { width: number, height: number }): void {
  if (!app)
    return
  try {
    // 用 screen（逻辑 CSS px），不要用 renderer.width（retina 下可能是 buffer 像素）
    const screenW = app.screen.width
    const screenH = app.screen.height
    if (screenW === viewport.width && screenH === viewport.height)
      return
    app.renderer.resize(viewport.width, viewport.height)
  }
  catch (error) {
    console.warn('[Live2D] resize renderer 失败', error)
  }
}

/**
 * 应用全局显示宽度：缩放视口、resize renderer、重布局模型并上报 content size
 */
function applyDisplayWidth(width: number): void {
  const next = clampPetDisplayWidth(width)
  const viewport = live2dViewportFromDisplayWidth(next)

  displayWidthPx.value = next
  canvasSize.value = viewport

  // 先 resize 缓冲，再 framing；窗尺寸始终报完整视口，永不按 mesh AABB 缩窗
  resizeRendererToViewport(viewport)

  if (model)
    setupModel(model)
  else
    reportFixedViewportContentSize(0)
}

// 注册清理函数(必须在 async 之前)
onUnmounted(() => {
  if (containerRef.value) {
    containerRef.value.removeEventListener('mousemove', handleMouseMove)
    containerRef.value.removeEventListener('mouseleave', handleMouseLeave)
    containerRef.value.removeEventListener('mousedown', handleMouseDown)
    containerRef.value.removeEventListener('dblclick', handleDblClick)
    containerRef.value.removeEventListener('contextmenu', handleContextMenu)
  }
  if (app) {
    app.destroy(true)
    app = null
  }
  // 清理口型同步
  if (lipSyncAnimationId !== null) {
    cancelAnimationFrame(lipSyncAnimationId)
    lipSyncAnimationId = null
  }
  if (removeAudioVolumeListener) {
    removeAudioVolumeListener()
    removeAudioVolumeListener = null
  }
  // 移除模型切换监听
  if (removeModelChangedListener) {
    removeModelChangedListener()
    removeModelChangedListener = null
  }
  if (removeDisplayWidthListener) {
    removeDisplayWidthListener()
    removeDisplayWidthListener = null
  }
})

onMounted(async () => {
  console.log('Component mounted')
  console.log('Canvas ref:', canvasRef.value)
  console.log('Container ref:', containerRef.value)

  if (!canvasRef.value) {
    console.error('[Live2D] Canvas element not found')
    status.value.error = 'Canvas 元素未找到'
    return
  }

  status.value.canvas = true

  try {
    // 先读全局显示宽度，再创建与之匹配的 PIXI 视口
    try {
      const width = await window.api.petsGetDisplayWidth()
      displayWidthPx.value = clampPetDisplayWidth(width)
      canvasSize.value = live2dViewportFromDisplayWidth(displayWidthPx.value)
    }
    catch {
      displayWidthPx.value = PET_DISPLAY_WIDTH_DEFAULT
      canvasSize.value = live2dViewportFromDisplayWidth(PET_DISPLAY_WIDTH_DEFAULT)
    }

    const initialViewport = canvasSize.value
    app = new PIXI.Application({
      view: canvasRef.value,
      autoStart: true,
      autoDensity: true,
      width: initialViewport.width,
      height: initialViewport.height,
      resolution: window.devicePixelRatio,
      backgroundAlpha: 0,
    })
    console.log('PIXI Application created', initialViewport)
    status.value.app = true

    // 获取当前配置的模型并加载
    const modelId = await getCurrentModelId()
    await loadModel(modelId)

    // 监听鼠标事件(穿透控制 / 拖拽 / 右键菜单)
    if (containerRef.value) {
      containerRef.value.addEventListener('mousemove', handleMouseMove)
      containerRef.value.addEventListener('mouseleave', handleMouseLeave)
      containerRef.value.addEventListener('mousedown', handleMouseDown)
      containerRef.value.addEventListener('dblclick', handleDblClick)
      containerRef.value.addEventListener('contextmenu', handleContextMenu)
    }

    // 默认穿透；模型命中时再关闭
    setLive2dClickThrough(true)

    // 启动口型同步
    setupLipSync()
    console.log('口型同步已启动')

    // 监听模型切换事件
    removeModelChangedListener = window.api.modelOnChanged(handleModelChange)
    console.log('[Live2D] 模型切换监听已注册')

    // 设置页实时改大小
    removeDisplayWidthListener = window.api.petsOnDisplayWidthChanged((width) => {
      applyDisplayWidth(width)
    })
  }
  catch (error) {
    console.error('Failed to initialize', error)
    if (error instanceof Error) {
      console.error('Error details', error.message, error.stack)
      status.value.error = error.message
    }
  }
})

function setLive2dClickThrough(ignore: boolean): void {
  if (lastClickThroughIgnore === ignore)
    return
  lastClickThroughIgnore = ignore
  window.api.setClickThrough('live2d', ignore)
}

interface ModelBounds {
  x: number
  y: number
  width: number
  height: number
}

interface Affine2d {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

/**
 * 强制刷新 Live2D 容器 worldTransform（改 scale/position 后立即 measure 需要）。
 */
function syncModelWorldTransform(modelInstance: Live2DModel): void {
  try {
    const anyModel = modelInstance as unknown as {
      _recursivePostUpdateTransform?: () => void
      displayObjectUpdateTransform?: () => void
      parent?: unknown
      _tempDisplayObjectParent?: unknown
    }
    anyModel._recursivePostUpdateTransform?.()
    if (!anyModel.parent && anyModel._tempDisplayObjectParent) {
      anyModel.parent = anyModel._tempDisplayObjectParent
      anyModel.displayObjectUpdateTransform?.()
      anyModel.parent = null
    }
    else {
      anyModel.displayObjectUpdateTransform?.()
    }
  }
  catch {
    // transform 更新失败则仍用当前矩阵
  }
}

/** PIXI getBounds 的 skipUpdate 在类型声明里可能缺失；改 scale/position 后先 sync 再读。 */
function readModelBounds(modelInstance: Live2DModel): ModelBounds {
  syncModelWorldTransform(modelInstance)
  const getter = modelInstance.getBounds as unknown as (
    skipUpdate?: boolean,
  ) => { x: number, y: number, width: number, height: number }
  // skipUpdate=true：依赖上面已刷新的 worldTransform
  const b = getter.call(modelInstance, true)
  return { x: b.x, y: b.y, width: b.width, height: b.height }
}

function boundsArea(b: ModelBounds): number {
  return Math.max(0, b.width) * Math.max(0, b.height)
}

/**
 * 可见网格 AABB：仅用于头顶锚点 / 可选命中收紧。
 * 窗尺寸跟 displayWidth 视口；装载 framing 用 getBounds，mesh 绝不驱动缩窗。
 */
function measureVisibleModelBounds(modelInstance: Live2DModel): ModelBounds | null {
  // pixi-live2d-display 内部 API：按 mesh 顶点收紧包围盒
  const internal = (modelInstance as unknown as {
    internalModel?: {
      localTransform?: Affine2d
      coreModel?: {
        getDrawableCount?: () => number
        getDrawableDynamicFlagIsVisible?: (i: number) => boolean
        getDrawableOpacity?: (i: number) => number
      }
      getDrawableVertices?: (i: number) => ArrayLike<number>
    }
  }).internalModel

  const core = internal?.coreModel
  const local = internal?.localTransform
  if (
    !core
    || typeof core.getDrawableCount !== 'function'
    || typeof internal.getDrawableVertices !== 'function'
    || !local
  ) {
    return null
  }

  syncModelWorldTransform(modelInstance)
  const world = (modelInstance.transform as { worldTransform?: Affine2d } | undefined)?.worldTransform
  if (!world)
    return null

  const count = core.getDrawableCount()
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let hitAny = false

  for (let i = 0; i < count; i++) {
    if (
      typeof core.getDrawableDynamicFlagIsVisible === 'function'
      && !core.getDrawableDynamicFlagIsVisible(i)
    ) {
      continue
    }
    if (
      typeof core.getDrawableOpacity === 'function'
      && core.getDrawableOpacity(i) <= 0.01
    ) {
      continue
    }

    let verts: ArrayLike<number>
    try {
      verts = internal.getDrawableVertices(i)
    }
    catch {
      continue
    }

    for (let j = 0; j + 1 < verts.length; j += 2) {
      const dx = verts[j]
      const dy = verts[j + 1]
      // drawable 空间 → container local（与 hitTest 互逆）
      const lx = local.a * dx + local.c * dy + local.tx
      const ly = local.b * dx + local.d * dy + local.ty
      // container local → 舞台/画布 CSS 像素
      const wx = world.a * lx + world.c * ly + world.tx
      const wy = world.b * lx + world.d * ly + world.ty
      if (wx < minX)
        minX = wx
      if (wy < minY)
        minY = wy
      if (wx > maxX)
        maxX = wx
      if (wy > maxY)
        maxY = wy
      hitAny = true
    }
  }

  if (!hitAny || !Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY)
    return null

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * 可见 AABB 是否可信：须落在 full bounds 附近，且不可明显大于 full。
 * 面积远小于 full 时仍可用于「头顶 Y」（可能只有头 mesh）。
 */
function isVisibleHeadAnchorReliable(visible: ModelBounds, full: ModelBounds): boolean {
  if (visible.width <= 1 || visible.height <= 1)
    return false
  const fullArea = boundsArea(full)
  const visArea = boundsArea(visible)
  if (fullArea <= 0 || visArea <= 0)
    return false
  // 可见盒不应大幅超出逻辑画布（变换空间错误时常见）
  if (visArea > fullArea * 1.5)
    return false
  // 头顶应大致落在 full 竖直范围内
  if (visible.y < full.y - 8)
    return false
  if (visible.y > full.y + full.height)
    return false
  return true
}

/**
 * 可见 AABB 是否足以代表全身（命中测试用）。面积过小则退回 full，避免只能拖头。
 */
function isVisibleFullBodyReliable(visible: ModelBounds, full: ModelBounds): boolean {
  if (!isVisibleHeadAnchorReliable(visible, full))
    return false
  return boundsArea(visible) >= boundsArea(full) * 0.5
}

/**
 * 当前视口 content size + 头顶锚点。
 * width/height 随 displayWidth 缩放；anchorOffsetY 仅影响气泡位置。
 */
function reportFixedViewportContentSize(headOffsetY: number): void {
  const viewport = getViewport()
  const anchorY = Math.max(0, Math.min(Math.round(headOffsetY), viewport.height))
  console.log('[Live2D] viewport content:', {
    width: viewport.width,
    height: viewport.height,
    anchorOffsetY: anchorY,
    displayWidthPx: displayWidthPx.value,
  })
  window.api.bubbleSetContentSize('live2d', {
    width: viewport.width,
    height: viewport.height,
    anchorOffsetY: anchorY,
  })
  window.api.bubbleSetAnchorOffset(anchorY)
}

/**
 * 经典 framing：整身 fit 进当前视口，水平居中、垂直底对齐。
 * - 视口始终是 displayWidth 派生的固定宽高比（200×400 @ 112）
 * - scale 基于 **完整 getBounds**，禁止用 mesh 可见 AABB 驱动缩放（否则只剩头）
 * - 上报 content size = 完整视口，永不按半身 mesh 缩窗
 */
function setupModel(modelInstance: Live2DModel): void {
  layoutToken += 1
  const token = layoutToken
  const viewport = getViewport()

  // 确保 renderer 与当前视口一致（模型切换 / 首次加载路径）
  resizeRendererToViewport(viewport)

  // 复位，避免切换模型或改宽后残留 transform
  modelInstance.scale.set(1)
  modelInstance.position.set(0, 0)
  const anchorPoint = (modelInstance as unknown as {
    anchor?: { set?: (x: number, y: number) => void }
  }).anchor
  anchorPoint?.set?.(0, 0)

  const rawBounds = readModelBounds(modelInstance)
  console.log('Model original bounds:', rawBounds)

  // 防御：bounds 未就绪时先报完整视口，下一帧再 framing，避免用半身 AABB 算 scale
  if (
    !Number.isFinite(rawBounds.width)
    || !Number.isFinite(rawBounds.height)
    || rawBounds.width < 2
    || rawBounds.height < 2
  ) {
    console.warn('[Live2D] raw bounds 未就绪，延迟 framing', rawBounds)
    reportFixedViewportContentSize(0)
    requestAnimationFrame(() => {
      if (token !== layoutToken || model !== modelInstance)
        return
      setupModel(modelInstance)
    })
    return
  }

  // scale = min(vw/w, vh/h) — 全身 fit 当前视口；随 displayWidth 放大/缩小
  // 不用 cap 1：大 displayWidth 时需要 scale 随视口变大（模型原生画布通常远大于 200×400）
  const scale = Math.min(
    viewport.width / rawBounds.width,
    viewport.height / rawBounds.height,
  )
  if (!Number.isFinite(scale) || scale <= 0) {
    console.warn('[Live2D] 无效 scale，跳过 framing', { scale, rawBounds, viewport })
    reportFixedViewportContentSize(0)
    return
  }
  modelInstance.scale.set(scale)
  console.log('Model scale:', scale)

  const layoutAndReport = (): void => {
    if (token !== layoutToken || model !== modelInstance)
      return

    const vp = getViewport()

    // 每次从「仅缩放、位置归零」重算，避免 rAF 复测时累加平移
    modelInstance.position.set(0, 0)

    const scaled = readModelBounds(modelInstance)
    console.log('Model scaled bounds:', scaled)

    // 水平居中、垂直底对齐（经典可靠 framing）
    modelInstance.x = (vp.width - scaled.width) / 2 - scaled.x
    modelInstance.y = vp.height - scaled.height - scaled.y

    const framed = readModelBounds(modelInstance)
    console.log('Model framed bounds:', framed)

    // 头顶锚点：优先可见 mesh 顶边；不可靠则用 getBounds 顶边
    // 底对齐后 bounds.y 通常 > 0（头顶上方透明区）
    // mesh 只影响气泡 Y，绝不回写窗高
    let headOffsetY = Math.max(0, Math.round(framed.y))
    const visible = measureVisibleModelBounds(modelInstance)
    if (visible && isVisibleHeadAnchorReliable(visible, framed)) {
      headOffsetY = Math.max(0, Math.round(visible.y))
      console.log('Model visible head bounds:', visible)
    }
    else if (visible) {
      console.log('Model visible bounds discarded for anchor (unreliable):', visible)
    }

    console.log('Model positioned at:', {
      x: modelInstance.x,
      y: modelInstance.y,
      viewport: vp,
      headOffsetY,
    })

    reportFixedViewportContentSize(headOffsetY)
  }

  // 一次布局 + 可选 1 rAF 复测头顶（drawable 可能稍晚就绪）
  layoutAndReport()
  requestAnimationFrame(() => {
    if (token !== layoutToken)
      return
    layoutAndReport()
  })
}

/**
 * 双击窗口区域切换通话状态
 */
async function toggleCall() {
  try {
    if (appStore.deviceState !== 'idle') {
      console.log('[Live2D] 挂断电话')
      await appStore.stopAutoConversation()
    }
    else {
      console.log('[Live2D] 拨打电话')
      await appStore.startAutoConversation()
    }
  }
  catch (error) {
    console.error('[Live2D] 切换通话状态失败', error)
  }
}

function isMouseOnModel(e: MouseEvent): boolean {
  if (!model || !containerRef.value)
    return false

  // 命中：全身 getBounds 保底（可拖身体）；可见网格仅在≈全身时收紧透明边
  const full = readModelBounds(model)
  const visible = measureVisibleModelBounds(model)
  const bounds = (
    visible && isVisibleFullBodyReliable(visible, full)
  )
    ? visible
    : full

  const rect = containerRef.value.getBoundingClientRect()
  // container 可能因主进程 pad 比 canvas 略大；事件坐标相对 container
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const pad = 2
  return (
    x >= bounds.x - pad
    && x <= bounds.x + bounds.width + pad
    && y >= bounds.y - pad
    && y <= bounds.y + bounds.height + pad
  )
}

function handleMouseDown(e: MouseEvent): void {
  // 仅左键拖拽；右键留给 contextmenu → 独立 Hover 菜单窗
  if (e.button !== 0)
    return

  if (isMouseOnModel(e)) {
    isDragging = true
    setLive2dClickThrough(false)
    window.api.hideHover()
    window.api.dragStart()

    const handleMouseMoveGlobal = () => {
      if (isDragging) {
        window.api.dragMove()
      }
    }

    const handleMouseUpGlobal = () => {
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
}

function handleMouseMove(e: MouseEvent): void {
  if (isDragging)
    return

  // 仅模型 bbox 上关穿透；透明区保持可点穿（Codex 式内容命中）
  const onModel = isMouseOnModel(e)
  setLive2dClickThrough(!onModel)
}

function handleMouseLeave(): void {
  if (isDragging)
    return
  setLive2dClickThrough(true)
}

/**
 * 模型上右键：显示与 Mini 相同的独立 Hover 菜单窗（屏幕坐标锚定，避免父窗裁切）
 */
function handleContextMenu(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()

  if (isDragging)
    return
  if (!isMouseOnModel(e))
    return

  setLive2dClickThrough(false)
  window.api.showHoverFor('live2d', e.screenX, e.screenY)
}

function handleDblClick(e: MouseEvent): void {
  if (!isMouseOnModel(e))
    return
  void toggleCall()
}

/**
 * 设置口型同步
 */
function setupLipSync(): void {
  // 监听音频音量数据
  removeAudioVolumeListener = window.api.live2dOnAudioVolume((volume: number) => {
    // 更新目标嘴巴开合度
    targetMouthValue = volume
  })

  // 启动平滑动画循环
  startLipSyncAnimation()
}

/**
 * 启动口型同步动画循环
 * 使用线性插值(lerp)实现平滑过渡
 */
function startLipSyncAnimation(): void {
  const animate = () => {
    if (!model) {
      lipSyncAnimationId = requestAnimationFrame(animate)
      return
    }

    // 平滑过渡: 使用线性插值 (lerp)
    // currentValue = currentValue + (targetValue - currentValue) * lerpFactor
    const lerpFactor = 0.5 // 平滑系数，从 0.3 提升到 0.5，加快响应速度

    currentMouthValue += (targetMouthValue - currentMouthValue) * lerpFactor

    // 设置 Live2D 嘴巴参数
    // ParamMouthOpenY: 嘴巴张开程度 (0=闭, 1=开)
    try {
      // @ts-expect-error - internalModel 是 pixi-live2d-display 的内部 API
      const coreModel = model?.internalModel?.coreModel
      if (coreModel && 'setParameterValueById' in coreModel) {
        // 使用 setParameterValueById 方法
        coreModel.setParameterValueById('ParamMouthOpenY', currentMouthValue)
      }
    }
    catch (error) {
      // 静默处理错误
      console.warn('[Live2D] 设置口型参数失败:', error)
    }

    // 继续动画循环
    lipSyncAnimationId = requestAnimationFrame(animate)
  }

  // 启动动画
  animate()
}
</script>

<template>
  <div
    ref="containerRef"
    class="live2d-container"
    :style="{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }"
  >
    <!--
      不绑定 canvas width/height 属性：PIXI autoDensity 会按 devicePixelRatio 写 backing store。
      Vue 若再写 CSS 像素属性，会把缓冲裁成「窄条/半身」。只同步 CSS 显示尺寸。
    -->
    <canvas
      id="live2d-canvas"
      ref="canvasRef"
      :style="{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }"
    />
  </div>
</template>

<style scoped>
.live2d-container {
  position: fixed;
  top: 0;
  left: 0;
  overflow: hidden;
  cursor: move;
  background: transparent;
  /* 视口随 displayWidth 缩放；全身 fit + 底对齐，不按 mesh 收缩 */
}

#live2d-canvas {
  display: block;
}

.debug-info {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px;
  border-radius: 5px;
  font-size: 12px;
  pointer-events: none;
  z-index: 1000;
  -webkit-app-region: no-drag;
}

.debug-info p {
  margin: 3px 0;
  font-family: monospace;
}

.debug-info .error {
  color: #ff6b6b;
  font-size: 11px;
  max-width: 250px;
  word-wrap: break-word;
}
</style>
