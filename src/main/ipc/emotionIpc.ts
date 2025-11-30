import type { IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { app, dialog, ipcMain, webContents } from 'electron'
import fs from 'fs-extra'

import { createLogger } from '../utils/logger'

const logger = createLogger('EmotionIpc')

const EMOTIONS_DIR = path.join(app.getPath('userData'), 'emotions')
const CUSTOM_DIR = path.join(EMOTIONS_DIR, 'custom')
const MAPPING_FILE = path.join(EMOTIONS_DIR, 'mapping.json')

/**
 * 确保目录存在
 */
async function ensureDirectories() {
  await fs.ensureDir(CUSTOM_DIR)
}

/**
 * 读取映射配置
 */
async function getMapping(): Promise<Record<string, string>> {
  try {
    if (await fs.pathExists(MAPPING_FILE)) {
      return await fs.readJson(MAPPING_FILE)
    }
  }
  catch (error) {
    logger.error('读取映射配置失败', error)
  }
  return {}
}

/**
 * 保存映射配置
 */
async function saveMapping(mapping: Record<string, string>): Promise<void> {
  await fs.writeJson(MAPPING_FILE, mapping, { spaces: 2 })
}

/**
 * 表情广播回调（由外部注入）
 */
let emotionBroadcastCallback: ((emotionType: string) => void) | null = null

/**
 * 设置表情广播回调
 * 供外部注入 UIPlugin 的广播方法
 */
export function setEmotionBroadcastCallback(callback: (emotionType: string) => void): void {
  emotionBroadcastCallback = callback
  logger.info('表情广播回调已设置')
}

/**
 * 广播表情变更事件到所有窗口
 */
function broadcastEmotionChanged(emotionType: string): void {
  if (emotionBroadcastCallback) {
    emotionBroadcastCallback(emotionType)
  }
  else {
    // 降级方案：直接使用 webContents（兼容性）
    logger.warn('表情广播回调未设置，使用降级方案')
    const allWebContents = webContents.getAllWebContents()
    allWebContents.forEach((wc) => {
      if (!wc.isDestroyed()) {
        try {
          wc.send('emotion:changed', emotionType)
        }
        catch (error) {
          logger.error('广播表情变更失败:', error)
        }
      }
    })
  }
}

/**
 * 验证图片文件
 */
async function validateImageFile(filePath: string): Promise<{ valid: boolean, error?: string }> {
  try {
    // 1. 检查文件是否存在
    if (!(await fs.pathExists(filePath))) {
      return { valid: false, error: '文件不存在' }
    }

    // 2. 检查文件扩展名
    const ext = path.extname(filePath).toLowerCase()
    const allowedExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    if (!allowedExts.includes(ext)) {
      return { valid: false, error: `不支持的文件格式: ${ext}。支持的格式: ${allowedExts.join(', ')}` }
    }

    // 3. 检查文件大小（最大 5MB）
    const stats = await fs.stat(filePath)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (stats.size > maxSize) {
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
      return { valid: false, error: `文件过大: ${sizeMB}MB。最大支持 5MB` }
    }

    return { valid: true }
  }
  catch (error) {
    return { valid: false, error: `验证失败: ${String(error)}` }
  }
}

/**
 * 注册表情相关 IPC 处理器
 */
export function registerEmotionIpc(): void {
  // 初始化目录
  ensureDirectories().catch(err => logger.error('初始化目录失败', err))

  /**
   * 打开文件选择器
   */
  ipcMain.handle('emotion:select-image', async (_event: IpcMainInvokeEvent) => {
    return dialog.showOpenDialog({
      title: '选择表情图片',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ],
    })
  })

  /**
   * 上传自定义图片
   */
  ipcMain.handle(
    'emotion:upload-custom',
    async (_event: IpcMainInvokeEvent, emotionType: string, sourcePath: string) => {
      try {
        logger.info(`上传表情: ${emotionType}, 源文件: ${sourcePath}`)

        // 确保目录存在
        await ensureDirectories()

        // 1. 验证文件
        const validation = await validateImageFile(sourcePath)
        if (!validation.valid) {
          logger.warn(`文件验证失败: ${validation.error}`)
          return { success: false, error: validation.error }
        }

        // 2. 获取文件扩展名
        const ext = path.extname(sourcePath)
        const targetFileName = `${emotionType}${ext}`
        const targetPath = path.join(CUSTOM_DIR, targetFileName)

        // 3. 复制文件
        await fs.copy(sourcePath, targetPath, { overwrite: true })
        logger.info(`文件已复制到: ${targetPath}`)

        // 4. 更新映射
        const mapping = await getMapping()
        mapping[emotionType] = targetFileName
        await saveMapping(mapping)
        logger.info(`映射已更新`)

        // 5. 广播变更事件
        broadcastEmotionChanged(emotionType)

        return { success: true }
      }
      catch (error) {
        logger.error('上传失败', error)
        return { success: false, error: String(error) }
      }
    },
  )

  /**
   * 获取映射配置
   */
  ipcMain.handle('emotion:get-mapping', async (_event: IpcMainInvokeEvent) => {
    return getMapping()
  })

  /**
   * 获取自定义图片路径（返回 base64 data URL）
   */
  ipcMain.handle('emotion:get-custom-path', async (_event: IpcMainInvokeEvent, emotionType: string) => {
    try {
      const mapping = await getMapping()
      const fileName = mapping[emotionType]
      if (!fileName) {
        return null
      }

      const filePath = path.join(CUSTOM_DIR, fileName)

      // 检查文件是否存在
      if (!(await fs.pathExists(filePath))) {
        logger.warn(`自定义表情文件不存在: ${filePath}`)
        return null
      }

      // 读取文件并转换为 base64 data URL
      const fileBuffer = await fs.readFile(filePath)
      const ext = path.extname(fileName).toLowerCase().slice(1)
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      const base64 = fileBuffer.toString('base64')

      return `data:${mimeType};base64,${base64}`
    }
    catch (error) {
      logger.error('获取自定义路径失败', error)
      return null
    }
  })

  /**
   * 重置表情（删除自定义图片）
   */
  ipcMain.handle('emotion:reset', async (_event: IpcMainInvokeEvent, emotionType: string) => {
    try {
      logger.info(`重置表情: ${emotionType}`)

      const mapping = await getMapping()
      const fileName = mapping[emotionType]

      if (fileName) {
        // 删除文件
        const filePath = path.join(CUSTOM_DIR, fileName)
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath)
          logger.info(`已删除文件: ${filePath}`)
        }

        // 更新映射
        delete mapping[emotionType]
        await saveMapping(mapping)
        logger.info(`映射已更新`)

        // 广播变更事件
        broadcastEmotionChanged(emotionType)
      }

      return { success: true }
    }
    catch (error) {
      logger.error('重置失败', error)
      return { success: false, error: String(error) }
    }
  })

  logger.info('表情 IPC 处理器已注册')
}
