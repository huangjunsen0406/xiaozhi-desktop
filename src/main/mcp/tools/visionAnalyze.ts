/**
 * 视觉分析公共模块
 * 封装 localVL / MCPVision / 未配置三种分支的图片分析逻辑
 */

import { Buffer } from 'node:buffer'
import OpenAI from 'openai'
import { DatabaseManager } from '../../services/database'
import { getLogger } from '../../utils/logger'
import { getMcpContext } from '../McpContext'

const logger = getLogger('VisionAnalyze')

/**
 * 图片上传 / data URL 使用的 MIME 类型
 */
export type VisionMime = 'image/jpeg' | 'image/png'

/**
 * 分析图片的公共方法
 * 封装 localVL / MCPVision / 未配置三种分支
 *
 * @param base64Image 图片 base64
 * @param question 用户问题
 * @param mime 图片真实 MIME，默认 image/jpeg（兼容摄像头侧旧调用）
 */
export async function analyzeImage(
  base64Image: string,
  question: string,
  mime: VisionMime = 'image/jpeg',
): Promise<string> {
  const mcpContext = getMcpContext()
  const visionConfig = mcpContext.getVisionConfig()

  const db = DatabaseManager.getInstance()
  const cameraConfig = db.getFormattedCameraConfig()

  const useLocalVision = cameraConfig.useLocalVision

  if (useLocalVision && cameraConfig.vlApiKey && cameraConfig.vlUrl) {
    logger.info('使用本地 VL API 分析图片')
    return await analyzeImageWithLocalVL(base64Image, question, cameraConfig, mime)
  }
  else if (visionConfig.url && visionConfig.token) {
    logger.info('使用 MCP vision API 分析图片')
    return await analyzeImageWithMCPVision(base64Image, question, {
      url: visionConfig.url,
      token: visionConfig.token,
    }, mime)
  }
  else {
    logger.warn('未配置 vision API')
    return JSON.stringify({
      success: false,
      message: '未配置视觉分析 API，无法分析图片内容',
    })
  }
}

/**
 * 使用本地 VL API 分析图片
 */
async function analyzeImageWithLocalVL(
  base64Image: string,
  question: string,
  config: { vlUrl: string, vlApiKey: string, vlModel: string },
  mime: VisionMime,
): Promise<string> {
  try {
    const client = new OpenAI({
      apiKey: config.vlApiKey,
      baseURL: config.vlUrl,
    })

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mime};base64,${base64Image}`,
            },
          },
          {
            type: 'text',
            text: question || '图中描绘的是什么景象？请详细描述。',
          },
        ],
      },
    ]

    logger.info(`发送请求到智谱 AI: ${config.vlUrl}`)

    const completion = await client.chat.completions.create({
      model: config.vlModel,
      messages,
      stream: true,
    })

    let result = ''
    for await (const chunk of completion) {
      if (chunk.choices && chunk.choices[0]?.delta?.content) {
        result += chunk.choices[0].delta.content
      }
    }

    logger.info('本地 VL 分析完成')

    return JSON.stringify({
      success: true,
      text: result,
    })
  }
  catch (error) {
    logger.error('本地 VL API 分析失败:', error)
    return JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : '分析失败',
    })
  }
}

/**
 * 使用 MCP vision API 分析图片
 */
async function analyzeImageWithMCPVision(
  base64Image: string,
  question: string,
  config: { url: string, token: string },
  mime: VisionMime,
): Promise<string> {
  try {
    const imageBuffer = Buffer.from(base64Image, 'base64')

    const filename = mime === 'image/png' ? 'screenshot.png' : 'screenshot.jpg'

    const formData = new FormData()
    formData.append('question', question)
    const blob = new Blob([Uint8Array.from(imageBuffer)], { type: mime })
    formData.append('file', blob, filename)

    const headers: Record<string, string> = {}

    const db = DatabaseManager.getInstance()
    const cameraConfig = db.getFormattedCameraConfig()
    if (cameraConfig.deviceId)
      headers['Device-Id'] = cameraConfig.deviceId

    if (config.token)
      headers.Authorization = `Bearer ${config.token}`

    logger.info('发送请求到:', config.url)

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!response.ok) {
      const errorMsg = `Failed to analyze screenshot, status code: ${response.status}`
      logger.error(`${errorMsg}`)
      return JSON.stringify({
        success: false,
        message: errorMsg,
      })
    }

    const result = await response.text()
    logger.info(`分析完成: ${result}`)

    try {
      const jsonResult = JSON.parse(result)
      if ('success' in jsonResult) {
        return result
      }
      return JSON.stringify({
        success: true,
        text: jsonResult.text || result,
      })
    }
    catch {
      return JSON.stringify({
        success: true,
        text: result,
      })
    }
  }
  catch (error) {
    logger.error('MCP vision API 分析失败:', error)
    return JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : '分析失败',
    })
  }
}
