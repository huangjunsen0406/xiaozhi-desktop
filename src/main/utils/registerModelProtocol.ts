/**
 * 自定义协议注册
 *
 * live2d-model:// — 访问 userData/models/ 中的 Live2D 模型文件
 * sprite-pet://   — 访问 userData/pets/ 或 ~/.codex/pets 中的精灵宠物文件
 */
import path from 'node:path'
import { net, protocol } from 'electron'
import fs from 'fs-extra'

import { getCodexPetsDir, resolvePetDir } from '../services/petPaths'
import { getLogger } from './logger'
import {
  isPathInside,
  getModelsDir as resolveModelsDir,
  getPetsDir as resolvePetsDir,
} from './paths'

const logger = getLogger('ModelProtocol')

/**
 * 获取用户模型目录
 */
function getModelsDir(): string {
  return resolveModelsDir()
}

function getPetsDir(): string {
  return resolvePetsDir()
}

/**
 * 注册 live2d-model:// 协议（需要在 app ready 之前调用）
 */
export function registerModelProtocolScheme(): void {
  // 注册协议方案为特权协议
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'live2d-model',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
    {
      scheme: 'sprite-pet',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ])
  logger.info('live2d-model:// + sprite-pet:// 协议方案已注册')
}

/**
 * 注册协议处理器（需要在 app ready 之后调用）
 */
export function registerModelProtocolHandler(): void {
  protocol.handle('live2d-model', async (request) => {
    try {
      // 解析 URL: live2d-model://ModelName/path/to/file
      const url = new URL(request.url)
      // hostname 是模型名，pathname 是文件路径
      const modelName = url.hostname
      const filePath = decodeURIComponent(url.pathname)

      if (!modelName) {
        logger.error('无效的模型协议 URL: 缺少模型名', request.url)
        return new Response('Model name required', { status: 400 })
      }

      // 构建完整路径
      const modelsDir = getModelsDir()
      const fullPath = path.join(modelsDir, modelName, filePath)

      // 安全检查：确保路径在 models 目录内（resolve + 分隔符边界）
      const normalizedPath = path.resolve(fullPath)
      if (!isPathInside(modelsDir, normalizedPath)) {
        logger.error('路径越界访问被拒绝', { requested: fullPath, modelsDir })
        return new Response('Access denied', { status: 403 })
      }

      // 检查文件是否存在
      if (!(await fs.pathExists(normalizedPath))) {
        logger.warn('模型文件不存在', normalizedPath)
        return new Response('File not found', { status: 404 })
      }

      // 使用 net.fetch 从文件系统读取
      // Windows: D:\path\to\file -> file:///D:/path/to/file
      // macOS/Linux: /path/to/file -> file:///path/to/file
      const pathWithForwardSlashes = normalizedPath.replace(/\\/g, '/')
      const fileUrl = pathWithForwardSlashes.startsWith('/')
        ? `file://${pathWithForwardSlashes}`
        : `file:///${pathWithForwardSlashes}`
      return net.fetch(fileUrl)
    }
    catch (error) {
      logger.error('处理模型协议请求失败', error)
      return new Response('Internal server error', { status: 500 })
    }
  })

  logger.info('live2d-model:// 协议处理器已注册')

  // 注册 sprite-pet:// 协议处理器（local 优先，其次 codex 只读）
  // 通过 resolvePetDir 支持 pet.json.id ≠ 文件夹名
  protocol.handle('sprite-pet', async (request) => {
    try {
      const url = new URL(request.url)
      // hostname 可能是 URL 编码的中文 id（如 gugugaga小企鹅）
      const petId = decodeURIComponent(url.hostname)
      // pathname 形如 /spritesheet.webp，去掉前导 / 再 join，避免 path.join 丢弃 root
      const rawPath = decodeURIComponent(url.pathname)
      const relativeFile = rawPath.replace(/^[/\\]+/, '')

      if (!petId) {
        return new Response('Pet ID required', { status: 400 })
      }

      const petDir = await resolvePetDir(petId)
      if (!petDir) {
        return new Response('File not found', { status: 404 })
      }

      const candidate = path.resolve(path.join(petDir, relativeFile))
      const localRoot = getPetsDir()
      const codexRoot = getCodexPetsDir()
      if (!isPathInside(localRoot, candidate) && !isPathInside(codexRoot, candidate)) {
        logger.error('精灵宠物路径越界访问被拒绝', { requested: candidate, petId })
        return new Response('Access denied', { status: 403 })
      }

      if (!(await fs.pathExists(candidate))) {
        return new Response('File not found', { status: 404 })
      }

      const pathWithForwardSlashes = candidate.replace(/\\/g, '/')
      const fileUrl = pathWithForwardSlashes.startsWith('/')
        ? `file://${pathWithForwardSlashes}`
        : `file:///${pathWithForwardSlashes}`
      return net.fetch(fileUrl)
    }
    catch (error) {
      logger.error('处理精灵宠物协议请求失败', error)
      return new Response('Internal server error', { status: 500 })
    }
  })

  logger.info('sprite-pet:// 协议处理器已注册')
}
