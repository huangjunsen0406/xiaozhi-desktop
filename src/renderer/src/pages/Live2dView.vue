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
import { usePetSurfaceShell } from '../composables/usePetSurfaceShell'
import {
  isVisibleFullBodyReliable,
  isVisibleHeadAnchorReliable,
  measureVisibleModelBounds,
  readModelBounds,
} from '../utils/live2dBounds'

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
const canvasSize: Ref<{ width: number, height: number }> = ref(
  live2dViewportFromDisplayWidth(PET_DISPLAY_WIDTH_DEFAULT),
)

const DEFAULT_MODEL = 'Hiyori'

let app: PIXI.Application | null = null
let model: Live2DModel | null = null
let currentModelId = ''
let layoutToken = 0
let currentMouthValue = 0
let targetMouthValue = 0
let lipSyncAnimationId: number | null = null
const cleanups: Array<() => void> = []

const shell = usePetSurfaceShell({
  surface: 'live2d',
  isHit: isMouseOnModel,
  onDisplayWidthChange: applyDisplayWidth,
})

function getViewport(): { width: number, height: number } {
  return canvasSize.value
}

async function getCurrentModelId(): Promise<string> {
  try {
    return (await window.api.modelGetCurrent()) || DEFAULT_MODEL
  }
  catch (error) {
    console.warn('[Live2D] 获取当前模型配置失败，使用默认模型', error)
    return DEFAULT_MODEL
  }
}

async function loadModel(modelId: string): Promise<void> {
  if (!app) {
    console.error('[Live2D] PIXI Application 未初始化')
    return
  }

  if (modelId === currentModelId && model)
    return

  if (model) {
    app.stage.removeChild(model)
    model.destroy()
    model = null
  }

  try {
    model = await Live2DModel.from(`live2d-model://${modelId}/model.json`)
    currentModelId = modelId
    app.stage.addChild(model)
    setupModel(model)
  }
  catch (error) {
    console.error('[Live2D] 加载模型失败:', error)
    if (modelId !== DEFAULT_MODEL)
      await loadModel(DEFAULT_MODEL)
  }
}

async function handleModelChange(newModelId: string): Promise<void> {
  if (newModelId && newModelId !== currentModelId)
    await loadModel(newModelId)
}

/**
 * 同步 PIXI 渲染缓冲到当前逻辑视口（CSS px）。
 * 只走 renderer.resize；禁止 Vue 写 canvas width/height 属性。
 */
function resizeRendererToViewport(viewport: { width: number, height: number }): void {
  if (!app)
    return
  try {
    if (app.screen.width === viewport.width && app.screen.height === viewport.height)
      return
    app.renderer.resize(viewport.width, viewport.height)
  }
  catch (error) {
    console.warn('[Live2D] resize renderer 失败', error)
  }
}

function applyDisplayWidth(width: number): void {
  const next = clampPetDisplayWidth(width)
  const viewport = live2dViewportFromDisplayWidth(next)
  canvasSize.value = viewport

  resizeRendererToViewport(viewport)
  if (model)
    setupModel(model)
  else
    reportFixedViewportContentSize(0)
}

function reportFixedViewportContentSize(headOffsetY: number): void {
  const viewport = getViewport()
  const anchorY = Math.max(0, Math.min(Math.round(headOffsetY), viewport.height))
  window.api.bubbleSetContentSize('live2d', {
    width: viewport.width,
    height: viewport.height,
    anchorOffsetY: anchorY,
  })
}

/**
 * 经典 framing：整身 fit 进当前视口，水平居中、垂直底对齐。
 */
function setupModel(modelInstance: Live2DModel): void {
  layoutToken += 1
  const token = layoutToken
  const viewport = getViewport()

  resizeRendererToViewport(viewport)

  modelInstance.scale.set(1)
  modelInstance.position.set(0, 0)
  const anchorPoint = (modelInstance as unknown as {
    anchor?: { set?: (x: number, y: number) => void }
  }).anchor
  anchorPoint?.set?.(0, 0)

  const rawBounds = readModelBounds(modelInstance)
  if (
    !Number.isFinite(rawBounds.width)
    || !Number.isFinite(rawBounds.height)
    || rawBounds.width < 2
    || rawBounds.height < 2
  ) {
    reportFixedViewportContentSize(0)
    requestAnimationFrame(() => {
      if (token !== layoutToken || model !== modelInstance)
        return
      setupModel(modelInstance)
    })
    return
  }

  const scale = Math.min(
    viewport.width / rawBounds.width,
    viewport.height / rawBounds.height,
  )
  if (!Number.isFinite(scale) || scale <= 0) {
    reportFixedViewportContentSize(0)
    return
  }
  modelInstance.scale.set(scale)

  const layoutAndReport = (): void => {
    if (token !== layoutToken || model !== modelInstance)
      return

    const vp = getViewport()
    modelInstance.position.set(0, 0)

    const scaled = readModelBounds(modelInstance)
    modelInstance.x = (vp.width - scaled.width) / 2 - scaled.x
    modelInstance.y = vp.height - scaled.height - scaled.y

    const framed = readModelBounds(modelInstance)
    let headOffsetY = Math.max(0, Math.round(framed.y))
    const visible = measureVisibleModelBounds(modelInstance)
    if (visible && isVisibleHeadAnchorReliable(visible, framed))
      headOffsetY = Math.max(0, Math.round(visible.y))

    reportFixedViewportContentSize(headOffsetY)
  }

  layoutAndReport()
  requestAnimationFrame(() => {
    if (token === layoutToken)
      layoutAndReport()
  })
}

function isMouseOnModel(e: MouseEvent): boolean {
  if (!model || !containerRef.value)
    return false

  const full = readModelBounds(model)
  const visible = measureVisibleModelBounds(model)
  const bounds = (visible && isVisibleFullBodyReliable(visible, full)) ? visible : full

  const rect = containerRef.value.getBoundingClientRect()
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

function setupLipSync(): void {
  cleanups.push(window.api.live2dOnAudioVolume((volume: number) => {
    targetMouthValue = volume
  }))

  const animate = (): void => {
    if (model) {
      currentMouthValue += (targetMouthValue - currentMouthValue) * 0.5
      try {
        // @ts-expect-error - internalModel 是 pixi-live2d-display 的内部 API
        const coreModel = model?.internalModel?.coreModel
        if (coreModel && 'setParameterValueById' in coreModel)
          coreModel.setParameterValueById('ParamMouthOpenY', currentMouthValue)
      }
      catch (error) {
        console.warn('[Live2D] 设置口型参数失败:', error)
      }
    }
    lipSyncAnimationId = requestAnimationFrame(animate)
  }

  animate()
}

onUnmounted(() => {
  if (app) {
    app.destroy(true)
    app = null
  }
  if (lipSyncAnimationId !== null) {
    cancelAnimationFrame(lipSyncAnimationId)
    lipSyncAnimationId = null
  }
  for (const cleanup of cleanups.splice(0))
    cleanup()
})

onMounted(async () => {
  if (!canvasRef.value) {
    console.error('[Live2D] Canvas element not found')
    return
  }

  try {
    const width = await shell.initDisplayWidth()
    const initialViewport = live2dViewportFromDisplayWidth(width)
    canvasSize.value = initialViewport

    app = new PIXI.Application({
      view: canvasRef.value,
      autoStart: true,
      autoDensity: true,
      width: initialViewport.width,
      height: initialViewport.height,
      resolution: window.devicePixelRatio,
      backgroundAlpha: 0,
    })

    const modelId = await getCurrentModelId()
    await loadModel(modelId)

    shell.setClickThrough(true)
    setupLipSync()
    cleanups.push(window.api.modelOnChanged(handleModelChange))
  }
  catch (error) {
    console.error('[Live2D] 初始化失败:', error)
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="live2d-container"
    :style="{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }"
    v-on="shell.handlers"
  >
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
}

#live2d-canvas {
  display: block;
}
</style>
