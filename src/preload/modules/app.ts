import type { AppStateSnapshot, ServerMessage } from '@shared/types'
import { invokeData, invokeVoid, subscribeChannel } from '../utils/ipc'

export const appApi = {
  startListeningManual: (): Promise<void> =>
    invokeVoid('app:start-listening-manual', '开始手动监听失败'),

  stopListeningManual: (): Promise<void> =>
    invokeVoid('app:stop-listening-manual', '停止手动监听失败'),

  startAutoConversation: (): Promise<void> =>
    invokeVoid('app:start-auto-conversation', '开始自动对话失败'),

  stopAutoConversation: (): Promise<void> =>
    invokeVoid('app:stop-auto-conversation', '停止自动对话失败'),

  sendText: (text: string): Promise<void> =>
    invokeVoid('app:send-text', '发送文本消息失败', text),

  getState: (): Promise<AppStateSnapshot> =>
    invokeData('app:get-state', '获取状态快照失败'),

  onStateChanged: (callback: (state: AppStateSnapshot) => void): () => void =>
    subscribeChannel('app:state-changed', callback),

  onServerMessage: (callback: (message: ServerMessage) => void): () => void =>
    subscribeChannel('server:message', callback),
}
