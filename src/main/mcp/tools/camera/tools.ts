/**
 * 摄像头工具定义
 */

import type { ChatPlugin } from '../../../plugins/ChatPlugin'

import { getServiceContainer } from '../../../core/ServiceContainer'
import { DatabaseManager } from '../../../services/database'
import { getLogger } from '../../../utils/logger'
import { PropertyList, PropertyType } from '../../types'
import { defineTool } from '../registry'
import { analyzeImage } from '../visionAnalyze'
import { getCameraInstance } from './index'

const logger = getLogger('CameraTools')

/**
 * 拍照工具
 */
defineTool({
  name: 'self.camera.take_photo',
  description: `Take a photo using the system camera and analyze it with vision AI. This tool captures an image from the user's webcam and can answer questions about what's in the image.

Use this tool when:
1. User asks to take a photo or picture
2. User wants to see what's in front of the camera
3. User asks questions like "what do you see?", "take a photo", "看看我"
4. User wants visual analysis or image recognition

Parameters:
- question: Optional question about the image (e.g., "What's in this image?", "图中有什么?")
  If empty, will provide a general description of the image.

The tool will:
1. Request camera permission if needed
2. Capture a single frame from the webcam
3. Analyze the image using vision AI
4. Return a description or answer to the question

Examples:
- "拍张照" -> Takes photo and describes what's seen
- "看看我现在在哪里" -> Takes photo and describes the location/scene
- "帮我看看这是什么" -> Takes photo and identifies objects`,
  properties: new PropertyList([
    {
      name: 'question',
      type: PropertyType.STRING,
      defaultValue: '',
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const question = (args.question as string) || ''

      logger.info(`拍照, 问题: ${question}`)

      const db = DatabaseManager.getInstance()
      const cameraConfig = db.getFormattedCameraConfig()

      const cameraOptions = {
        vlApiKey: cameraConfig.useLocalVision ? cameraConfig.vlApiKey : '',
        vlUrl: cameraConfig.useLocalVision ? cameraConfig.vlUrl : '',
        vlModel: cameraConfig.vlModel || 'glm-4v-plus',
        deviceId: cameraConfig.deviceId || '',
        clientId: '',
      }

      const camera = getCameraInstance(cameraOptions)
      const captureResult = await camera.capture()

      if (!captureResult.success || !captureResult.data) {
        logger.error('拍照失败:', captureResult.message)
        return JSON.stringify({
          success: false,
          message: captureResult.message || '拍照失败',
        })
      }

      logger.info('拍照成功，开始分析...')

      const imageBase64 = captureResult.data.toString('base64')
      const container = getServiceContainer()
      const chatPlugin = container.getPluginManager().getPlugin<ChatPlugin>('ChatPlugin')
      await chatPlugin?.saveImage(imageBase64, 'camera')

      return await analyzeImage(imageBase64, question || '请描述这张照片的内容')
    }
    catch (error) {
      logger.error('拍照失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '拍照失败',
      })
    }
  },
})
