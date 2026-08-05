/**
 * 显示模式切换工具定义
 */

import { getLogger } from '../../../utils/logger'
import {
  getCurrentDisplayMode,
  toggleToChat,
  toggleToLive2d,
  toggleToMain,
  toggleToMini,
  toggleToPets,
} from '../../../windows/windowManager'
import { PropertyList, PropertyType } from '../../types'
import { defineTool } from '../registry'

const logger = getLogger('DisplayModeTools')

const DISPLAY_MODES = ['main', 'mini', 'chat', 'live2d', 'pets'] as const
type DisplayMode = (typeof DISPLAY_MODES)[number]

const MODE_LABELS: Record<DisplayMode, string> = {
  main: '标准窗口',
  mini: '迷你悬浮球',
  chat: '聊天视图',
  live2d: 'Live2D 桌面宠物',
  pets: '精灵宠物',
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return typeof value === 'string' && (DISPLAY_MODES as readonly string[]).includes(value)
}

function switchToMode(mode: DisplayMode): void {
  switch (mode) {
    case 'mini':
      toggleToMini()
      break
    case 'chat':
      toggleToChat()
      break
    case 'live2d':
      toggleToLive2d()
      break
    case 'pets':
      toggleToPets()
      break
    default:
      toggleToMain()
      break
  }
}

/**
 * 设置显示模式
 */
defineTool({
  name: 'self.ui.set_display_mode',
  description: `Switch the application display mode (main window / mini ball / chat / Live2D pet / sprite pet).

Use this tool when:
1. User wants to change how the app is shown on desktop
2. User says "切换到迷你模式", "打开聊天视图", "换成桌宠", "显示主界面"
3. User asks to show Live2D pet, sprite pet, mini floating ball, or standard window

Parameters:
- mode: Display mode to switch to
  - "main": Standard main window (标准窗口 / 主界面)
  - "mini": Mini floating ball (迷你悬浮球)
  - "chat": Chat view (聊天视图)
  - "live2d": Live2D desktop pet (Live2D 桌面宠物)
  - "pets": Sprite pet (精灵宠物)

Examples:
- "切换到主界面" -> mode="main"
- "变成悬浮球" / "迷你模式" -> mode="mini"
- "打开聊天" / "聊天视图" -> mode="chat"
- "换成 Live2D 桌宠" -> mode="live2d"
- "切换到精灵宠物" -> mode="pets"`,
  properties: new PropertyList([
    {
      name: 'mode',
      type: PropertyType.STRING,
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const mode = args.mode

      if (!isDisplayMode(mode)) {
        logger.warn(`无效的显示模式: ${String(mode)}`)
        return JSON.stringify({
          success: false,
          message: `Invalid display mode: ${String(mode)}. Must be one of: ${DISPLAY_MODES.join(', ')}`,
        })
      }

      const previous = getCurrentDisplayMode()
      logger.info(`设置显示模式: ${previous} -> ${mode}`)
      switchToMode(mode)

      const current = getCurrentDisplayMode()
      return JSON.stringify({
        success: true,
        mode: current,
        label: MODE_LABELS[current],
        previous,
        message: `Display mode set to ${current} (${MODE_LABELS[current]})`,
      })
    }
    catch (error) {
      logger.error('设置显示模式失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '设置显示模式失败',
      })
    }
  },
})

/**
 * 获取当前显示模式
 */
defineTool({
  name: 'self.ui.get_display_mode',
  description: `Get the current application display mode.

Use when:
- User asks about current display mode / 当前是什么界面
- Need to check mode before switching
- User says "现在是主界面吗?", "what display mode am I in?"

Returns:
- mode: one of "main" | "mini" | "chat" | "live2d" | "pets"
- label: Chinese label for the mode`,
  properties: new PropertyList([]),
  callback: async (_args: Record<string, unknown>): Promise<string> => {
    try {
      const mode = getCurrentDisplayMode()
      logger.info('获取当前显示模式:', mode)
      return JSON.stringify({
        success: true,
        mode,
        label: MODE_LABELS[mode],
        modes: DISPLAY_MODES.map(value => ({
          value,
          label: MODE_LABELS[value],
        })),
      })
    }
    catch (error) {
      logger.error('获取显示模式失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '获取显示模式失败',
      })
    }
  },
})
