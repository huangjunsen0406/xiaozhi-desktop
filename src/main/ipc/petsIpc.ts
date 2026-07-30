/**
 * 精灵宠物管理 IPC 处理器（createIpcHandler + IpcResult）
 */
import path from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs-extra'
import { deletePet, getCurrentPet, getPetsFolderPath, importPet, scanPets, setCurrentPet } from '../services/PetsManager'
import { getLogger } from '../utils/logger'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('PetsIpc')

/**
 * 注册精灵宠物管理 IPC 处理器
 */
export function registerPetsIpc(): void {
  createIpcHandler({
    channel: 'pets:get-list',
    handler: async () => {
      return success(await scanPets())
    },
  })

  createIpcHandler({
    channel: 'pets:get-current',
    handler: async () => {
      return success(await getCurrentPet())
    },
  })

  createIpcHandler({
    channel: 'pets:set-current',
    schema: {
      petId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, petIdUnknown: unknown) => {
      const petId = String(petIdUnknown)
      const result = await setCurrentPet(petId)

      if (!result.success) {
        return failure(result.error || '切换宠物失败')
      }

      // 广播宠物切换事件给所有窗口
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('pets:changed', petId)
        }
      }

      return success()
    },
  })

  createIpcHandler({
    channel: 'pets:select-folder',
    handler: async () => {
      return success(await dialog.showOpenDialog({
        title: '选择精灵宠物文件夹',
        properties: ['openDirectory'],
      }))
    },
  })

  createIpcHandler({
    channel: 'pets:import',
    schema: {
      sourcePath: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, sourcePath: unknown) => {
      const result = await importPet(String(sourcePath))
      if (!result.success) {
        return failure(result.error || '导入宠物失败')
      }
      // petId 放在 data 内，preload 用 unwrapIpcResult 取 data
      return success({ petId: result.petId })
    },
  })

  createIpcHandler({
    channel: 'pets:delete',
    schema: {
      petId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, petId: unknown) => {
      const result = await deletePet(String(petId))
      if (!result.success) {
        return failure(result.error || '删除宠物失败')
      }
      return success()
    },
  })

  createIpcHandler({
    channel: 'pets:get-folder-path',
    handler: async () => {
      return success(getPetsFolderPath())
    },
  })

  createIpcHandler({
    channel: 'pets:open-folder',
    handler: async () => {
      const folderPath = getPetsFolderPath()
      shell.openPath(folderPath)
      return success()
    },
  })

  createIpcHandler({
    channel: 'pets:get-spritesheet',
    schema: {
      petId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, petId: unknown) => {
      try {
        const petsDir = getPetsFolderPath()
        const spritesheetPath = path.join(petsDir, String(petId), 'spritesheet.webp')

        if (!(await fs.pathExists(spritesheetPath))) {
          logger.error(`精灵图不存在: ${spritesheetPath}`)
          return success(null)
        }

        const buffer = await fs.readFile(spritesheetPath)
        return success(`data:image/webp;base64,${buffer.toString('base64')}`)
      }
      catch (error) {
        logger.error('读取精灵图失败', error)
        return success(null)
      }
    },
  })

  logger.info('精灵宠物管理 IPC 处理器已注册')
}
