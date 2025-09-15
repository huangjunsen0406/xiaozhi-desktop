import { join } from 'node:path'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import icon from '../../resources/icon.png?asset'

// 启用系统级回声消除特性
app.commandLine.appendSwitch(
  'enable-features',
  // Chrome-wide 回声消除 + 使用系统回放作 AEC 参考（取消系统任意进程的播放）
  'ChromeWideEchoCancellation,SystemLoopbackAsAecReference',
)

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 300,
    height: 400,
    show: false,
    frame: false,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : {}),
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 40 } as const }
      : {}),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/main`)
  }
  else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'main' })
  }
}

function createMiniWindow(): void {
  miniWindow = new BrowserWindow({
    width: 72,
    height: 72,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    resizable: false,
    movable: true,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  // 允许跨显示器/空间拖动（macOS 特别有用）
  miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // 保持较高置顶层级，避免被其他窗口遮挡
  miniWindow.setAlwaysOnTop(true, 'screen-saver')
  // 进一步确保位于 z-order 顶部
  miniWindow.moveTop()

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    miniWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/mini`)
  }
  else {
    miniWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'mini' })
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC: 收起/展开
  ipcMain.on('toggle-to-mini', () => {
    if (!miniWindow)
      createMiniWindow()
    miniWindow?.show()
    mainWindow?.hide()
  })

  ipcMain.on('toggle-to-main', () => {
    mainWindow?.show()
    miniWindow?.hide()
  })

  createMainWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0)
      createMainWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
