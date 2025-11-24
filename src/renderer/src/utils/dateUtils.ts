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
 * 生成今天的会话 ID 前缀（格式：chat_YYYYMMDD）
 * @returns 会话 ID 前缀，如 "chat_20251124"
 */
export function getTodaySessionPrefix(): string {
  return `chat_${getTodayDateString()}`
}

/**
 * 检查会话 ID 是否是今天的
 * @param sessionId - 会话 ID
 * @returns 是否是今天的会话
 */
export function isTodaySession(sessionId: string): boolean {
  return sessionId.startsWith(getTodaySessionPrefix())
}

/**
 * 生成会话标题
 * @param sequenceNumber - 序号（1 表示今天第一个会话，2+ 表示新对话）
 * @returns 会话标题
 */
export function generateSessionTitle(sequenceNumber: number): string {
  const today = new Date()
  const month = today.getMonth() + 1
  const date = today.getDate()

  if (sequenceNumber === 1) {
    return `${month}月${date}日的对话`
  }
  return `新对话 ${sequenceNumber}`
}
