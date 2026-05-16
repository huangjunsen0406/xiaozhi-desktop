<script setup lang="ts">
import type { AppStateSnapshot, ServerMessage } from '@shared/types'
import * as pixiFnPatch from '@pixi/unsafe-eval'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import * as PIXI from 'pixi.js'
import { onMounted, onUnmounted, ref } from 'vue'

// @ts-expect-error - PIXI 需要挂载到 window
window.PIXI = PIXI
pixiFnPatch.install(PIXI)

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const canvasSize = { width: 200, height: 400 }
const bubbleText = ref('')

// 默认模型（首次加载或配置为空时使用）
const DEFAULT_MODEL = 'Hiyori'

let app: PIXI.Application | null = null
let model: Live2DModel | null = null
let isDragging = false
let currentModelId = '' // 当前加载的模型ID
let removeAudioVolumeListener: (() => void) | null = null
let removeModelChangedListener: (() => void) | null = null
let removeStateListener: (() => void) | null = null
let removeMessageListener: (() => void) | null = null
let bubbleTimer: ReturnType<typeof setTimeout> | null = null

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
    const modelId = await window.api?.modelGetCurrent()
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
    model.on('hit', (hitAreas: string[]) => {
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
 * 显示气泡文字
 */
function showBubble(text: string, autoHideMs = 0): void {
  if (bubbleTimer) {
    clearTimeout(bubbleTimer)
    bubbleTimer = null
  }
  bubbleText.value = text
  if (autoHideMs > 0) {
    bubbleTimer = setTimeout(() => {
      bubbleText.value = ''
      bubbleTimer = null
    }, autoHideMs)
  }
}

/**
 * 隐藏气泡
 */
function hideBubble(): void {
  if (bubbleTimer) {
    clearTimeout(bubbleTimer)
    bubbleTimer = null
  }
  bubbleText.value = ''
}

/**
 * 处理设备状态变更
 */
function handleStateChanged(state: AppStateSnapshot): void {
  const deviceState = state.deviceState
  if (deviceState === 'idle') {
    hideBubble()
  }
  else if (deviceState === 'connecting') {
    showBubble('🔗 连接中...')
  }
  else if (deviceState === 'listening') {
    showBubble('🎤 聆听中...')
  }
  // speaking 状态下等服务器消息内容填充
}

/**
 * 处理服务器消息（获取 AI 回复文字）
 */
function handleServerMessage(message: ServerMessage): void {
  if (message.type === 'tts' && message.state === 'sentence_start' && message.text) {
    showBubble(message.text, 5000)
  }
  else if (message.type === 'llm' && message.text) {
    showBubble(message.text, 5000)
  }
}

// 注册清理函数(必须在 async 之前)
onUnmounted(() => {
  if (containerRef.value) {
    containerRef.value.removeEventListener('mousemove', handleMouseMove)
    containerRef.value.removeEventListener('mousedown', handleMouseDown)
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
  // 移除状态和消息监听
  if (removeStateListener) {
    removeStateListener()
    removeStateListener = null
  }
  if (removeMessageListener) {
    removeMessageListener()
    removeMessageListener = null
  }
  if (bubbleTimer) {
    clearTimeout(bubbleTimer)
    bubbleTimer = null
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
    // 先创建 PIXI 应用
    app = new PIXI.Application({
      view: canvasRef.value,
      autoStart: true,
      autoDensity: true,
      width: canvasSize.width,
      height: canvasSize.height,
      resolution: window.devicePixelRatio,
      backgroundAlpha: 0,
    })
    console.log('PIXI Application created')
    status.value.app = true

    // 获取当前配置的模型并加载
    const modelId = await getCurrentModelId()
    await loadModel(modelId)

    // 监听鼠标移动事件(用于穿透控制)
    if (containerRef.value) {
      containerRef.value.addEventListener('mousemove', handleMouseMove)
      containerRef.value.addEventListener('mousedown', handleMouseDown)
    }

    // 启动口型同步
    setupLipSync()
    console.log('口型同步已启动')

    // 监听模型切换事件
    removeModelChangedListener = window.api?.modelOnChanged?.(handleModelChange) ?? null
    console.log('[Live2D] 模型切换监听已注册')

    // 监听设备状态变更
    removeStateListener = window.api?.appOnStateChanged?.(handleStateChanged) ?? null

    // 监听服务器消息
    removeMessageListener = window.api?.appOnServerMessage?.(handleServerMessage) ?? null
  }
  catch (error) {
    console.error('Failed to initialize', error)
    if (error instanceof Error) {
      console.error('Error details', error.message, error.stack)
      status.value.error = error.message
    }
  }
})

function setupModel(model: Live2DModel): void {
  // 计算缩放比例
  const bounds = model.getBounds()
  console.log('Model original bounds:', bounds)

  const scale = Math.min(
    canvasSize.width / bounds.width,
    canvasSize.height / bounds.height,
    1,
  )
  model.scale.set(scale)
  console.log('Model scale:', scale)

  // 更新边界并居中
  const newBounds = model.getBounds()
  model.x = (canvasSize.width - newBounds.width) / 2 - newBounds.x
  model.y = canvasSize.height - newBounds.height - newBounds.y // 底部对齐并居中

  console.log('Model positioned at:', { x: model.x, y: model.y })
}

function isMouseOnModel(e: MouseEvent): boolean {
  if (!model || !containerRef.value)
    return false

  const bounds = model.getBounds()
  const rect = containerRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height
}

function handleMouseDown(e: MouseEvent): void {
  if (isMouseOnModel(e)) {
    isDragging = true
    window.api?.dragStart()

    const handleMouseMoveGlobal = () => {
      if (isDragging) {
        window.api?.dragMove()
      }
    }

    const handleMouseUpGlobal = () => {
      if (isDragging) {
        isDragging = false
        window.api?.dragEnd()
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

  // 检查鼠标是否在模型范围内
  if (isMouseOnModel(e)) {
    // 鼠标在模型上,禁用穿透
    window.api?.setIgnoreMouseEvents(false)
  }
  else {
    // 鼠标不在模型上,启用穿透
    window.api?.setIgnoreMouseEvents(true)
  }
}

/**
 * 设置口型同步
 */
function setupLipSync(): void {
  // 监听音频音量数据
  removeAudioVolumeListener = window.api?.live2dOnAudioVolume?.((volume: number) => {
    // 更新目标嘴巴开合度
    targetMouthValue = volume
  }) ?? null

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
  <div ref="containerRef" class="live2d-container">
    <!-- 气泡区域 -->
    <Transition name="bubble">
      <div v-if="bubbleText" class="bubble">
        <div class="bubble-content">
          {{ bubbleText }}
        </div>
        <div class="bubble-arrow" />
      </div>
    </Transition>

    <canvas
      id="live2d-canvas"
      ref="canvasRef"
      :width="canvasSize.width"
      :height="canvasSize.height"
    />
  </div>
</template>

<style scoped>
.live2d-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 200px;
  height: 400px;
  overflow: hidden;
  cursor: move;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
}

#live2d-canvas {
  display: block;
  width: 100%;
  flex: 1;
}

/* 气泡 */
.bubble {
  max-width: 180px;
  margin-top: 8px;
  z-index: 10;
  pointer-events: none;
}

.bubble-content {
  background: white;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.4;
  color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

/* 深色模式 */
:global(.dark) .bubble-content {
  background: #2a2a2a;
  color: #ddd;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

/* 小三角箭头 */
.bubble-arrow {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid white;
  margin: 0 auto;
}

:global(.dark) .bubble-arrow {
  border-top-color: #2a2a2a;
}

/* 淡入淡出动画 */
.bubble-enter-active,
.bubble-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateY(4px);
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
