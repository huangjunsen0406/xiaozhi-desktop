import type { BubbleLocalShowPayload } from '@shared/types'
import type { BrowserWindow, IpcMainEvent, WebContents } from 'electron'
import { ipcMain, Notification } from 'electron'
import appIcon from '../../../resources/icon.png?asset'
import { getLogger } from '../utils/logger'
import { ensureBubbleWindow, getBubbleWindow, getCurrentDisplayMode, getLive2dWindow, getPetsWindow } from '../windows/windowManager'

const logger = getLogger('CareReminderNotification')
const DELIVERY_TIMEOUT_MS = 10000
let activeNotification: Notification | null = null
const readyContents = new WeakSet<WebContents>()
const trackedContents = new WeakSet<WebContents>()

function isBubbleReadyEvent(event: IpcMainEvent, contents: WebContents): boolean {
  const bubble = getBubbleWindow()
  return Boolean(bubble && !bubble.isDestroyed() && bubble.webContents === contents
    && event.sender === contents && !contents.isDestroyed() && event.senderFrame === contents.mainFrame)
}

ipcMain.on('bubble:local-ready', (event: IpcMainEvent) => {
  const bubble = getBubbleWindow()
  if (!bubble || bubble.isDestroyed() || !isBubbleReadyEvent(event, bubble.webContents))
    return
  const contents = bubble.webContents
  readyContents.add(contents)
  if (!trackedContents.has(contents)) {
    trackedContents.add(contents)
    contents.on('did-start-loading', () => readyContents.delete(contents))
  }
})

function visiblePetWindow(): BrowserWindow | null {
  const mode = getCurrentDisplayMode()
  const win = mode === 'pets' ? getPetsWindow() : mode === 'live2d' ? getLive2dWindow() : null
  return win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() ? win : null
}

export function canPresentCareReminder(): boolean {
  return Boolean(visiblePetWindow()) || Notification.isSupported()
}

/** Document load can precede the lazy BubbleView mount; wait for its actual subscriber. */
function waitForBubble(win: BrowserWindow, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted || win.isDestroyed() || win.webContents.isDestroyed())
    return Promise.resolve(false)
  const contents = win.webContents
  if (readyContents.has(contents))
    return Promise.resolve(true)

  return new Promise((resolve) => {
    let timeout: ReturnType<typeof setTimeout>
    function finish(ready: boolean): void {
      clearTimeout(timeout)
      ipcMain.removeListener('bubble:local-ready', onReady)
      contents.removeListener('did-fail-load', onFailed)
      contents.removeListener('destroyed', onFailed)
      signal.removeEventListener('abort', onFailed)
      resolve(ready)
    }
    function onReady(event: IpcMainEvent): void {
      if (isBubbleReadyEvent(event, contents))
        finish(true)
    }
    function onFailed(): void {
      finish(false)
    }
    timeout = setTimeout(onFailed, DELIVERY_TIMEOUT_MS)
    ipcMain.on('bubble:local-ready', onReady)
    contents.once('did-fail-load', onFailed)
    contents.once('destroyed', onFailed)
    signal.addEventListener('abort', onFailed, { once: true })
  })
}

function showSystemNotification(text: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted)
    return Promise.resolve(false)
  if (!Notification.isSupported()) {
    logger.warn('当前系统不支持关怀通知，跳过提醒')
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const notification = new Notification({
      title: '小智 · 关怀提醒',
      body: text,
      icon: appIcon,
      silent: true,
      urgency: 'low',
    })
    activeNotification?.close()
    activeNotification = notification
    let settled = false
    let timeout: ReturnType<typeof setTimeout>
    const cleanup = () => {
      notification.removeAllListeners()
      signal.removeEventListener('abort', onAbort)
      if (activeNotification === notification)
        activeNotification = null
    }
    const finish = (shown: boolean) => {
      if (settled)
        return
      settled = true
      clearTimeout(timeout)
      notification.removeAllListeners('show')
      notification.removeAllListeners('failed')
      if (!shown) {
        cleanup()
        notification.close()
      }
      resolve(shown)
    }
    function onAbort(): void {
      finish(false)
      cleanup()
      notification.close()
    }
    timeout = setTimeout(() => {
      logger.warn('关怀系统通知未确认展示，跳过本次冷却记录')
      finish(false)
    }, DELIVERY_TIMEOUT_MS)
    notification.once('close', () => {
      finish(false)
      cleanup()
    })
    notification.once('show', () => finish(true))
    notification.once('failed', (_event, error) => {
      logger.warn('关怀系统通知展示失败', error)
      finish(false)
    })
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      notification.show()
    }
    catch (error) {
      logger.warn('提交关怀系统通知失败', error)
      finish(false)
    }
  })
}

/** Local care messages use exactly one surface, without chat or audio side effects. */
export async function presentCareReminder(
  text: string,
  durationMs: number,
  signal: AbortSignal,
  isAllowed: () => boolean,
): Promise<boolean> {
  if (signal.aborted || !isAllowed())
    return false

  if (visiblePetWindow()) {
    try {
      const bubble = ensureBubbleWindow()
      const ready = await waitForBubble(bubble, signal)
      if (signal.aborted || !isAllowed())
        return false
      if (ready && visiblePetWindow() && !bubble.isDestroyed() && !bubble.webContents.isDestroyed()) {
        const payload: BubbleLocalShowPayload = { text, durationMs, source: 'reminder' }
        bubble.webContents.send('bubble:show-local', payload)
        return true
      }
      logger.debug('桌宠气泡不可用，改用静默系统通知')
    }
    catch (error) {
      logger.warn('提交关怀气泡失败', error)
    }
  }

  if (signal.aborted || !isAllowed())
    return false
  return showSystemNotification(text, signal)
}
