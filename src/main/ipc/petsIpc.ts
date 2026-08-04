/**
 * 精灵宠物管理 IPC 处理器（createIpcHandler + IpcResult）
 */
import {
  PET_DISPLAY_WIDTH_MAX,
  PET_DISPLAY_WIDTH_MIN,
} from '@shared/types'
import { BrowserWindow, dialog, shell } from 'electron'
import {
  deletePet,
  ensureBuiltinPetsCopied,
  getCurrentPet,
  getDisplayWidth,
  getPetsFolderPath,
  getPetSpritesheet,
  importPet,
  scanPets,
  setCurrentPet,
  setDisplayWidth,
} from '../services/PetsManager'
import { getLogger } from '../utils/logger'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('PetsIpc')

/**
 * 向所有窗口广播事件（宠物切换 / 显示尺寸）
 */
function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}

/**
 * 注册精灵宠物管理 IPC 处理器
 */
export function registerPetsIpc(): void {
  // 启动时种子内置宠物（幂等；scanPets 内兜底再执行一次）
  ensureBuiltinPetsCopied().catch((error) => {
    logger.error('种子内置宠物失败', error)
  })

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
      broadcastToAllWindows('pets:changed', petId)

      return success()
    },
  })

  createIpcHandler({
    channel: 'pets:get-display-size',
    handler: async () => {
      return success(await getDisplayWidth())
    },
  })

  createIpcHandler({
    channel: 'pets:set-display-size',
    schema: {
      width: {
        type: 'number',
        required: true,
        min: PET_DISPLAY_WIDTH_MIN,
        max: PET_DISPLAY_WIDTH_MAX,
      },
    },
    handler: async (_event, widthUnknown: unknown) => {
      const result = await setDisplayWidth(Number(widthUnknown))
      if (!result.success) {
        return failure(result.error || '设置宠物大小失败')
      }

      // 实时通知 pets / live2d / 设置页
      broadcastToAllWindows('pets:display-size-changed', result.width)
      return success(result.width)
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
      // 结构化返回 dataUrl + spriteVersionNumber + 像素尺寸（Codex v1/v2）
      const payload = await getPetSpritesheet(String(petId))
      if (!payload) {
        logger.error(`精灵图不存在或读取失败: ${String(petId)}`)
      }
      return success(payload)
    },
  })

  logger.info('精灵宠物管理 IPC 处理器已注册')
}
