import { BrowserWindow, ipcMain, screen } from 'electron'
import { ensureHoverWindow, ensureMiniWindow, hideHover, repositionHoverBesideMini, showHoverBesideMini, togglePanel, toggleToMain, toggleToMini } from '../windows/windowManager'

export function registerIpcChannels(): void {
  // 窗口控制
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isMaximized())
      win.maximize()
  })

  ipcMain.on('window:unmaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && win.isMaximized())
      win.unmaximize()
  })

  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // 移动当前窗口（用于自定义拖拽）
  ipcMain.on('window:move-by', (event, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return
    const [x, y] = win.getPosition()
    win.setPosition(x + Math.round(dx), y + Math.round(dy))
  })

  // 调整当前窗口大小（用于 mini 悬停展开菜单）
  ipcMain.on('window:resize-to', (event, width: number, height?: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return
    const [, h] = win.getSize()
    const nextW = Math.max(1, Math.round(width))
    const nextH = Math.max(1, Math.round(height ?? h))
    win.setSize(nextW, nextH)
  })

  // Hover 辅助窗口
  ipcMain.on('hover:show', () => {
    showHoverBesideMini()
  })
  ipcMain.on('hover:hide', () => {
    hideHover()
  })
  ipcMain.on('hover:reposition', () => {
    repositionHoverBesideMini()
  })

  // 跨窗口 hover 接力：mini 与 hover 之间的过渡不隐藏
  let miniOrHoverHovered = false
  let relayCheckInterval: NodeJS.Timeout | null = null
  let relayHideTimeout: NodeJS.Timeout | null = null

  function clearRelayTimers() {
    if (relayCheckInterval) {
      clearInterval(relayCheckInterval)
      relayCheckInterval = null
    }
    if (relayHideTimeout) {
      clearTimeout(relayHideTimeout)
      relayHideTimeout = null
    }
  }

  function pointInRect(pt: { x: number, y: number }, r: { x: number, y: number, width: number, height: number }) {
    return pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.height
  }

  function expandRect(r: { x: number, y: number, width: number, height: number }, m: number) {
    return { x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m }
  }

  function startRelayGrace() {
    clearRelayTimers()
    const hover = ensureHoverWindow()
    const mini = ensureMiniWindow()
    if (!hover || !hover.isVisible())
      return
    const margin = 16 // 允许从 mini 移动到 hover 的过渡缓冲
    relayHideTimeout = setTimeout(() => {
      if (!miniOrHoverHovered)
        hideHover()
      clearRelayTimers()
    }, 350)
    relayCheckInterval = setInterval(() => {
      const pt = screen.getCursorScreenPoint()
      const miniB = mini.getBounds()
      const hoverB = hover.getBounds()
      if (pointInRect(pt, expandRect(hoverB, margin)) || pointInRect(pt, expandRect(miniB, 4))) {
        miniOrHoverHovered = true
        clearRelayTimers()
      }
    }, 16)
  }
  ipcMain.on('hover:mini-enter', () => {
    miniOrHoverHovered = true
    showHoverBesideMini()
    clearRelayTimers()
  })
  ipcMain.on('hover:mini-leave', () => {
    miniOrHoverHovered = false
    // 开启接力缓冲：鼠标从 mini 移动到 hover 的间隙不立即隐藏
    startRelayGrace()
  })
  ipcMain.on('hover:hover-enter', () => {
    miniOrHoverHovered = true
    clearRelayTimers()
  })
  ipcMain.on('hover:hover-leave', () => {
    miniOrHoverHovered = false
    startRelayGrace()
  })

  // 主视图
  ipcMain.on('window:toggle-to-mini', () => {
    toggleToMini()
  })

  ipcMain.on('window:toggle-to-main', () => {
    toggleToMain()
  })

  // 输入框
  ipcMain.on('panel:toggle', () => {
    togglePanel()
  })
}
