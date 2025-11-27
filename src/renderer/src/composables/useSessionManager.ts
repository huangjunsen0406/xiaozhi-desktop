import type { ChatSession, GroupedSessions } from '../types/chat'
import type { ChatSession as IpcChatSession } from '../../../preload/index.d'
/**
 * 会话管理 Composable
 * 负责会话列表的加载、创建、切换、删除等操作
 */
import { ref } from 'vue'
import { formatDateLabel, generateSessionTitle, getTodaySessionId, isTodaySession } from '../utils/dateUtils'

export function useSessionManager() {
  // 状态
  const historyList = ref<ChatSession[]>([])
  const groupedHistoryList = ref<GroupedSessions[]>([])
  const currentSessionId = ref<string>('')
  const localSessionId = ref<string>('')

  /**
   * 加载会话列表
   */
  async function loadSessions() {
    try {
      const sessions = await window.api.chatGetSessions()
      historyList.value = sessions.map((s: IpcChatSession) => ({
        id: s.id,
        sessionId: s.session_id,
        title: s.title || '新对话',
        active: s.session_id === currentSessionId.value,
        messageCount: s.message_count,
        lastMessageAt: s.last_message_at ?? s.started_at,
      }))

      // 按天分组
      groupedHistoryList.value = groupSessionsByDate(historyList.value)

      console.log('[useSessionManager] 会话列表已加载:', historyList.value.length, '分组数:', groupedHistoryList.value.length)
    }
    catch (error) {
      console.error('[useSessionManager] 加载会话列表失败:', error)
    }
  }

  /**
   * 按天分组会话
   */
  function groupSessionsByDate(sessions: ChatSession[]): GroupedSessions[] {
    const groups = new Map<string, ChatSession[]>()

    sessions.forEach((session) => {
      const timestamp = session.lastMessageAt
      // 统一格式化为 "X月X日"
      const dateKey = formatDateLabel(timestamp)

      if (!groups.has(dateKey)) {
        groups.set(dateKey, [])
      }
      groups.get(dateKey)!.push(session)
    })

    // 转换为数组并排序（最新的在前）
    const result: GroupedSessions[] = []
    groups.forEach((sessions, dateKey) => {
      result.push({
        date: dateKey,
        timestamp: sessions[0].lastMessageAt, // 使用该组第一个会话的时间戳
        sessions: sessions.sort((a, b) => b.lastMessageAt - a.lastMessageAt), // 组内按时间倒序
      })
    })

    return result.sort((a, b) => b.timestamp - a.timestamp) // 组之间按时间倒序
  }

  /**
   * 获取或创建今天的会话
   */
  async function getTodaySession(): Promise<string> {
    try {
      const sessionId = getTodaySessionId()

      // 查找今天的会话
      const sessions = await window.api.chatGetSessions()
      const todaySession = sessions.find((s: IpcChatSession) => s.session_id === sessionId)

      if (!todaySession) {
        // 创建今天的会话
        const title = generateSessionTitle(sessionId)

        await window.api.chatCreateSession({
          session_id: sessionId,
          title,
          started_at: Math.floor(Date.now() / 1000),
        })

        console.log('[useSessionManager] 创建今天的会话:', sessionId)
        return sessionId
      }

      console.log('[useSessionManager] 使用今天已有的会话:', todaySession.session_id)
      return todaySession.session_id
    }
    catch (error) {
      console.error('[useSessionManager] 获取今天会话失败:', error)
      // 失败时返回一个临时 ID
      return `chat_temp_${Date.now()}`
    }
  }

  /**
   * 切换会话
   */
  async function switchSession(sessionId: string) {
    try {
      console.log('[useSessionManager] 切换会话:', sessionId)

      currentSessionId.value = sessionId

      // 判断是否是今天的会话
      const isToday = isTodaySession(sessionId)
      if (isToday) {
        // 今天的会话保持活跃状态（显示输入框）
        localSessionId.value = sessionId
        console.log('[useSessionManager] 切换到今天的会话，保持活跃状态')
      }
      else {
        console.log('[useSessionManager] 切换到历史会话，标记为非活跃')
      }

      // 更新激活状态
      historyList.value.forEach((item) => {
        item.active = item.sessionId === sessionId
      })

      console.log('[useSessionManager] 会话已切换，是否今天:', isToday)

      return isToday
    }
    catch (error) {
      console.error('[useSessionManager] 切换会话失败:', error)
      return false
    }
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string) {
    try {
      console.log('[useSessionManager] 删除会话:', sessionId)

      // 调用 API 删除会话
      await window.api.chatDeleteSession(sessionId)

      // 如果删除的是当前会话，切换到第一个会话或清空
      if (currentSessionId.value === sessionId) {
        // 刷新会话列表
        await loadSessions()

        // 如果还有其他会话，返回第一个会话的 ID
        if (historyList.value.length > 0) {
          return historyList.value[0].sessionId
        }
        else {
          // 没有会话了，清空
          currentSessionId.value = ''
          localSessionId.value = ''
          return null
        }
      }
      else {
        // 不是当前会话，只刷新列表
        await loadSessions()
        return currentSessionId.value
      }
    }
    catch (error) {
      console.error('[useSessionManager] 删除会话失败:', error)
      return null
    }
  }

  return {
    // 状态
    historyList,
    groupedHistoryList,
    currentSessionId,
    localSessionId,

    // 方法
    loadSessions,
    getTodaySession,
    switchSession,
    deleteSession,
  }
}
