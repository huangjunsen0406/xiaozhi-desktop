import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'

/** Own the application IPC subscriptions for this renderer's lifetime. */
export function useAppEventBridge(): void {
  const store = useAppStore()
  const subscriptions: Array<() => void> = []
  let disposed = false

  onUnmounted(() => {
    disposed = true
    store.invalidatePendingRequests()
    for (const unsubscribe of subscriptions)
      unsubscribe()
  })

  subscriptions.push(window.api.appOnStateChanged(store.updateState))
  subscriptions.push(window.api.appOnServerMessage(store.handleServerMessage))
  subscriptions.push(window.api.chatOnMessageAdded(data => void store.handleMessagesAdded(data)))
  subscriptions.push(window.api.chatOnMessagesBatchAdded(data => void store.handleMessagesAdded(data)))
  subscriptions.push(window.api.chatOnSessionCreated(data => void store.handleSessionCreated(data)))
  subscriptions.push(window.api.updateOnAvailable(info => console.log('[update] 发现新版本', info.version)))

  onMounted(async () => {
    try {
      await store.refreshState(() => !disposed)
    }
    catch (error) {
      console.error('读取初始应用状态失败', error)
    }
  })
}
