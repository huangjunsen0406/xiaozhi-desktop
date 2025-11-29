<script setup lang="ts">
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

// 模型配置 - 只需修改这里的文件夹名称即可切换模型
const MODEL_FOLDER = 'Hiyori' // 可选: Haru, Hiyori, Mao, Mark, Natori, Rice, Wanko, hiyori_pro_zh, samoyedog

let app: PIXI.Application | null = null
let model: Live2DModel | null = null
let isDragging = false

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
  window.api?.live2dRemoveAudioVolumeListener()
})

onMounted(async () => {
  console.log('[Live2D] Component mounted')
  console.log('[Live2D] Canvas ref:', canvasRef.value)
  console.log('[Live2D] Container ref:', containerRef.value)

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
    console.log('[Live2D] PIXI Application created')
    status.value.app = true

    // 加载 Live2D 模型
    const modelPath = `/Resources/${MODEL_FOLDER}/model.json`
    console.log('[Live2D] Loading model from:', modelPath)

    model = await Live2DModel.from(modelPath)
    console.log('[Live2D] Model loaded successfully:', model)
    status.value.model = true

    // 添加模型到舞台
    app.stage.addChild(model)
    setupModel(model)
    console.log('[Live2D] Model added to stage')

    // 监听模型点击事件
    model.on('hit', (hitAreas: string[]) => {
      console.log('[Live2D] Hit areas:', hitAreas)
    })

    // 监听鼠标移动事件(用于穿透控制)
    if (containerRef.value) {
      containerRef.value.addEventListener('mousemove', handleMouseMove)
      containerRef.value.addEventListener('mousedown', handleMouseDown)
    }

    // 启动口型同步
    setupLipSync()
    console.log('[Live2D] 口型同步已启动')
  }
  catch (error) {
    console.error('[Live2D] Failed to initialize:', error)
    if (error instanceof Error) {
      console.error('[Live2D] Error details:', error.message, error.stack)
      status.value.error = error.message
    }
  }
})

function setupModel(model: Live2DModel): void {
  // 计算缩放比例
  const bounds = model.getBounds()
  console.log('[Live2D] Model original bounds:', bounds)

  const scale = Math.min(
    canvasSize.width / bounds.width,
    canvasSize.height / bounds.height,
    1,
  )
  model.scale.set(scale)
  console.log('[Live2D] Model scale:', scale)

  // 更新边界并居中
  const newBounds = model.getBounds()
  model.x = (canvasSize.width - newBounds.width) / 2 - newBounds.x
  model.y = canvasSize.height - newBounds.height - newBounds.y // 底部对齐并居中

  console.log('[Live2D] Model positioned at:', { x: model.x, y: model.y })
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
  window.api?.live2dOnAudioVolume((volume: number) => {
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
    const lerpFactor = 0.3 // 平滑系数,越大越快,越小越平滑

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
}

#live2d-canvas {
  display: block;
  width: 100%;
  height: 100%;
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
