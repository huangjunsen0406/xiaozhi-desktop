import type { MaybeRefOrGetter } from 'vue'
import { toValue, watch } from 'vue'
import { useAppStore } from '../stores/app'

/** Own the application IPC subscriptions only for windows whose route consumes appStore. */
export function useAppEventBridge(enabled: MaybeRefOrGetter<boolean> = true): void {
  const store = useAppStore()

  watch(
    () => Boolean(toValue(enabled)),
    (active, _prev, onCleanup) => {
      if (!active)
        return

      let disposed = false
      const subscriptions = [
        window.api.appOnStateChanged(store.updateState),
        window.api.appOnServerMessage(store.handleServerMessage),
        window.api.chatOnMessageAdded(data => void store.handleMessagesAdded(data)),
        window.api.chatOnMessagesBatchAdded(data => void store.handleMessagesAdded(data)),
        window.api.chatOnSessionCreated(data => void store.handleSessionCreated(data)),
        window.api.updateOnAvailable(info => console.log('[update] 发现新版本', info.version)),
      ]

      void store.refreshState(() => !disposed).catch((error) => {
        console.error('读取初始应用状态失败', error)
      })

      onCleanup(() => {
        disposed = true
        store.invalidatePendingRequests()
        for (const unsubscribe of subscriptions)
          unsubscribe()
      })
    },
    { immediate: true },
  )
}
