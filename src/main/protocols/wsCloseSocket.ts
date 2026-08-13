/**
 * 安全关闭 ws 客户端。
 *
 * CONNECTING 时 close()/terminate() 会走 abortHandshake，
 * 在 nextTick emit('error')。若此时没有 error 监听，
 * Electron 主进程会弹「Uncaught Exception」。
 */

export const WS_CONNECTING = 0
export const WS_OPEN = 1

export interface ClosableWs {
  readyState: number
  close: () => void
  once: (event: 'error', listener: (error: Error) => void) => unknown
}

/**
 * 关闭握手中或已打开的 WebSocket。
 * 调用方应先卸掉业务监听；本函数会在 CONNECTING 时重新挂一个空 error 监听。
 */
export function closeWsSocket(socket: ClosableWs): void {
  if (socket.readyState === WS_CONNECTING) {
    socket.once('error', () => {})
    socket.close()
    return
  }

  if (socket.readyState === WS_OPEN) {
    socket.close()
  }
}
