import type { Live2DModel } from 'pixi-live2d-display/cubism4'

export interface ModelBounds {
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
export function readModelBounds(modelInstance: Live2DModel): ModelBounds {
  syncModelWorldTransform(modelInstance)
  const getter = modelInstance.getBounds as unknown as (
    skipUpdate?: boolean,
  ) => { x: number, y: number, width: number, height: number }
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
export function measureVisibleModelBounds(modelInstance: Live2DModel): ModelBounds | null {
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
      const lx = local.a * dx + local.c * dy + local.tx
      const ly = local.b * dx + local.d * dy + local.ty
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
export function isVisibleHeadAnchorReliable(visible: ModelBounds, full: ModelBounds): boolean {
  if (visible.width <= 1 || visible.height <= 1)
    return false
  const fullArea = boundsArea(full)
  const visArea = boundsArea(visible)
  if (fullArea <= 0 || visArea <= 0)
    return false
  if (visArea > fullArea * 1.5)
    return false
  if (visible.y < full.y - 8)
    return false
  if (visible.y > full.y + full.height)
    return false
  return true
}

/**
 * 可见 AABB 是否足以代表全身（命中测试用）。面积过小则退回 full，避免只能拖头。
 */
export function isVisibleFullBodyReliable(visible: ModelBounds, full: ModelBounds): boolean {
  if (!isVisibleHeadAnchorReliable(visible, full))
    return false
  return boundsArea(visible) >= boundsArea(full) * 0.5
}
