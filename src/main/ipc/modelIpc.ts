import type { ModelInfo } from '@shared/types'
/**
 * 模型管理 IPC 处理器（createIpcHandler + IpcResult）
 *
 * 模型统一存储在 userData/models/ 目录
 * 首次启动时会从内置资源目录复制默认模型
 * 导入时通过 normalizeLive2dImport 发现嵌套模型根并规范化为 stableId 目录
 */
import path from 'node:path'
import process from 'node:process'
import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs-extra'

import { getLogger } from '../utils/logger'
import {
  ensureModelJson,
  ensureWritableTree,
  importNormalizedLive2dModel,
  readModelMeta,
} from '../utils/normalizeLive2dImport'
import {
  getUserDataDir,
  getModelsDir as resolveModelsDir,
} from '../utils/paths'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('ModelIpc')

/**
 * 获取用户模型目录 - userData/models/
 */
function getModelsDir(): string {
  return resolveModelsDir()
}

/**
 * 获取内置模型源目录（仅用于首次复制）
 */
function getBuiltinModelsDir(): string {
  if (app.isPackaged) {
    // 生产环境：从 extraResources 中读取（app.asar 外部）
    // extraResources 会被复制到 process.resourcesPath 目录
    return path.join(process.resourcesPath, 'live2d-models')
  }
  else {
    // 开发环境：从项目目录读取
    return path.join(process.cwd(), 'src/renderer/public/Resources')
  }
}

const CONFIG_FILE_NAME = 'model-config.json'
const INIT_FLAG_FILE = '.models-initialized'

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
  return path.join(getUserDataDir(), CONFIG_FILE_NAME)
}

/**
 * 获取初始化标记文件路径
 */
function getInitFlagPath(): string {
  return path.join(getUserDataDir(), INIT_FLAG_FILE)
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
 * @returns 返回复制的模型数量
 */
async function copyBuiltinModels(): Promise<number> {
  const builtinDir = getBuiltinModelsDir()
  const userDir = getModelsDir()

  logger.info(`检查内置模型目录: ${builtinDir}`)

  // 检查内置模型目录是否存在
  if (!(await fs.pathExists(builtinDir))) {
    logger.warn(`内置模型目录不存在: ${builtinDir}`)
    return 0
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
      // 源目录可能是 555；copy 保留 mode 后需可写，否则 ensureModelJson 会 EACCES
      await ensureWritableTree(targetPath)
      // 内置模型已是扁平结构；缺 model.json 时补一份
      await ensureModelJson(targetPath)
      copiedCount++
    }

    logger.info(`内置模型复制完成，共复制 ${copiedCount} 个模型`)
    return copiedCount
  }
  catch (error) {
    logger.error('复制内置模型失败', error)
    return 0
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
  const copiedCount = await copyBuiltinModels()

  // 只有成功复制了模型才标记为已初始化
  if (copiedCount > 0) {
    await markModelsInitialized()
    logger.info(`模型初始化成功，已复制 ${copiedCount} 个模型`)
  }
  else {
    logger.warn('没有复制任何模型，不标记为已初始化')
  }
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
 * id = 文件夹名（导入后的 stableId）；name 优先 model.meta.json.displayName
 *
 * 半导入/只读目录（EACCES）时 ensureModelJson 会尝试 chmod 后重试；
 * 仍失败则 warn 跳过，避免列表扫描被单目录打爆。
 */
async function parseModelInfo(modelPath: string, modelId: string): Promise<ModelInfo | null> {
  try {
    const modelJsonPath = path.join(modelPath, 'model.json')

    // 规范化列表要求 model.json；兼容旧目录尝试从 *.model3.json 补齐
    if (!(await fs.pathExists(modelJsonPath))) {
      const ensured = await ensureModelJson(modelPath)
      if (!ensured && !(await fs.pathExists(modelJsonPath))) {
        logger.warn(`模型缺少 model.json（跳过）: ${modelPath}`)
        return null
      }
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

    const meta = await readModelMeta(modelPath)
    const displayName = meta?.displayName?.trim() || modelId

    return {
      id: modelId,
      name: displayName,
      path: modelPath,
      preview: preview || undefined,
      hasExpressions: expressions.length > 0,
      hasMotions: motionCount > 0,
      expressionCount: expressions.length,
      motionCount,
    }
  }
  catch (error) {
    const code = error && typeof error === 'object'
      ? (error as NodeJS.ErrnoException).code
      : undefined
    if (code === 'EACCES' || code === 'EPERM') {
      logger.warn(`解析模型权限不足，跳过: ${modelPath}`, error)
      return null
    }
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
 * 注册模型管理 IPC 处理器
 */
export function registerModelIpc(): void {
  // 初始化模型目录（首次启动时复制内置模型）
  initializeModels().catch(err => logger.error('初始化模型目录失败', err))

  createIpcHandler({
    channel: 'model:get-list',
    handler: async () => {
      return success(await getModelList())
    },
  })

  createIpcHandler({
    channel: 'model:get-current',
    handler: async () => {
      const config = await getConfig()
      return success(config.currentModel)
    },
  })

  createIpcHandler({
    channel: 'model:set-current',
    schema: {
      modelId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, modelIdUnknown: unknown) => {
      const modelId = String(modelIdUnknown)
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

      return success()
    },
  })

  createIpcHandler({
    channel: 'model:select-folder',
    handler: async () => {
      return success(await dialog.showOpenDialog({
        title: '选择 Live2D 模型文件夹',
        properties: ['openDirectory'],
      }))
    },
  })

  createIpcHandler({
    channel: 'model:import',
    schema: {
      sourcePath: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, sourcePathUnknown: unknown) => {
      const sourcePath = String(sourcePathUnknown)
      const modelsDir = getModelsDir()
      logger.info(`导入模型: ${sourcePath}`)

      const result = await importNormalizedLive2dModel({ sourcePath, modelsDir })
      if (!result.success) {
        return failure(result.error)
      }

      const { stableId, displayName, targetPath, modelRoot } = result.data
      logger.info(
        `模型已规范化导入: stableId=${stableId}, displayName=${displayName}, `
        + `from=${modelRoot}, to=${targetPath}`,
      )

      // modelId 放在 data 内，preload 用 unwrapIpcResult 取 data（兼容现有 UI）
      return success({ modelId: stableId, displayName })
    },
  })

  createIpcHandler({
    channel: 'model:delete',
    schema: {
      modelId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, modelIdUnknown: unknown) => {
      const modelId = String(modelIdUnknown)
      const modelsDir = getModelsDir()
      const modelPath = path.join(modelsDir, modelId)

      // 检查模型是否存在
      if (!(await fs.pathExists(modelPath))) {
        return failure('模型不存在')
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

      return success()
    },
  })

  createIpcHandler({
    channel: 'model:open-folder',
    handler: async () => {
      const modelsDir = getModelsDir()
      await ensureDirectories()
      shell.openPath(modelsDir)
      return success()
    },
  })

  createIpcHandler({
    channel: 'model:get-folder-path',
    handler: async () => {
      return success(getModelsDir())
    },
  })

  logger.info('模型管理 IPC 处理器已注册')
}
