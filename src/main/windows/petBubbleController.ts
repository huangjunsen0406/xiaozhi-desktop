import type { DisplayMode, PetSurfaceContentSize, PetSurfaceId } from '@shared/types'
import type { BrowserWindow } from 'electron'
import { ipcMain, screen } from 'electron'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { isWindowDragging } from './behaviors/DragBehavior'
import { reassertPetSurfaceTop } from './petSurfaceLayering'

const logger = getLogger('PetBubbleController')

const BUBBLE_EDGE_MARGIN = 5
const BUBBLE_ARROW_HALF = 16

const PET_SURFACE_PAD: Record<PetSurfaceId, number> = {
  pets: 8,
  live2d: 4,
  bubble: 0,
}

const PET_SURFACE_MIN: Record<PetSurfaceId, { width: number, height: number }> = {
  pets: { width: 96, height: 104 },
  live2d: { width: 80, height: 80 },
  bubble: { width: 48, height: 28 },
}

const PET_SURFACE_MAX: Record<PetSurfaceId, { width: number, height: number }> = {
  pets: { width: 400, height: 480 },
  live2d: { width: 480, height: 820 },
  bubble: { width: 330, height: 200 },
}

function clampPetSurfaceSize(
  surface: PetSurfaceId,
  width: number,
  height: number,
): { width: number, height: number } {
  const pad = PET_SURFACE_PAD[surface] * 2
  const min = PET_SURFACE_MIN[surface]
  const max = PET_SURFACE_MAX[surface]
  return {
    width: Math.round(Math.min(max.width, Math.max(min.width, width + pad))),
    height: Math.round(Math.min(max.height, Math.max(min.height, height + pad))),
  }
}

/**
 * 将窗口位置夹进当前显示器 workArea，避免长高 Live2D 沉入 Dock 下无法拖回。
 */
export function clampWindowToWorkArea(win: BrowserWindow): boolean {
  if (win.isDestroyed())
    return false

  const bounds = win.getBounds()
  const wa = screen.getDisplayMatching(bounds).workArea
  const nextX = Math.round(
    bounds.width >= wa.width
      ? wa.x
      : Math.min(Math.max(bounds.x, wa.x), wa.x + wa.width - bounds.width),
  )
  const nextY = Math.round(
    bounds.height >= wa.height
      ? wa.y
      : Math.min(Math.max(bounds.y, wa.y), wa.y + wa.height - bounds.height),
  )

  if (nextX === bounds.x && nextY === bounds.y)
    return false

  win.setPosition(nextX, nextY)
  return true
}

export interface PetBubbleControllerDeps {
  getDisplayMode: () => DisplayMode
  getLive2dWindow: () => BrowserWindow | null
  getPetsWindow: () => BrowserWindow | null
  getBubbleWindow: () => BrowserWindow | null
  ensureBubbleWindow: () => BrowserWindow
}

export interface PetBubbleController {
  clampPetWindowToWorkAreaAndPersist: (win: BrowserWindow) => void
  setPetSurfaceContentSize: (surface: PetSurfaceId, size: PetSurfaceContentSize) => void
  hideBubbleWindow: () => void
  setupBubbleFollow: (targetWindow: BrowserWindow) => void
  clearBubbleFollow: () => void
  registerIpc: () => void
}

export function createPetBubbleController(deps: PetBubbleControllerDeps): PetBubbleController {
  let live2dAnchorOffsetY = 0
  let petsAnchorOffsetY = 0
  let currentBubbleTarget: BrowserWindow | null = null
  let currentBubbleMoveHandler: (() => void) | null = null
  let currentBubbleClosedHandler: (() => void) | null = null

  function getPetSurfaceWindow(surface: PetSurfaceId): BrowserWindow | null {
    if (surface === 'pets')
      return deps.getPetsWindow()
    if (surface === 'live2d')
      return deps.getLive2dWindow()
    return deps.getBubbleWindow()
  }

  function getCurrentPetWindow(): BrowserWindow | null {
    const mode = deps.getDisplayMode()
    if (mode === 'pets')
      return deps.getPetsWindow()
    if (mode === 'live2d')
      return deps.getLive2dWindow()
    return null
  }

  function getAnchorOffsetForTarget(target: BrowserWindow): number {
    if (target === deps.getLive2dWindow())
      return live2dAnchorOffsetY
    if (target === deps.getPetsWindow())
      return petsAnchorOffsetY
    return 0
  }

  function clampPetWindowToWorkAreaAndPersist(win: BrowserWindow): void {
    if (!clampWindowToWorkArea(win) || win.isDestroyed())
      return
    if (win !== deps.getLive2dWindow() && win !== deps.getPetsWindow())
      return
    try {
      const [x, y] = win.getPosition()
      const [w, h] = win.getSize()
      getDatabase().setWindowPosition('pet-shared', Math.round(x + w / 2), Math.round(y + h / 2))
    }
    catch (error) {
      logger.warn('保存 pet-shared 中心失败（workArea clamp）', error)
    }
  }

  function positionBubbleAbove(targetWindow: BrowserWindow): void {
    const bubble = deps.getBubbleWindow()
    if (!bubble || bubble.isDestroyed() || targetWindow.isDestroyed())
      return

    const [x, y] = targetWindow.getPosition()
    const [w] = targetWindow.getSize()
    const [bw, bh] = bubble.getSize()
    const anchorOffset = getAnchorOffsetForTarget(targetWindow)

    const targetCenterX = x + w / 2
    const desiredBubbleX = targetCenterX - bw / 2
    const workArea = screen.getDisplayMatching(targetWindow.getBounds()).workArea
    const minX = workArea.x + BUBBLE_EDGE_MARGIN
    const maxX = workArea.x + workArea.width - bw - BUBBLE_EDGE_MARGIN
    const bubbleX = Math.round(
      maxX < minX ? minX : Math.min(Math.max(desiredBubbleX, minX), maxX),
    )
    const bubbleY = Math.round(y + anchorOffset - bh - 4)

    bubble.setPosition(bubbleX, bubbleY)

    const arrowMin = BUBBLE_ARROW_HALF
    const arrowMax = Math.max(arrowMin, bw - BUBBLE_ARROW_HALF)
    const arrowX = Math.round(Math.min(Math.max(targetCenterX - bubbleX, arrowMin), arrowMax))
    bubble.webContents.send('bubble:set-arrow-x', arrowX)
  }

  function showBubbleAbove(targetWindow: BrowserWindow): void {
    const bubble = deps.ensureBubbleWindow()
    positionBubbleAbove(targetWindow)
    reassertPetSurfaceTop(bubble)
    bubble.showInactive()
  }

  function hideBubbleWindow(): void {
    const bubble = deps.getBubbleWindow()
    if (bubble && !bubble.isDestroyed())
      bubble.hide()
  }

  function clearBubbleFollow(): void {
    if (currentBubbleTarget && !currentBubbleTarget.isDestroyed()) {
      if (currentBubbleMoveHandler)
        currentBubbleTarget.removeListener('move', currentBubbleMoveHandler)
      if (currentBubbleClosedHandler)
        currentBubbleTarget.removeListener('closed', currentBubbleClosedHandler)
    }
    currentBubbleTarget = null
    currentBubbleMoveHandler = null
    currentBubbleClosedHandler = null
  }

  function setupBubbleFollow(targetWindow: BrowserWindow): void {
    if (currentBubbleTarget === targetWindow) {
      if (deps.getBubbleWindow()?.isVisible())
        positionBubbleAbove(targetWindow)
      return
    }

    clearBubbleFollow()
    currentBubbleTarget = targetWindow

    currentBubbleMoveHandler = (): void => {
      const bubble = deps.getBubbleWindow()
      if (!bubble || bubble.isDestroyed() || !bubble.isVisible() || targetWindow.isDestroyed())
        return
      positionBubbleAbove(targetWindow)
    }

    currentBubbleClosedHandler = (): void => {
      clearBubbleFollow()
      hideBubbleWindow()
    }

    targetWindow.on('move', currentBubbleMoveHandler)
    targetWindow.once('closed', currentBubbleClosedHandler)

    const bubble = deps.getBubbleWindow()
    if (bubble && !bubble.isDestroyed() && bubble.isVisible())
      positionBubbleAbove(targetWindow)
  }

  function setPetSurfaceContentSize(surface: PetSurfaceId, size: PetSurfaceContentSize): void {
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height))
      return
    if (size.width <= 0 || size.height <= 0)
      return

    if (typeof size.anchorOffsetY === 'number' && Number.isFinite(size.anchorOffsetY)) {
      const offset = Math.max(0, size.anchorOffsetY)
      if (surface === 'live2d')
        live2dAnchorOffsetY = offset
      else if (surface === 'pets')
        petsAnchorOffsetY = offset
    }

    const win = getPetSurfaceWindow(surface)
    if (!win || win.isDestroyed())
      return

    const next = clampPetSurfaceSize(surface, size.width, size.height)
    const [currentCW, currentCH] = win.getContentSize()
    const sizeChanged = currentCW !== next.width || currentCH !== next.height

    if (surface === 'bubble') {
      if (sizeChanged)
        win.setContentSize(next.width, next.height)
      if (currentBubbleTarget && !currentBubbleTarget.isDestroyed() && win.isVisible())
        positionBubbleAbove(currentBubbleTarget)
      return
    }

    if (sizeChanged) {
      if (isWindowDragging(win)) {
        win.setContentSize(next.width, next.height)
      }
      else {
        const [x, y] = win.getPosition()
        const cx = x + currentCW / 2
        const cy = y + currentCH / 2
        win.setContentSize(next.width, next.height)
        win.setPosition(Math.round(cx - next.width / 2), Math.round(cy - next.height / 2))
        try {
          getDatabase().setWindowPosition('pet-shared', Math.round(cx), Math.round(cy))
        }
        catch (error) {
          logger.warn('保存 pet-shared 中心失败（content resize）', error)
        }
      }
    }

    if (!isWindowDragging(win))
      clampPetWindowToWorkAreaAndPersist(win)

    if (currentBubbleTarget === win && deps.getBubbleWindow()?.isVisible())
      positionBubbleAbove(win)
  }

  function registerIpc(): void {
    ipcMain.on('bubble:show', () => {
      const target = getCurrentPetWindow()
      if (target)
        showBubbleAbove(target)
    })

    ipcMain.on('bubble:hide', () => {
      hideBubbleWindow()
    })

    ipcMain.on('bubble:set-anchor-offset', (_event, offsetY: number) => {
      if (typeof offsetY !== 'number' || !Number.isFinite(offsetY))
        return
      live2dAnchorOffsetY = Math.max(0, offsetY)
      if (currentBubbleTarget && currentBubbleTarget === deps.getLive2dWindow()) {
        const bubble = deps.getBubbleWindow()
        if (bubble && !bubble.isDestroyed() && bubble.isVisible())
          positionBubbleAbove(currentBubbleTarget)
      }
    })

    ipcMain.on('pet-shell:set-content-size', (_event, surfaceUnknown: unknown, sizeUnknown: unknown) => {
      if (surfaceUnknown !== 'pets' && surfaceUnknown !== 'live2d' && surfaceUnknown !== 'bubble')
        return
      if (sizeUnknown == null || typeof sizeUnknown !== 'object')
        return
      const raw = sizeUnknown as Record<string, unknown>
      if (typeof raw.width !== 'number' || typeof raw.height !== 'number')
        return
      const size: PetSurfaceContentSize = {
        width: raw.width,
        height: raw.height,
        ...(typeof raw.anchorOffsetY === 'number' && Number.isFinite(raw.anchorOffsetY)
          ? { anchorOffsetY: raw.anchorOffsetY }
          : {}),
      }
      setPetSurfaceContentSize(surfaceUnknown, size)
    })
  }

  return {
    clampPetWindowToWorkAreaAndPersist,
    setPetSurfaceContentSize,
    hideBubbleWindow,
    setupBubbleFollow,
    clearBubbleFollow,
    registerIpc,
  }
}
