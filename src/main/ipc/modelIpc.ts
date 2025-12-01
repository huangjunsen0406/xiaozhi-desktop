/**
 * 模型管理 IPC 处理器
 *
 * 模型统一存储在 userData/models/ 目录
 * 首次启动时会从内置资源目录复制默认模型
 */
import type { IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import process from 'node:process'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs-extra'

import { getLogger } from '../utils/logger'

const logger = getLogger('ModelIpc')

/**
 * 获取用户模型目录 - userData/models/
 */
function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

/**
 * 获取内置模型源目录（仅用于首次复制）
 */
function getBuiltinModelsDir(): string {
  if (app.isPackaged) {
    // 生产环境：从 asar 内的资源目录读取
    return path.join(__dirname, '../../renderer/Resources')
  }
  else {
    // 开发环境：从项目目录读取
    return path.join(process.cwd(), 'src/renderer/public/Resources')
  }
}

const CONFIG_FILE_NAME = 'model-config.json'
const INIT_FLAG_FILE = '.models-initialized'

/**
 * 模型信息接口
 */
interface ModelInfo {
  id: string // 文件夹名
  name: string // 显示名称
  path: string // 完整路径
  preview?: string // 预览图 base64
  hasExpressions: boolean // 是否有表情
  hasMotions: boolean // 是否有动作
  expressionCount: number // 表情数量
  motionCount: number // 动作数量
}

/**
 * 模型配置接口
 */
interface ModelConfig {
  currentModel: string // 当前使用的模型 ID
}

/**
 * 确保目录存在
 */
async function ensureDirectories(): Promise<void> {
  const modelsDir = getModelsDir()
  await fs.ensureDir(modelsDir)
}

/**
 * 获取配置文件路径
 */
function getConfigFilePath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME)
}

/**
 * 获取初始化标记文件路径
 */
function getInitFlagPath(): string {
  return path.join(app.getPath('userData'), INIT_FLAG_FILE)
}

/**
 * 检查是否已初始化内置模型
 */
async function isModelsInitialized(): Promise<boolean> {
  return fs.pathExists(getInitFlagPath())
}

/**
 * 标记模型已初始化
 */
async function markModelsInitialized(): Promise<void> {
  await fs.writeFile(getInitFlagPath(), new Date().toISOString())
}

/**
 * 复制内置模型到用户目录
 */
async function copyBuiltinModels(): Promise<void> {
  const builtinDir = getBuiltinModelsDir()
  const userDir = getModelsDir()

  logger.info(`检查内置模型目录: ${builtinDir}`)

  // 检查内置模型目录是否存在
  if (!(await fs.pathExists(builtinDir))) {
    logger.warn(`内置模型目录不存在: ${builtinDir}`)
    return
  }

  try {
    const entries = await fs.readdir(builtinDir, { withFileTypes: true })
    let copiedCount = 0

    for (const entry of entries) {
      // 只处理目录，跳过 .DS_Store 等文件
      if (!entry.isDirectory()) {
        continue
      }

      const modelName = entry.name
      const sourcePath = path.join(builtinDir, modelName)
      const targetPath = path.join(userDir, modelName)

      // 检查目标是否已存在
      if (await fs.pathExists(targetPath)) {
        logger.info(`模型已存在，跳过: ${modelName}`)
        continue
      }

      // 检查是否是有效的模型（包含 model.json 或 .model3.json）
      const files = await fs.readdir(sourcePath)
      const hasModelJson = files.some(f => f === 'model.json' || f.endsWith('.model3.json'))
      if (!hasModelJson) {
        logger.info(`不是有效的模型目录，跳过: ${modelName}`)
        continue
      }

      // 复制模型
      logger.info(`复制内置模型: ${modelName}`)
      await fs.copy(sourcePath, targetPath)
      copiedCount++
    }

    logger.info(`内置模型复制完成，共复制 ${copiedCount} 个模型`)
  }
  catch (error) {
    logger.error('复制内置模型失败', error)
  }
}

/**
 * 初始化模型目录（首次启动时复制内置模型）
 */
async function initializeModels(): Promise<void> {
  await ensureDirectories()

  // 检查是否已初始化
  if (await isModelsInitialized()) {
    logger.info('模型目录已初始化，跳过复制')
    return
  }

  logger.info('首次启动，开始复制内置模型...')
  await copyBuiltinModels()
  await markModelsInitialized()
}

/**
 * 读取模型配置
 */
async function getConfig(): Promise<ModelConfig> {
  try {
    const configFile = getConfigFilePath()
    if (await fs.pathExists(configFile)) {
      return await fs.readJson(configFile)
    }
  }
  catch (error) {
    logger.error('读取模型配置失败', error)
  }
  return { currentModel: '' }
}

/**
 * 保存模型配置
 */
async function saveConfig(config: ModelConfig): Promise<void> {
  const configFile = getConfigFilePath()
  await fs.writeJson(configFile, config, { spaces: 2 })
}

/**
 * 查找模型的预览图
 */
async function findPreviewImage(modelPath: string): Promise<string | null> {
  const previewPatterns = [
    'preview.png',
    'preview.jpg',
    'icon.png',
    'icon.jpg',
    'thumbnail.png',
    'thumbnail.jpg',
  ]

  // 尝试查找预览图
  for (const pattern of previewPatterns) {
    const filePath = path.join(modelPath, pattern)
    if (await fs.pathExists(filePath)) {
      try {
        const buffer = await fs.readFile(filePath)
        const ext = path.extname(pattern).slice(1)
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
        return `data:${mimeType};base64,${buffer.toString('base64')}`
      }
      catch {
        continue
      }
    }
  }

  // 尝试查找任意 PNG 图片作为预览（排除贴图文件）
  try {
    const files = await fs.readdir(modelPath)
    const pngFile = files.find(f => f.endsWith('.png') && !f.includes('texture'))
    if (pngFile) {
      const filePath = path.join(modelPath, pngFile)
      const buffer = await fs.readFile(filePath)
      return `data:image/png;base64,${buffer.toString('base64')}`
    }
  }
  catch {
    // 忽略错误
  }

  return null
}

/**
 * 解析模型信息
 */
async function parseModelInfo(modelPath: string, modelId: string): Promise<ModelInfo | null> {
  try {
    const modelJsonPath = path.join(modelPath, 'model.json')

    // 检查 model.json 是否存在
    if (!(await fs.pathExists(modelJsonPath))) {
      logger.warn(`模型缺少 model.json: ${modelPath}`)
      return null
    }

    const modelJson = await fs.readJson(modelJsonPath)
    const fileRefs = modelJson.FileReferences || {}

    // 统计表情和动作
    const expressions = fileRefs.Expressions || []
    const motions = fileRefs.Motions || {}
    let motionCount = 0
    for (const group of Object.values(motions)) {
      if (Array.isArray(group)) {
        motionCount += group.length
      }
    }

    // 获取预览图
    const preview = await findPreviewImage(modelPath)

    return {
      id: modelId,
      name: modelId,
      path: modelPath,
      preview: preview || undefined,
      hasExpressions: expressions.length > 0,
      hasMotions: motionCount > 0,
      expressionCount: expressions.length,
      motionCount,
    }
  }
  catch (error) {
    logger.error(`解析模型信息失败: ${modelPath}`, error)
    return null
  }
}

/**
 * 获取所有模型列表
 */
async function getModelList(): Promise<ModelInfo[]> {
  const models: ModelInfo[] = []
  const modelsDir = getModelsDir()

  try {
    await ensureDirectories()

    // 扫描模型目录
    if (await fs.pathExists(modelsDir)) {
      const entries = await fs.readdir(modelsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const modelPath = path.join(modelsDir, entry.name)
          const info = await parseModelInfo(modelPath, entry.name)
          if (info) {
            models.push(info)
          }
        }
      }
    }
  }
  catch (error) {
    logger.error('获取模型列表失败', error)
  }

  return models
}

/**
 * 验证模型文件夹
 */
async function validateModelFolder(folderPath: string): Promise<{ valid: boolean, error?: string }> {
  try {
    // 检查文件夹是否存在
    if (!(await fs.pathExists(folderPath))) {
      return { valid: false, error: '文件夹不存在' }
    }

    // 检查是否是目录
    const stat = await fs.stat(folderPath)
    if (!stat.isDirectory()) {
      return { valid: false, error: '选择的不是文件夹' }
    }

    // 检查必要文件
    const files = await fs.readdir(folderPath)

    // 必须有 .moc3 文件
    const hasMoc3 = files.some(f => f.endsWith('.moc3'))
    if (!hasMoc3) {
      return { valid: false, error: '缺少 .moc3 模型文件' }
    }

    // 必须有 model.json 或 .model3.json 文件
    const hasModelJson = files.some(f => f === 'model.json' || f.endsWith('.model3.json'))
    if (!hasModelJson) {
      return { valid: false, error: '缺少 model.json 配置文件' }
    }

    // 检查贴图文件夹
    const hasTextures = files.some(f => f.includes('.2048') || f.includes('.4096') || f.includes('.8192'))
    if (!hasTextures) {
      return { valid: false, error: '缺少贴图文件夹 (如 xxx.2048)' }
    }

    return { valid: true }
  }
  catch (error) {
    return { valid: false, error: `验证失败: ${String(error)}` }
  }
}

/**
 * 注册模型管理 IPC 处理器
 */
export function registerModelIpc(): void {
  // 初始化模型目录（首次启动时复制内置模型）
  initializeModels().catch(err => logger.error('初始化模型目录失败', err))

  /**
   * 获取模型列表
   */
  ipcMain.handle('model:get-list', async (_event: IpcMainInvokeEvent) => {
    return getModelList()
  })

  /**
   * 获取当前模型
   */
  ipcMain.handle('model:get-current', async (_event: IpcMainInvokeEvent) => {
    const config = await getConfig()
    return config.currentModel
  })

  /**
   * 切换模型
   */
  ipcMain.handle('model:set-current', async (_event: IpcMainInvokeEvent, modelId: string) => {
    try {
      const config = await getConfig()
      config.currentModel = modelId
      await saveConfig(config)
      logger.info(`切换模型: ${modelId}`)

      // 广播模型切换事件给所有窗口
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('model:changed', modelId)
        }
      }
      logger.info(`已广播模型切换事件到 ${windows.length} 个窗口`)

      return { success: true }
    }
    catch (error) {
      logger.error('切换模型失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 打开文件夹选择器
   */
  ipcMain.handle('model:select-folder', async (_event: IpcMainInvokeEvent) => {
    return dialog.showOpenDialog({
      title: '选择 Live2D 模型文件夹',
      properties: ['openDirectory'],
    })
  })

  /**
   * 导入模型
   */
  ipcMain.handle('model:import', async (_event: IpcMainInvokeEvent, sourcePath: string) => {
    try {
      const modelsDir = getModelsDir()
      logger.info(`导入模型: ${sourcePath}`)

      // 验证文件夹
      const validation = await validateModelFolder(sourcePath)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // 获取文件夹名作为模型 ID
      const modelId = path.basename(sourcePath)
      const targetPath = path.join(modelsDir, modelId)

      // 检查是否已存在
      if (await fs.pathExists(targetPath)) {
        return { success: false, error: `模型 "${modelId}" 已存在` }
      }

      // 复制文件夹
      await fs.copy(sourcePath, targetPath)
      logger.info(`模型已复制到: ${targetPath}`)

      // 如果没有 model.json，尝试创建
      const modelJsonPath = path.join(targetPath, 'model.json')
      if (!(await fs.pathExists(modelJsonPath))) {
        // 查找 .model3.json 文件
        const files = await fs.readdir(targetPath)
        const model3Json = files.find(f => f.endsWith('.model3.json'))
        if (model3Json) {
          // 复制为 model.json
          await fs.copy(path.join(targetPath, model3Json), modelJsonPath)
          logger.info(`已创建 model.json`)
        }
      }

      return { success: true, modelId }
    }
    catch (error) {
      logger.error('导入模型失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 删除模型
   */
  ipcMain.handle('model:delete', async (_event: IpcMainInvokeEvent, modelId: string) => {
    try {
      const modelsDir = getModelsDir()
      const modelPath = path.join(modelsDir, modelId)

      // 检查模型是否存在
      if (!(await fs.pathExists(modelPath))) {
        return { success: false, error: '模型不存在' }
      }

      // 删除模型文件夹
      await fs.remove(modelPath)
      logger.info(`已删除模型: ${modelId}`)

      // 如果删除的是当前模型，清空当前选择
      const config = await getConfig()
      if (config.currentModel === modelId) {
        config.currentModel = ''
        await saveConfig(config)
      }

      return { success: true }
    }
    catch (error) {
      logger.error('删除模型失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 打开模型目录
   */
  ipcMain.handle('model:open-folder', async (_event: IpcMainInvokeEvent) => {
    const modelsDir = getModelsDir()
    await ensureDirectories()
    shell.openPath(modelsDir)
    return { success: true }
  })

  /**
   * 获取模型目录路径
   */
  ipcMain.handle('model:get-folder-path', async (_event: IpcMainInvokeEvent) => {
    return getModelsDir()
  })

  logger.info('模型管理 IPC 处理器已注册')
}
