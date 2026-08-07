/**
 * 日期 / 会话展示工具
 */

/**
 * 格式化日期为 "X月X日" 格式
 * @param timestamp - Unix 时间戳（秒）
 */
export function formatDateLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/**
 * 生成今天的日期标识（格式：YYYYMMDD）
 * @deprecated 会话已改为服务端 session_id，仅保留兼容
 */
export function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const date = String(today.getDate()).padStart(2, '0')
  return `${year}${month}${date}`
}

/**
 * @deprecated 会话已改为服务端 session_id
 */
export function getTodaySessionId(): string {
  return `chat_${getTodayDateString()}`
}

/**
 * @deprecated 会话已改为服务端 session_id，不再按自然日判断
 */
export function isTodaySession(sessionId: string): boolean {
  return sessionId === getTodaySessionId()
}

/**
 * 会话列表标题
 * - 有 title（含「新对话」）原样用，避免刚开会话被显示成「X月X日」
 * - 仅旧数据无 title 时：chat_YYYYMMDD 用日期文案，其它用「新对话」
 */
export function formatSessionListTitle(
  title: string | null | undefined,
  _startedAt?: number,
  sessionId?: string,
): string {
  const t = (title || '').trim()
  if (t)
    return t
  if (sessionId?.startsWith('chat_') && sessionId.length >= 13)
    return generateSessionTitle(sessionId)
  return '新对话'
}

/**
 * 从会话 ID 生成标题（兼容旧 chat_YYYYMMDD）
 * @deprecated 新会话 title 由首条用户消息或「新对话」决定
 */
export function generateSessionTitle(sessionId: string): string {
  if (!sessionId.startsWith('chat_') || sessionId.length < 13)
    return '新对话'
  const dateStr = sessionId.replace('chat_', '')
  const month = Number.parseInt(dateStr.substring(4, 6), 10)
  const date = Number.parseInt(dateStr.substring(6, 8), 10)
  if (!month || !date)
    return '新对话'
  return `${month}月${date}日的对话`
}
