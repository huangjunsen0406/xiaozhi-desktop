/**
 * 定时器工具定义
 */

import { getLogger } from '../../../utils/logger'
import { getTimerServiceFromRuntime } from '../../McpContext'
import { PropertyList, PropertyType } from '../../types'
import { defineTool } from '../registry'

const logger = getLogger('TimerTools')

/**
 * 启动倒计时
 */
defineTool({
  name: 'self.timer.start_countdown',
  description: `Start a countdown timer that will execute an MCP tool after a specified delay.
The command should be a JSON string containing MCP tool name and arguments.
For example: '{"name": "self.audio_speaker.set_volume", "arguments": {"volume": 50}}'

Use this when the user wants to:
1. Set a timer to control system settings (volume, device status, etc.)
2. Schedule delayed MCP tool executions
3. Create reminders with automatic tool calls

Parameters:
- command: JSON string with MCP tool name and arguments (required)
- delay: Delay time in seconds (1-3600, default: 5)
- description: Task description (optional)

The timer will return a timer_id that can be used to cancel it later.

Examples:
- "5秒后把音量调到50" -> command='{"name":"self.audio_speaker.set_volume","arguments":{"volume":50}}', delay=5
- "1分钟后截个屏" -> command='{"name":"self.screenshot.take","arguments":{}}', delay=60
- "30秒后打开QQ" -> command='{"name":"self.application.launch","arguments":{"app_name":"QQ"}}', delay=30`,
  properties: new PropertyList([
    {
      name: 'command',
      type: PropertyType.STRING,
    },
    {
      name: 'delay',
      type: PropertyType.INTEGER,
      defaultValue: 5,
      minValue: 1,
      maxValue: 3600,
    },
    {
      name: 'description',
      type: PropertyType.STRING,
      defaultValue: '',
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const command = args.command as string
      const delay = args.delay as number | undefined
      const description = (args.description as string) || ''

      logger.info(`启动倒计时 - 命令: ${command}, 延迟: ${delay}秒`)

      const timerService = getTimerServiceFromRuntime()
      const result = await timerService.startCountdown(command, delay, description)

      logger.info('倒计时启动结果:', result)
      return JSON.stringify(result, null, 2)
    }
    catch (error) {
      logger.error('启动倒计时失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '启动倒计时失败',
      })
    }
  },
})

/**
 * 取消倒计时
 */
defineTool({
  name: 'self.timer.cancel_countdown',
  description: `Cancel an active countdown timer by its ID.

Use this when the user wants to:
1. Cancel a previously set timer
2. Stop a scheduled action before it executes

Parameters:
- timer_id: The ID of the timer to cancel (returned when starting a countdown)

Examples:
- "取消倒计时 1" -> timer_id=1
- "Cancel timer 2" -> timer_id=2`,
  properties: new PropertyList([
    {
      name: 'timer_id',
      type: PropertyType.INTEGER,
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const timerId = args.timer_id as number

      logger.info(`取消倒计时 ${timerId}`)

      const timerService = getTimerServiceFromRuntime()
      const result = await timerService.cancelCountdown(timerId)

      logger.info('倒计时取消结果:', result)
      return JSON.stringify(result, null, 2)
    }
    catch (error) {
      logger.error('取消倒计时失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '取消倒计时失败',
      })
    }
  },
})

/**
 * 获取活动倒计时
 */
defineTool({
  name: 'self.timer.get_active_timers',
  description: `Get information about all currently active countdown timers.
Returns details including timer IDs, remaining time, commands to execute, and progress for each active timer.

Use this when the user wants to:
1. Check what timers are currently running
2. See remaining time for active timers
3. Get timer IDs for cancellation
4. Monitor timer progress and status

Examples:
- "有哪些倒计时正在运行?" -> Get all active timers
- "Show me active timers" -> Get all active timers
- "查看所有定时任务" -> Get all active timers`,
  properties: new PropertyList([]),
  callback: async (_args: Record<string, unknown>): Promise<string> => {
    try {
      logger.info('获取活动倒计时列表')

      const timerService = getTimerServiceFromRuntime()
      const result = await timerService.getActiveTimers()

      logger.info(`当前活动倒计时数量: ${result.totalActiveTimers}`)
      return JSON.stringify(result, null, 2)
    }
    catch (error) {
      logger.error('获取活动倒计时失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '获取活动倒计时失败',
      })
    }
  },
})
