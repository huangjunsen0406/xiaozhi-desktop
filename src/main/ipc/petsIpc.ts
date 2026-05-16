/**
 * 精灵宠物管理 IPC 处理器
 */
import type { IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs-extra'
import { deletePet, getCurrentPet, getPetsFolderPath, importPet, scanPets, setCurrentPet } from '../services/PetsManager'
import { getLogger } from '../utils/logger'

const logger = getLogger('PetsIpc')

/**
 * 注册精灵宠物管理 IPC 处理器
 */
export function registerPetsIpc(): void {
  /**
   * 获取宠物列表
   */
  ipcMain.handle('pets:get-list', async (_event: IpcMainInvokeEvent) => {
    return scanPets()
  })

  /**
   * 获取当前宠物
   */
  ipcMain.handle('pets:get-current', async (_event: IpcMainInvokeEvent) => {
    return getCurrentPet()
  })

  /**
   * 设置当前宠物
   */
  ipcMain.handle('pets:set-current', async (_event: IpcMainInvokeEvent, petId: string) => {
    const result = await setCurrentPet(petId)

    if (result.success) {
      // 广播宠物切换事件给所有窗口
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('pets:changed', petId)
        }
      }
    }

    return result
  })

  /**
   * 打开文件夹选择器
   */
  ipcMain.handle('pets:select-folder', async (_event: IpcMainInvokeEvent) => {
    return dialog.showOpenDialog({
      title: '选择精灵宠物文件夹',
      properties: ['openDirectory'],
    })
  })

  /**
   * 导入宠物
   */
  ipcMain.handle('pets:import', async (_event: IpcMainInvokeEvent, sourcePath: string) => {
    return importPet(sourcePath)
  })

  /**
   * 删除宠物
   */
  ipcMain.handle('pets:delete', async (_event: IpcMainInvokeEvent, petId: string) => {
    return deletePet(petId)
  })

  /**
   * 获取宠物存储目录路径
   */
  ipcMain.handle('pets:get-folder-path', async (_event: IpcMainInvokeEvent) => {
    return getPetsFolderPath()
  })

  /**
   * 打开宠物存储目录
   */
  ipcMain.handle('pets:open-folder', async (_event: IpcMainInvokeEvent) => {
    const folderPath = getPetsFolderPath()
    shell.openPath(folderPath)
    return { success: true }
  })

  /**
   * 获取精灵图 base64 数据
   */
  ipcMain.handle('pets:get-spritesheet', async (_event: IpcMainInvokeEvent, petId: string) => {
    try {
      const petsDir = getPetsFolderPath()
      const spritesheetPath = path.join(petsDir, petId, 'spritesheet.webp')

      if (!(await fs.pathExists(spritesheetPath))) {
        logger.error(`精灵图不存在: ${spritesheetPath}`)
        return null
      }

      const buffer = await fs.readFile(spritesheetPath)
      return `data:image/webp;base64,${buffer.toString('base64')}`
    }
    catch (error) {
      logger.error('读取精灵图失败', error)
      return null
    }
  })

  logger.info('精灵宠物管理 IPC 处理器已注册')
}
