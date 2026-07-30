import type { IpcContext } from '../types/ipc'
import { DeviceStateValue, ListeningModeValue } from '@shared/types'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'
import { registerShortcutIpcChannels } from './shortcutIpc'
import { registerWakeWordIpc } from './wakeWordIpc'

const logger = getLogger('AppIpc')

/**
 * 注册应用控制相关的 IPC 通道（统一 createIpcHandler + IpcResult）
 */
export function registerAppIpc(context: IpcContext): void {
  const { container } = context
  logger.info('注册应用控制 IPC 通道...')

  registerWakeWordIpc(context)
  registerShortcutIpcChannels(container)

  createIpcHandler({
    channel: 'app:start-listening-manual',
    handler: async () => {
      await container.startListeningManual()
      return success()
    },
  })

  createIpcHandler({
    channel: 'app:stop-listening-manual',
    handler: async () => {
      await container.stopListeningManual()
      return success()
    },
  })

  createIpcHandler({
    channel: 'app:start-auto-conversation',
    handler: async () => {
      await container.startAutoConversation()
      return success()
    },
  })

  createIpcHandler({
    channel: 'app:stop-auto-conversation',
    handler: async () => {
      await container.stopAutoConversation()
      return success()
    },
  })

  createIpcHandler({
    channel: 'app:get-state',
    handler: () => {
      try {
        return success(container.getStateSnapshot())
      }
      catch (error) {
        logger.error('获取状态快照失败:', error)
        return success({
          deviceState: DeviceStateValue.IDLE,
          listeningMode: ListeningModeValue.MANUAL,
          keepListening: false,
          channelOpen: false,
        })
      }
    },
  })

  createIpcHandler({
    channel: 'app:send-text',
    schema: {
      text: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 500,
      },
    },
    handler: async (_event, text: unknown) => {
      await container.sendText(String(text))
      return success()
    },
  })

  logger.info('应用控制 IPC 通道已注册')
}
