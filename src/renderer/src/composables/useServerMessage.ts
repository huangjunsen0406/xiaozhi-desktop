import type { ServerMessage } from '../types/chat'
/**
 * 全局服务器消息监听 Composable
 * 统一处理所有窗口的服务器消息，并更新 app store
 */
import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'

/**
 * 使用服务器消息监听
 * 所有窗口（MainView、ChatView、HoverView）都应该调用此方法
 */
export function useServerMessage() {
  const appStore = useAppStore()

  /**
   * 处理服务器消息
   * 所有消息处理逻辑已移到 app store 中
   */
  const handleServerMessage = async (message: ServerMessage) => {
    // 委托给 store 处理
    await appStore.handleServerMessage(message)
  }

  onMounted(() => {
    console.log('[useServerMessage] 开始监听服务器消息')
    // 监听服务器消息
    window.api.appOnServerMessage(handleServerMessage)

    // 同时监听图片捕获事件
    window.api.chatOnImageCaptured((data: { imageBase64: string }) => {
      appStore.handleImageCaptured(data.imageBase64)
    })
  })

  onUnmounted(() => {
    console.log('[useServerMessage] 停止监听服务器消息')
    // 移除监听器
    window.api.appRemoveServerMessageListener()
    window.api.chatRemoveImageCapturedListener()
  })

  return {
    // 暴露 store，方便组件直接访问
    appStore,
  }
}
