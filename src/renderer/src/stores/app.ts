import type { AppStateSnapshot, DeviceState, ListeningMode } from '@shared/types'
import type { ChatSession as IpcChatSession } from '../../../preload/index.d'
import type { ChatMessage as ChatMessageType, ChatSession, ServerMessage } from '../types/chat'
/**
 * 全局应用 Store
 * 统一管理设备状态、通话状态、会话、消息等
 * 所有窗口（MainView、ChatView、HoverView、Live2D）共享此状态
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { generateSessionTitle, getTodaySessionId, isTodaySession } from '../utils/dateUtils'
import { mapIpcMessageToChatMessage, mapIpcSessionToChatSession } from '../utils/transformers'

export const useAppStore = defineStore('app', () => {
  /** 设备状态 */
  const deviceState = ref<DeviceState>('idle')

  /** 监听模式 */
  const listeningMode = ref<ListeningMode>('manual')

  /** 是否持续监听 */
  const keepListening = ref(false)

  /** 音频通道是否打开 */
  const channelOpen = ref(false)

  /** 当前表情 */
  const emotion = ref<string>('neutral')

  /** 当前显示的文本（用于实时更新，如 MainView） */
  const currentText = ref<string>('')

  /** 会话列表 */
  const sessions = ref<ChatSession[]>([])

  /** 当前会话 ID */
  const currentSessionId = ref<string>('')

  /** 当前会话的消息列表（UI 显示用） */
  const messages = ref<ChatMessageType[]>([])

  /** 是否正在通话（设备非空闲且通道打开） */
  const isCalling = computed(() => deviceState.value !== 'idle')

  /** 是否正在连接 */
  const isConnecting = computed(() => deviceState.value === 'connecting')

  /** 是否空闲 */
  const isIdle = computed(() => deviceState.value === 'idle')

  /** 是否正在监听 */
  const isListening = computed(() => deviceState.value === 'listening')

  /** 是否正在说话 */
  const isSpeaking = computed(() => deviceState.value === 'speaking')

  /** 当前会话是否是今天的 */
  const isCurrentSessionToday = computed(() => {
    return currentSessionId.value ? isTodaySession(currentSessionId.value) : false
  })

  /** 是否有活跃会话 */
  const hasActiveSession = computed(() => !!currentSessionId.value)

  /** 是否为自动模式 (通话中且模式为 realtime 或 auto) */
  const isAutoMode = computed(() => {
    return isCalling.value && (listeningMode.value === 'realtime' || listeningMode.value === 'auto')
  })

  /** 是否为手动模式 (正在监听且模式为 manual) */
  const isManualMode = computed(() => {
    return deviceState.value === 'listening' && listeningMode.value === 'manual'
  })

  /**
   * 更新设备状态
   */
  function updateState(state: AppStateSnapshot) {
    deviceState.value = state.deviceState
    listeningMode.value = state.listeningMode
    keepListening.value = state.keepListening
    channelOpen.value = state.channelOpen
  }

  /**
   * 更新表情
   */
  function updateEmotion(newEmotion: string) {
    emotion.value = newEmotion
  }

  /**
   * 更新当前文本（MainView 用）
   */
  function updateCurrentText(text: string) {
    currentText.value = text
  }

  /**
   * 重置设备状态
   */
  function resetState() {
    deviceState.value = 'idle'
    listeningMode.value = 'manual'
    keepListening.value = false
    channelOpen.value = false
    emotion.value = 'neutral'
    currentText.value = ''
  }

  /**
   * 发送文本消息
   * 不立即显示到界面，等待服务器返回 STT 消息后由 message-added 事件统一刷新
   */
  async function sendText(text: string): Promise<void> {
    const trimmedText = text.trim()
    if (!trimmedText) {
      throw new Error('文本内容不能为空')
    }

    try {
      // 发送到服务器，等待 STT 返回后再显示
      await window.api.appSendText(trimmedText)
      console.log('文本消息已发送，等待 STT 返回:', trimmedText)
    }
    catch (error) {
      console.error('发送文本失败', error)
      throw error
    }
  }

  /**
   * 开始自动对话
   */
  async function startAutoConversation(): Promise<void> {
    try {
      await window.api.appStartAutoConversation()
      console.log('自动对话已启动')
    }
    catch (error) {
      console.error('启动自动对话失败', error)
      throw error
    }
  }

  /**
   * 停止自动对话
   */
  async function stopAutoConversation(): Promise<void> {
    try {
      currentText.value = ''
      await window.api.appStopAutoConversation()
      console.log('自动对话已停止')
    }
    catch (error) {
      console.error('停止自动对话失败', error)
      throw error
    }
  }

  /**
   * 开始手动监听
   */
  async function startListeningManual(): Promise<void> {
    try {
      await window.api.appStartListeningManual()
      console.log('手动监听已启动')
    }
    catch (error) {
      console.error('启动手动监听失败', error)
      throw error
    }
  }

  /**
   * 停止手动监听
   */
  async function stopListeningManual(): Promise<void> {
    try {
      await window.api.appStopListeningManual()
      console.log('手动监听已停止')
    }
    catch (error) {
      console.error('停止手动监听失败', error)
      throw error
    }
  }

  /**
   * 加载会话列表
   */
  async function loadSessions() {
    try {
      const data = await window.api.chatGetSessions()
      sessions.value = data.map((s: IpcChatSession) =>
        mapIpcSessionToChatSession(s, s.session_id === currentSessionId.value),
      )

      console.log('会话列表已加载:', sessions.value.length)
    }
    catch (error) {
      console.error('加载会话列表失败', error)
    }
  }

  /**
   * 加载指定会话的消息列表
   */
  async function loadMessages(sessionId: string) {
    try {
      console.log('加载会话消息:', sessionId)

      // 不传递 limit 参数，加载所有消息
      const msgs = await window.api.chatGetMessages(sessionId)
      messages.value = msgs.map(mapIpcMessageToChatMessage)

      console.log('消息已加载，数量:', messages.value.length)
    }
    catch (error) {
      console.error('加载消息失败', error)
    }
  }

  /**
   * 获取或创建今天的会话
   */
  async function getTodaySession(): Promise<string> {
    try {
      const sessionId = getTodaySessionId()
      const data = await window.api.chatGetSessions()
      const todaySession = data.find((s: IpcChatSession) => s.session_id === sessionId)

      if (!todaySession) {
        const title = generateSessionTitle(sessionId)

        await window.api.chatCreateSession({
          session_id: sessionId,
          title,
          started_at: Math.floor(Date.now() / 1000),
        })

        console.log('创建今天的会话:', sessionId)
        return sessionId
      }

      console.log('使用今天已有的会话:', todaySession.session_id)
      return todaySession.session_id
    }
    catch (error) {
      console.error('获取今天会话失败', error)
      return `chat_temp_${Date.now()}`
    }
  }

  /**
   * 切换会话
   */
  async function switchSession(sessionId: string) {
    try {
      console.log('切换会话:', sessionId)

      // 不传递 limit 参数，加载所有消息
      const msgs = await window.api.chatGetMessages(sessionId)
      messages.value = msgs.map(mapIpcMessageToChatMessage)

      // 更新当前会话 ID
      currentSessionId.value = sessionId

      // 更新会话列表的激活状态
      sessions.value.forEach((s) => {
        s.active = s.sessionId === sessionId
      })

      console.log('会话已切换，消息数:', messages.value.length)
    }
    catch (error) {
      console.error('切换会话失败', error)
    }
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string) {
    try {
      console.log('删除会话:', sessionId)

      // 当天会话禁止删除，避免后续消息写入历史会话
      if (isTodaySession(sessionId)) {
        console.warn('当天会话禁止删除，已忽略操作')
        return
      }

      await window.api.chatDeleteSession(sessionId)

      // 如果删除的是当前会话
      if (currentSessionId.value === sessionId) {
        await loadSessions()

        if (sessions.value.length > 0) {
          await switchSession(sessions.value[0].sessionId)
        }
        else {
          messages.value = []
          currentSessionId.value = ''
        }
      }
      else {
        await loadSessions()
      }

      console.log('会话已删除')
    }
    catch (error) {
      console.error('删除会话失败', error)
    }
  }
  /**
   * 处理服务器消息（所有窗口统一调用）
   */
  async function handleServerMessage(message: ServerMessage) {
    console.log('处理服务器消息:', message.type, message.text || '')

    if (!currentSessionId.value) {
      currentSessionId.value = await getTodaySession()
      console.log('自动创建会话:', currentSessionId.value)
    }

    // 更新表情
    if (message.type === 'llm' && message.emotion) {
      emotion.value = message.emotion
    }
    if (message.type === 'tts' && message.state === 'stop') {
      currentText.value = ''
    }
    else if (message.type === 'tts' && message.text) {
      // TTS 消息显示用户说的话
      currentText.value = message.text
    }
  }

  /**
   * 清空消息
   */
  function clearMessages() {
    messages.value = []
  }

  return {
    // 设备 & 通话状态
    deviceState,
    listeningMode,
    keepListening,
    channelOpen,
    emotion,
    currentText,

    // 会话 & 消息状态
    sessions,
    currentSessionId,
    messages,

    // 计算属性
    isCalling,
    isConnecting,
    isIdle,
    isListening,
    isSpeaking,
    isCurrentSessionToday,
    hasActiveSession,
    isAutoMode,
    isManualMode,

    // 设备 & 通话控制
    updateState,
    updateEmotion,
    updateCurrentText,
    resetState,
    sendText,
    startAutoConversation,
    stopAutoConversation,
    startListeningManual,
    stopListeningManual,

    // 会话管理
    loadSessions,
    loadMessages,
    getTodaySession,
    switchSession,
    deleteSession,

    // 消息处理
    handleServerMessage,
    clearMessages,
  }
})
