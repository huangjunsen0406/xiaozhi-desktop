/**
 * Live2D 模型文件协议注册
 *
 * 注册 live2d-model:// 自定义协议，用于渲染进程访问 userData/models/ 目录中的模型文件
 *
 * 用法:
 * - live2d-model://ModelName/model.json
 * - live2d-model://ModelName/texture.png
 */
import path from 'node:path'
import { app, net, protocol } from 'electron'
import fs from 'fs-extra'

import { getLogger } from './logger'

const logger = getLogger('ModelProtocol')

/**
 * 获取用户模型目录
 */
function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
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
  ])
  logger.info('live2d-model:// 协议方案已注册')
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

      // 安全检查：确保路径在 models 目录内
      const normalizedPath = path.normalize(fullPath)
      if (!normalizedPath.startsWith(modelsDir)) {
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
}
