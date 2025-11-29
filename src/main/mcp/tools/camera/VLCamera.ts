import type { AnalyzeResult, CameraToolConfig, CaptureResult } from './types'
import { Buffer } from 'node:buffer'
import { BrowserWindow, ipcMain } from 'electron'
import OpenAI from 'openai'
import sharp from 'sharp'
import { BaseCamera } from './BaseCamera'

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
    console.log(`[VLCamera] 初始化 VL 摄像头，模型: ${model}`)
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

  async capture(): Promise<CaptureResult> {
    try {
      console.log('[VLCamera] 开始捕获图像...')

      const win = BrowserWindow.getFocusedWindow()
      if (!win) {
        console.error('[VLCamera] 未找到焦点窗口')
        return { success: false, message: '未找到焦点窗口' }
      }

      win.webContents.send('camera:request-capture')

      const imageData = await new Promise<Buffer>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('捕获图像超时'))
        }, 10000)

        ipcMain.once('camera:capture-result', (_event, data: { success: boolean, data?: Uint8Array, message?: string }) => {
          clearTimeout(timeout)
          if (data.success && data.data) {
            resolve(Buffer.from(data.data))
          }
          else {
            reject(new Error(data.message || '捕获失败'))
          }
        })
      })

      const resizedBuffer = await sharp(imageData)
        .resize(this.config.maxDimension, this.config.maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: this.config.jpegQuality })
        .toBuffer()

      this.setJpegBuffer(resizedBuffer)
      console.log(`[VLCamera] 图像捕获成功 (大小: ${resizedBuffer.length} 字节)`)

      return { success: true, data: resizedBuffer }
    }
    catch (error) {
      console.error('[VLCamera] 捕获图像失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '捕获图像失败',
      }
    }
  }

  async analyze(question: string): Promise<AnalyzeResult> {
    try {
      if (!this.jpegBuffer) {
        return {
          success: false,
          message: 'Camera buffer is empty',
        }
      }

      console.log(`[VLCamera] 开始分析图像, 问题: ${question}`)

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

      console.log(`[VLCamera] 分析完成, 问题: ${question}`)
      return { success: true, text: result }
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to analyze image with VL'
      console.error('[VLCamera] 分析图像失败:', error)
      return { success: false, message: errorMsg }
    }
  }
}
