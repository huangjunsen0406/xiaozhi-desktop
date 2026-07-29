/**
 * WebSocket 正常关闭码（对齐 py-xiaozhi）
 *
 * 纯工具模块，无 Electron / ws 依赖，便于单测直接导入。
 */

/** 服务端正常关闭码：不自动重连、不上报 network_error */
export const WS_CLEAN_CLOSE_CODES = new Set([1000, 1001, 1005])

/**
 * 判断 WebSocket close code 是否为服务端正常关闭
 */
export function isCleanCloseCode(code: number): boolean {
  return WS_CLEAN_CLOSE_CODES.has(code)
}
