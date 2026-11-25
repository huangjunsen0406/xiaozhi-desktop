import type { DisplayMode, PetSurfaceContentSize, PetSurfaceId } from '@shared/types'
import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import process from 'node:process'
import { isDisplayMode } from '@shared/types'
import { hide as hideHover } from '../hover/controller'
import { getDatabase } from '../services/database'
import { broadcastToWindows } from '../utils/broadcast'
import { getLogger } from '../utils/logger'
import { getDisplayModeFile } from '../utils/paths'
import {
  buildActivationWindow,
  buildBackgroundAudioWindow,
  buildBubbleWindow,
  buildChatWindow,
  buildLive2dWindow,
  buildMainWindow,
  buildMiniWindow,
  buildPanelWindow,
  buildPetsWindow,
  buildSettingsWindow,
} from './builders'
import { clampWindowToWorkArea, createPetBubbleController } from './petBubbleController'
import { reassertPetSurfaceTop } from './petSurfaceLayering'

const logger = getLogger('WindowManager')

const windowRefs = {
  main: { current: null as BrowserWindow | null },
  mini: { current: null as BrowserWindow | null },
  panel: { current: null as BrowserWindow | null },
  activation: { current: null as BrowserWindow | null },
  settings: { current: null as BrowserWindow | null },
  backgroundAudio: { current: null as BrowserWindow | null },
  chat: { current: null as BrowserWindow | null },
  live2d: { current: null as BrowserWindow | null },
  pets: { current: null as BrowserWindow | null },
  bubble: { current: null as BrowserWindow | null },
}

export type { DisplayMode } from '@shared/types'

function saveDisplayMode(mode: DisplayMode): void {
  try {
    fs.writeFileSync(getDisplayModeFile(), JSON.stringify({ mode }), 'utf-8')
  }
  catch (error) {
    logger.warn('保存显示模式失败', error)
  }
}

function loadDisplayMode(): DisplayMode {
  try {
    const data = JSON.parse(fs.readFileSync(getDisplayModeFile(), 'utf-8'))
    const mode = data?.mode
    return isDisplayMode(mode) ? mode : 'main'
  }
  catch {
    return 'main'
  }
}

let currentDisplayMode: DisplayMode = loadDisplayMode()
const displayModeListeners = new Set<(mode: DisplayMode, prev: DisplayMode) => void>()
let isQuitting = false

export function getCurrentDisplayMode(): DisplayMode {
  return currentDisplayMode
}

function setDisplayMode(mode: DisplayMode): void {
  if (currentDisplayMode === mode)
    return
  const prev = currentDisplayMode
  currentDisplayMode = mode
  saveDisplayMode(mode)
  logger.info(`显示模式已切换: ${mode}`)

  for (const listener of displayModeListeners) {
    try {
      listener(mode, prev)
    }
    catch (error) {
      logger.warn('显示模式变更监听失败', error)
    }
  }

  broadcastToWindows('window:display-mode-changed', mode)
}

export function onDisplayModeChange(
  callback: (mode: DisplayMode, prev: DisplayMode) => void,
): () => void {
  displayModeListeners.add(callback)
  return () => {
    displayModeListeners.delete(callback)
  }
}

type PositionConfig
  = | { type: 'corner', key: string }
    | { type: 'center-shared', key: string }

interface WindowEnsurerOptions {
  position?: PositionConfig
  closePolicy?: 'darwin-hide' | 'always-hide'
}

function handleWindowClose(event: Electron.Event, win: BrowserWindow): void {
  if (process.platform === 'darwin' && !isQuitting) {
    event.preventDefault()
    win.hide()
  }
}

function bindDebouncedPositionSave(
  win: BrowserWindow,
  key: string,
  computePosition: () => { x: number, y: number },
): void {
  let timer: NodeJS.Timeout | null = null
  const flush = (): void => {
    timer = null
    if (win.isDestroyed())
      return
    const { x, y } = computePosition()
    try {
      getDatabase().setWindowPosition(key, x, y)
    }
    catch (error) {
      logger.warn(`保存窗口位置失败 (${key})`, error)
    }
  }

  win.on('move', () => {
    if (win.isDestroyed())
      return
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(flush, 300)
  })

  win.once('closed', () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  })
}

function computeSeedPosition(newWin: BrowserWindow): { x: number, y: number } | null {
  const [nw, nh] = newWin.getSize()
  const order: DisplayMode[] = [currentDisplayMode, 'pets', 'live2d', 'main', 'chat']
  const ref = order
    .map(mode => windowRefs[mode].current)
    .find(w => w && !w.isDestroyed() && w !== newWin)

  if (!ref)
    return null
  const [x, y] = ref.getPosition()
  const [w, h] = ref.getSize()
  return {
    x: Math.round(x + w / 2 - nw / 2),
    y: Math.round(y + h / 2 - nh / 2),
  }
}

function setupPositionMemory(win: BrowserWindow, key: string): void {
  const db = getDatabase()
  try {
    const saved = db.getWindowPosition(key)
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      win.setPosition(saved.x, saved.y)
    }
    else {
      const seed = computeSeedPosition(win)
      if (seed) {
        win.setPosition(seed.x, seed.y)
        db.setWindowPosition(key, seed.x, seed.y)
      }
    }
  }
  catch (error) {
    logger.warn(`读取窗口位置失败 (${key})`, error)
  }

  bindDebouncedPositionSave(win, key, () => {
    const [x, y] = win.getPosition()
    return { x, y }
  })
}

function createWindowEnsurer(
  windowRef: { current: BrowserWindow | null },
  builder: () => BrowserWindow,
  options: WindowEnsurerOptions = {},
): () => BrowserWindow {
  return () => {
    if (windowRef.current == null || windowRef.current.isDestroyed()) {
      const win = builder()
      windowRef.current = win
      win.on('closed', () => {
        if (windowRef.current === win)
          windowRef.current = null
      })
      if (options.closePolicy === 'darwin-hide') {
        win.on('close', event => handleWindowClose(event, win))
      }
      else if (options.closePolicy === 'always-hide') {
        win.on('close', (event) => {
          if (!isQuitting) {
            event.preventDefault()
            win.hide()
          }
        })
      }
      if (options.position) {
        if (options.position.type === 'corner')
          setupPositionMemory(win, options.position.key)
        else
          setupSharedCenterPosition(win, options.position.key)
      }
    }
    return windowRef.current as BrowserWindow
  }
}

export const ensureMainWindow = createWindowEnsurer(
  windowRefs.main,
  buildMainWindow,
  { position: { type: 'corner', key: 'main' }, closePolicy: 'darwin-hide' },
)
export const ensureMiniWindow = createWindowEnsurer(windowRefs.mini, buildMiniWindow, { closePolicy: 'darwin-hide' })
export const ensurePanelWindow = createWindowEnsurer(windowRefs.panel, buildPanelWindow)
export const ensureActivationWindow = createWindowEnsurer(windowRefs.activation, buildActivationWindow)
export const ensureSettingsWindow = createWindowEnsurer(windowRefs.settings, buildSettingsWindow, { closePolicy: 'always-hide' })
export const ensureBackgroundAudioWindow = createWindowEnsurer(windowRefs.backgroundAudio, buildBackgroundAudioWindow)
export const ensureChatWindow = createWindowEnsurer(
  windowRefs.chat,
  buildChatWindow,
  { position: { type: 'corner', key: 'chat' }, closePolicy: 'darwin-hide' },
)
export const ensureLive2dWindow = createWindowEnsurer(
  windowRefs.live2d,
  buildLive2dWindow,
  { position: { type: 'center-shared', key: 'pet-shared' }, closePolicy: 'darwin-hide' },
)
export const ensurePetsWindow = createWindowEnsurer(
  windowRefs.pets,
  buildPetsWindow,
  { position: { type: 'center-shared', key: 'pet-shared' }, closePolicy: 'darwin-hide' },
)
export const ensureBubbleWindow = createWindowEnsurer(windowRefs.bubble, buildBubbleWindow, { closePolicy: 'darwin-hide' })

export function getMainWindow(): BrowserWindow | null {
  return windowRefs.main.current
}

export function getBackgroundAudioWindow(): BrowserWindow | null {
  return windowRefs.backgroundAudio.current
}

export function getChatWindow(): BrowserWindow | null {
  return windowRefs.chat.current
}

export function getLive2dWindow(): BrowserWindow | null {
  return windowRefs.live2d.current
}

export function getPetsWindow(): BrowserWindow | null {
  return windowRefs.pets.current
}

export function getBubbleWindow(): BrowserWindow | null {
  return windowRefs.bubble.current
}

const petBubble = createPetBubbleController({
  getDisplayMode: () => currentDisplayMode,
  getLive2dWindow,
  getPetsWindow,
  getBubbleWindow,
  ensureBubbleWindow,
})
petBubble.registerIpc()

export function setPetSurfaceContentSize(surface: PetSurfaceId, size: PetSurfaceContentSize): void {
  petBubble.setPetSurfaceContentSize(surface, size)
}

export function hideBubbleWindow(): void {
  petBubble.hideBubbleWindow()
}

function applySharedCenterPosition(win: BrowserWindow, key: string): boolean {
  if (win.isDestroyed())
    return false
  try {
    const saved = getDatabase().getWindowPosition(key)
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const [w, h] = win.getSize()
      win.setPosition(Math.round(saved.x - w / 2), Math.round(saved.y - h / 2))
      if (key === 'pet-shared')
        petBubble.clampPetWindowToWorkAreaAndPersist(win)
      else
        clampWindowToWorkArea(win)
      return true
    }
  }
  catch (error) {
    logger.warn(`应用共享位置失败 (${key})`, error)
  }
  return false
}

function setupSharedCenterPosition(win: BrowserWindow, key: string): void {
  if (!applySharedCenterPosition(win, key)) {
    const seed = computeSeedPosition(win)
    if (seed) {
      win.setPosition(seed.x, seed.y)
      if (key === 'pet-shared')
        petBubble.clampPetWindowToWorkAreaAndPersist(win)
      else
        clampWindowToWorkArea(win)
      const [x, y] = win.getPosition()
      const [w, h] = win.getSize()
      try {
        getDatabase().setWindowPosition(key, Math.round(x + w / 2), Math.round(y + h / 2))
      }
      catch (error) {
        logger.warn(`保存共享窗口位置种子失败 (${key})`, error)
      }
    }
  }

  bindDebouncedPositionSave(win, key, () => {
    const [x, y] = win.getPosition()
    const [w, h] = win.getSize()
    return { x: Math.round(x + w / 2), y: Math.round(y + h / 2) }
  })
}

const ALL_DISPLAY_MODES: readonly DisplayMode[] = ['main', 'mini', 'chat', 'live2d', 'pets']

function hideOtherModeWindows(keep: DisplayMode, hidePanelAndHover = true): void {
  for (const mode of ALL_DISPLAY_MODES) {
    if (mode !== keep)
      windowRefs[mode].current?.hide()
  }
  if (hidePanelAndHover) {
    windowRefs.panel.current?.hide()
    hideHover()
  }
}

function toggleToPetSurface(mode: 'live2d' | 'pets'): void {
  const win = mode === 'live2d' ? ensureLive2dWindow() : ensurePetsWindow()
  applySharedCenterPosition(win, 'pet-shared')
  petBubble.clampPetWindowToWorkAreaAndPersist(win)
  reassertPetSurfaceTop(win)
  win.showInactive()
  hideOtherModeWindows(mode)
  ensureBubbleWindow()
  petBubble.setupBubbleFollow(win)
  setDisplayMode(mode)
}

export function toggleToMini(): void {
  ensureMiniWindow().show()
  hideOtherModeWindows('mini', false)
  petBubble.hideBubbleWindow()
  petBubble.clearBubbleFollow()
  setDisplayMode('mini')
}

export function toggleToMain(): void {
  ensureMainWindow().show()
  hideOtherModeWindows('main')
  petBubble.hideBubbleWindow()
  petBubble.clearBubbleFollow()
  setDisplayMode('main')
}

export function toggleToChat(): void {
  const chat = ensureChatWindow()
  chat.show()
  chat.focus()
  hideOtherModeWindows('chat')
  petBubble.hideBubbleWindow()
  petBubble.clearBubbleFollow()
  setDisplayMode('chat')
}

export function toggleToLive2d(): void {
  toggleToPetSurface('live2d')
}

export function toggleToPets(): void {
  toggleToPetSurface('pets')
}

export function togglePanel(): void {
  const panel = ensurePanelWindow()
  if (panel.isVisible())
    panel.hide()
  else
    panel.show()
}

export function showActivation(): void {
  const win = ensureActivationWindow()
  win.center()
  win.show()
  win.moveTop()
}

export function hideActivation(): void {
  const win = windowRefs.activation.current
  if (win && !win.isDestroyed())
    win.hide()
}

const settingsReadyWindows = new WeakSet<BrowserWindow>()
let settingsPendingShow = false
let settingsShowFallbackTimer: NodeJS.Timeout | null = null
let settingsShowOnReady: (() => void) | null = null
const SETTINGS_SHOW_FALLBACK_MS = 3000

function clearSettingsPendingTimers(win: BrowserWindow): void {
  if (settingsShowFallbackTimer) {
    clearTimeout(settingsShowFallbackTimer)
    settingsShowFallbackTimer = null
  }
  if (settingsShowOnReady && !win.isDestroyed())
    win.webContents.removeListener('did-finish-load', settingsShowOnReady)
  settingsShowOnReady = null
}

function showSettingsFocused(win: BrowserWindow): void {
  if (win.isDestroyed())
    return
  settingsPendingShow = false
  clearSettingsPendingTimers(win)
  settingsReadyWindows.add(win)
  if (win.isMinimized())
    win.restore()
  win.show()
  win.focus()
  win.moveTop()
}

export function toggleSettings(): void {
  const win = ensureSettingsWindow()

  if (win.isVisible() && !settingsPendingShow) {
    win.hide()
    return
  }

  if (settingsPendingShow) {
    settingsPendingShow = false
    clearSettingsPendingTimers(win)
    if (!settingsReadyWindows.has(win) && !win.isDestroyed()) {
      if (!win.webContents.isLoading()) {
        settingsReadyWindows.add(win)
      }
      else {
        win.webContents.once('did-finish-load', () => {
          if (!win.isDestroyed())
            settingsReadyWindows.add(win)
        })
      }
    }
    return
  }

  if (settingsReadyWindows.has(win) || !win.webContents.isLoading()) {
    showSettingsFocused(win)
    return
  }

  settingsPendingShow = true
  const onReady = (): void => {
    settingsShowOnReady = null
    clearSettingsPendingTimers(win)
    if (win.isDestroyed())
      return
    settingsReadyWindows.add(win)
    if (settingsPendingShow)
      showSettingsFocused(win)
  }

  clearSettingsPendingTimers(win)
  settingsShowOnReady = onReady
  win.webContents.once('did-finish-load', onReady)
  settingsShowFallbackTimer = setTimeout(() => {
    settingsShowFallbackTimer = null
    clearSettingsPendingTimers(win)
    if (settingsPendingShow && !win.isDestroyed())
      showSettingsFocused(win)
  }, SETTINGS_SHOW_FALLBACK_MS)
}

export function getCurrentModeWindow(): BrowserWindow | null {
  return windowRefs[currentDisplayMode]?.current ?? windowRefs.main.current
}

export function restoreCurrentModeWindow(): void {
  const ensureWindow = {
    main: ensureMainWindow,
    mini: ensureMiniWindow,
    chat: ensureChatWindow,
    live2d: ensureLive2dWindow,
    pets: ensurePetsWindow,
  }[currentDisplayMode]
  const win = ensureWindow()
  if (win.isMinimized())
    win.restore()

  if (currentDisplayMode === 'live2d' || currentDisplayMode === 'pets') {
    petBubble.clampPetWindowToWorkAreaAndPersist(win)
    reassertPetSurfaceTop(win)
    win.showInactive()
    const bubble = ensureBubbleWindow()
    petBubble.setupBubbleFollow(win)
    if (bubble.isVisible())
      reassertPetSurfaceTop(bubble)
    return
  }

  win.show()
  win.focus()
  win.moveTop()
}

export function setIsQuitting(value: boolean): void {
  isQuitting = value
}
