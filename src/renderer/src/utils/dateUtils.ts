/**
 * 日期工具函数
 */

/**
 * 格式化日期为 "X月X日" 格式
 * @param timestamp - Unix 时间戳（秒）
 * @returns 格式化的日期字符串，如 "11月24日"
 */
export function formatDateLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/**
 * 生成今天的日期标识（格式：YYYYMMDD）
 * @returns 日期字符串，如 "20251124"
 */
export function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const date = String(today.getDate()).padStart(2, '0')
  return `${year}${month}${date}`
}

/**
 * 生成今天的会话 ID（格式：chat_YYYYMMDD）
 * @returns 会话 ID，如 "chat_20251124"
 */
export function getTodaySessionId(): string {
  return `chat_${getTodayDateString()}`
}

/**
 * 检查会话 ID 是否是今天的
 * @param sessionId - 会话 ID
 * @returns 是否是今天的会话
 */
export function isTodaySession(sessionId: string): boolean {
  return sessionId === getTodaySessionId()
}

/**
 * 从会话 ID 生成标题
 * @param sessionId - 会话 ID（格式：chat_YYYYMMDD）
 * @returns 会话标题，如 "11月24日的对话"
 */
export function generateSessionTitle(sessionId: string): string {
  // 提取日期部分 YYYYMMDD
  const dateStr = sessionId.replace('chat_', '')
  const month = Number.parseInt(dateStr.substring(4, 6), 10)
  const date = Number.parseInt(dateStr.substring(6, 8), 10)
  return `${month}月${date}日的对话`
}
