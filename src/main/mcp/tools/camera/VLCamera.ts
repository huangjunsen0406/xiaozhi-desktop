import type { AnalyzeResult, CameraToolConfig } from './types'
import OpenAI from 'openai'
import { getLogger } from '../../../utils/logger'

import { BaseCamera } from './BaseCamera'

const logger = getLogger('VLCamera')

export class VLCamera extends BaseCamera {
  private static instance: VLCamera | null = null
  private client: OpenAI
  private model: string

  private constructor(
    apiKey: string,
    baseUrl: string,
    model: string,
    config?: Partial<CameraToolConfig>,
  ) {
    super(config)
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    })
    this.model = model
    logger.info(`初始化 VL 摄像头，模型: ${model}`)
  }

  static getInstance(
    apiKey: string,
    baseUrl: string,
    model: string,
    config?: Partial<CameraToolConfig>,
  ): VLCamera {
    if (!VLCamera.instance) {
      VLCamera.instance = new VLCamera(apiKey, baseUrl, model, config)
    }
    return VLCamera.instance
  }

  static resetInstance(): void {
    VLCamera.instance = null
  }

  async analyze(question: string): Promise<AnalyzeResult> {
    try {
      if (!this.jpegBuffer) {
        return {
          success: false,
          message: 'Camera buffer is empty',
        }
      }

      logger.info(`开始分析图像, 问题: ${question}`)

      const imageBase64 = this.jpegBuffer.toString('base64')

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
            {
              type: 'text',
              text: question || '图中描绘的是什么景象？请详细描述。',
            },
          ],
        },
      ]

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
      })

      let result = ''
      for await (const chunk of completion) {
        if (chunk.choices && chunk.choices[0]?.delta?.content) {
          result += chunk.choices[0].delta.content
        }
      }

      logger.info(`分析完成, 问题: ${question}`)
      return { success: true, text: result }
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to analyze image with VL'
      logger.error('分析图像失败', error)
      return { success: false, message: errorMsg }
    }
  }
}
