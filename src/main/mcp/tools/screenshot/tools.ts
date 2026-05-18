/**
 * 截图工具定义
 */

import type { ChatPlugin } from '../../../plugins/ChatPlugin'

import { getServiceContainer } from '../../../core/ServiceContainer'
import { getLogger } from '../../../utils/logger'
import { PropertyList, PropertyType } from '../../types'
import { defineTool } from '../registry'
import { analyzeImage } from '../visionAnalyze'
import { ScreenshotTool } from './ScreenshotTool'

const logger = getLogger('ScreenshotTools')

/**
 * 截图工具
 */
defineTool({
  name: 'self.screenshot.take',
  description: `Take a screenshot of the desktop and analyze it with vision AI. This tool captures the current screen content and can answer questions about what's displayed.

Use this tool when:
1. User asks to take a screenshot or capture the screen
2. User wants to know what's on their screen
3. User asks questions like "what's on my screen?", "screenshot", "截个屏", "看看我的屏幕"
4. User wants to analyze or describe screen content

Parameters:
- question: Optional question about the screenshot (e.g., "What's on the screen?", "屏幕上有什么?")
  If empty, will provide a general description of the screen content.
- display: Optional display selection (default: all displays)
  - "main" or "主屏": Main/primary display only
  - "secondary" or "副屏": Secondary display only
  - "1", "2", "3"...: Specific display number
  - Empty or omitted: Capture all displays

The tool will:
1. Capture the specified display(s)
2. Analyze the image using vision AI
3. Return a description or answer to the question

Examples:
- "截个屏" -> Takes screenshot of all displays and describes what's shown
- "看看我主屏上有什么" -> Screenshots main display only and describes content
- "帮我看看第二个屏幕显示的是什么" -> Screenshots secondary display and analyzes it`,
  properties: new PropertyList([
    {
      name: 'question',
      type: PropertyType.STRING,
      defaultValue: '',
    },
    {
      name: 'display',
      type: PropertyType.STRING,
      defaultValue: '',
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const question = (args.question as string) || ''
      const display = (args.display as string) || null

      logger.info(`截图, 问题: ${question}, 显示器: ${display}`)

      const screenshotTool = ScreenshotTool.getInstance()

      const result = await screenshotTool.capture({ display })

      if (!result.success || !result.base64) {
        logger.error('截图失败:', result.message)
        return JSON.stringify({
          success: false,
          message: result.message || '截图失败',
        })
      }

      logger.info('截图成功，开始分析...')

      const container = getServiceContainer()
      const chatPlugin = container.getPluginManager().getPlugin<ChatPlugin>('ChatPlugin')
      await chatPlugin?.saveImage(result.base64, 'screenshot')

      return await analyzeImage(
        result.base64,
        question || '请描述这张截图的内容',
        result.mime,
      )
    }
    catch (error) {
      logger.error('截图失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '截图失败',
      })
    }
  },
})
