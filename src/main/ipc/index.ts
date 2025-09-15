import { ipcMain } from 'electron'
import { togglePanel, toggleToMain, toggleToMini } from '../windows/windowManager'

export function registerIpcChannels(): void {
  ipcMain.on('toggle-to-mini', () => {
    toggleToMini()
  })

  ipcMain.on('toggle-to-main', () => {
    toggleToMain()
  })

  ipcMain.on('panel:toggle', () => {
    togglePanel()
  })
}
