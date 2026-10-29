import type { BrowserWindow, WebPreferences } from 'electron'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app, shell } from 'electron'

export function createRendererPreferences(overrides: WebPreferences = {}): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    ...overrides,
  }
}

export function loadRendererRoute(window: BrowserWindow, route: string): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/${route}`)
  }
  else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
  }
}

export function setAppWindowTitle(window: BrowserWindow): void {
  window.on('page-title-updated', event => event.preventDefault())
  window.setTitle(app.getName())
}

export function openWindowLinksExternally(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}
