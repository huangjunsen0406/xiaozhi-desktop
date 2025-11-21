import { onMounted, onUnmounted } from 'vue'
import { useCallStore } from '../stores/call'

/**
 * 服务器消息类型
 */
interface ServerMessage {
  type: string
  [key: string]: any
}

/**
 * 使用服务器消息
 * 监听服务器消息并更新 store
 */
export function useServerMessage() {
  const callStore = useCallStore()

  /**
   * 处理服务器消息
   */
  const handleServerMessage = (message: ServerMessage) => {
    const msgType = message.type

    // 处理 LLM 消息（表情）
    if (msgType === 'llm' && message.emotion) {
      callStore.updateEmotion(message.emotion)
    }

    // 处理 TTS 消息（助手回复）
    if (msgType === 'tts' && message.text) {
      callStore.updateCurrentText(message.text)
      // 如果是完整消息，添加到消息列表
      if (message.state === 'stop') {
        callStore.addMessage('assistant', message.text)
      }
    }

    // 处理 STT 消息（用户输入）
    if (msgType === 'stt' && message.text) {
      callStore.updateCurrentText(message.text)
      // 如果是完整消息，添加到消息列表
      if (message.state === 'stop') {
        callStore.addMessage('user', message.text)
      }
    }
  }

  onMounted(() => {
    // 监听服务器消息
    window.api.appOnServerMessage(handleServerMessage)
  })

  onUnmounted(() => {
    // 移除监听器
    window.api.appRemoveServerMessageListener()
  })

  return {

  }
}
