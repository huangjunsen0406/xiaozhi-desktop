import type { Application } from '../services/Application'
import type { JsonMessage } from '../types/protocol'
import { ThingManager } from '../iot'
import { Plugin } from './Plugin'

import { createLogger } from '../utils/logger'

const logger = createLogger('IoTPlugin')

/**
 * IoT 插件
 * 负责接收服务端的 IoT 消息并控制设备
 *
 * 注意：IoT 设备只通过服务端命令控制，不提供前端 UI 控制
 */
export class IoTPlugin extends Plugin {
  readonly name = 'IoTPlugin'
  readonly priority = 50 // 独立服务，默认优先级

  readonly metadata = {
    name: 'IoTPlugin',
    version: '1.0.0',
    description: 'IoT 插件，负责设备控制（仅示例）',
    author: 'Junsen',
  }

  private thingManager: ThingManager | null = null

  /**
   * 插件初始化
   */
  async setup(app: Application): Promise<void> {
    await super.setup(app)

    logger.info('初始化...')

    try {
      // 初始化设备管理器
      this.thingManager = ThingManager.getInstance()
      await this.thingManager.initialize()

      logger.info('✓ 初始化完成')
    }
    catch (error) {
      logger.error('✗ 初始化失败', error)
      // 不抛出错误，允许应用继续运行
    }
  }

  /**
   * 协议连接后回调
   */
  async onProtocolConnected(): Promise<void> {
    if (!this.thingManager) {
      logger.warn('ThingManager 未初始化')
      return
    }

    try {
      const protocol = this.app?.getProtocol()
      if (!protocol) {
        logger.warn('Protocol 不可用')
        return
      }

      // 发送设备描述符
      const descriptors = await this.thingManager.getDescriptors()
      await protocol.sendIotDescriptors(descriptors)

      // 发送初始状态
      const { states } = await this.thingManager.getStates(false)
      // @ts-expect-error - states 是 ThingState[] 数组,但 sendIotStates 期望 Record 或 string
      await protocol.sendIotStates(states)

      logger.info('✓ 已发送设备描述符和状态')
    }
    catch (error) {
      logger.error('发送设备信息失败', error)
    }
  }

  /**
   * 接收到 JSON 消息回调
   */
  async onIncomingJson(message: JsonMessage): Promise<void> {
    try {
      // 只处理 IoT 类型的消息
      if (message.type !== 'iot') {
        return
      }

      const commands = message.commands
      if (!commands || !Array.isArray(commands) || commands.length === 0) {
        logger.warn('消息中没有命令')
        return
      }

      if (!this.thingManager) {
        logger.error('ThingManager 未初始化')
        return
      }

      // 执行每个命令
      for (const command of commands) {
        try {
          const result = await this.thingManager.invoke(command)
          logger.info(`执行命令结果:`, result)
        }
        catch (error) {
          logger.error(`执行命令失败:`, error)
        }
      }

      // 执行后下发最新状态（只发变化）
      try {
        const { changed, states } = await this.thingManager.getStates(true)
        if (changed) {
          const protocol = this.app?.getProtocol()
          if (protocol) {
            // @ts-expect-error - states 是 ThingState[] 数组,但 sendIotStates 期望 Record 或 string
            await protocol.sendIotStates(states)
            logger.info('✓ 已发送设备状态更新')
          }
        }
      }
      catch (error) {
        logger.error('发送状态更新失败', error)
      }
    }
    catch (error) {
      logger.error('处理消息失败', error)
    }
  }

  /**
   * 插件关闭
   */
  async shutdown(): Promise<void> {
    logger.info('正在关闭...')

    this.thingManager = null

    await super.shutdown()

    logger.info('✓ 已关闭')
  }
}
