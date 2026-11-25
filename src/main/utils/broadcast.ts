import { BrowserWindow } from 'electron'

/**
 * 向所有未销毁的渲染窗口广播 IPC 消息。
 * @returns 实际送达的窗口数
 */
export function broadcastToWindows(channel: string, ...args: unknown[]): number {
  let sent = 0
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed())
      continue
    try {
      win.webContents.send(channel, ...args)
      sent++
    }
    catch {
      // 窗口在关闭过渡期可能抛出，忽略即可
    }
  }
  return sent
}
