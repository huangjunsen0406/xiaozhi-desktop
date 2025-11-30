/**
 * Analytics Composable
 * 为 Vue 组件提供埋点上报能力
 */

/**
 * 上报事件
 * @param event - 事件名称
 * @param extra - 额外数据
 */
export function trackEvent(event: string, extra?: Record<string, unknown>): void {
  window.api
    .analyticsTrack(event, extra)
    .catch((error) => console.error('埋点上报失败:', error))
}

/**
 * Analytics Composable Hook
 */
export function useAnalytics() {
  return {
    track: trackEvent,
  }
}
