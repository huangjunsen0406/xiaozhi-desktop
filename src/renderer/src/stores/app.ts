import type { ChatMessage as ChatMessageType, ChatSession, DbMessage, DbSession, GroupedSessions, ServerMessage } from '../types/chat'
/**
 * 全局应用 Store
 * 统一管理设备状态、通话状态、会话、消息等
 * 所有窗口（MainView、ChatView、HoverView、Live2D）共享此状态
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { formatDateLabel, generateSessionTitle, getTodaySessionPrefix, isTodaySession } from '../utils/dateUtils'

// ==================== 类型定义 ====================

/** 设备状态类型 */
export type DeviceState = 'idle' | 'listening' | 'speaking'

/** 应用状态快照 */
export interface AppStateSnapshot {
  deviceState: DeviceState
  channelOpen: boolean
}

// ==================== Store 定义 ====================

export const useAppStore = defineStore('app', () => {
  // ==================== 设备 & 通话状态 ====================

  /** 设备状态 */
  const deviceState = ref<DeviceState>('idle')

  /** 音频通道是否打开 */
  const channelOpen = ref(false)

  /** 当前表情 */
  const emotion = ref<string>('neutral')

  /** 当前显示的文本（用于实时更新，如 MainView） */
  const currentText = ref<string>('')

  // ==================== 会话 & 消息状态 ====================

  /** 会话列表 */
  const sessions = ref<ChatSession[]>([])

  /** 按日期分组的会话列表 */
  const groupedSessions = ref<GroupedSessions[]>([])

  /** 当前会话 ID */
  const currentSessionId = ref<string>('')

  /** 当前会话的消息列表（UI 显示用） */
  const messages = ref<ChatMessageType[]>([])

  /** 是否正在流式输出 */
  const isStreaming = ref(false)

  /** 流式输出的消息索引 */
  const streamingMessageIndex = ref<number>(-1)

  /** 累积的 AI 回复内容 */
  const accumulatedContent = ref<string>('')

  /** 待保存的图片数据 */
  const pendingImageData = ref<string | null>(null)

  // ==================== 计算属性 ====================

  /** 是否正在通话（设备非空闲或通道打开） */
  const isCalling = computed(() => deviceState.value !== 'idle' || channelOpen.value)

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

  // ==================== 设备 & 通话状态管理 ====================

  /**
   * 更新设备状态
   */
  function updateState(state: AppStateSnapshot) {
    deviceState.value = state.deviceState
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
    channelOpen.value = false
    emotion.value = 'neutral'
    currentText.value = ''
  }

  // ==================== 通话控制方法 ====================

  /**
   * 发送文本消息
   */
  async function sendText(text: string): Promise<void> {
    const trimmedText = text.trim()
    if (!trimmedText) {
      throw new Error('文本内容不能为空')
    }

    try {
      await window.api.appSendText(trimmedText)
      console.log('[AppStore] 文本消息已发送:', trimmedText)
    }
    catch (error) {
      console.error('[AppStore] 发送文本失败:', error)
      throw error
    }
  }

  /**
   * 通过音频发送文本消息
   */
  async function sendTextViaAudio(text: string): Promise<void> {
    const trimmedText = text.trim()
    if (!trimmedText) {
      throw new Error('文本内容不能为空')
    }

    try {
      await window.api.appSendTextViaAudio(trimmedText)
      console.log('[AppStore] 通过音频发送文本:', trimmedText)
    }
    catch (error) {
      console.error('[AppStore] 通过音频发送文本失败:', error)
      throw error
    }
  }

  /**
   * 开始自动对话
   */
  async function startAutoConversation(): Promise<void> {
    try {
      await window.api.appStartAutoConversation()
      console.log('[AppStore] 自动对话已启动')
    }
    catch (error) {
      console.error('[AppStore] 启动自动对话失败:', error)
      throw error
    }
  }

  /**
   * 停止自动对话
   */
  async function stopAutoConversation(): Promise<void> {
    try {
      await window.api.appStopAutoConversation()
      console.log('[AppStore] 自动对话已停止')
    }
    catch (error) {
      console.error('[AppStore] 停止自动对话失败:', error)
      throw error
    }
  }

  /**
   * 开始手动监听
   */
  async function startListeningManual(): Promise<void> {
    try {
      await window.api.appStartListeningManual()
      console.log('[AppStore] 手动监听已启动')
    }
    catch (error) {
      console.error('[AppStore] 启动手动监听失败:', error)
      throw error
    }
  }

  /**
   * 停止手动监听
   */
  async function stopListeningManual(): Promise<void> {
    try {
      await window.api.appStopListeningManual()
      console.log('[AppStore] 手动监听已停止')
    }
    catch (error) {
      console.error('[AppStore] 停止手动监听失败:', error)
      throw error
    }
  }

  // ==================== 会话管理 ====================

  /**
   * 加载会话列表
   */
  async function loadSessions() {
    try {
      const data = await window.api.chatGetSessions()
      sessions.value = data.map((s: DbSession) => ({
        id: s.id,
        sessionId: s.session_id,
        title: s.title || '新对话',
        active: s.session_id === currentSessionId.value,
        messageCount: s.message_count,
        lastMessageAt: s.last_message_at,
      }))

      // 按天分组
      groupedSessions.value = groupSessionsByDate(sessions.value)

      console.log('[AppStore] 会话列表已加载:', sessions.value.length)
    }
    catch (error) {
      console.error('[AppStore] 加载会话列表失败:', error)
    }
  }

  /**
   * 按天分组会话
   */
  function groupSessionsByDate(sessionList: ChatSession[]): GroupedSessions[] {
    const groups = new Map<string, ChatSession[]>()

    sessionList.forEach((session) => {
      const dateKey = formatDateLabel(session.lastMessageAt)
      if (!groups.has(dateKey)) {
        groups.set(dateKey, [])
      }
      groups.get(dateKey)!.push(session)
    })

    const result: GroupedSessions[] = []
    groups.forEach((sessions, dateKey) => {
      result.push({
        date: dateKey,
        timestamp: sessions[0].lastMessageAt,
        sessions: sessions.sort((a, b) => b.lastMessageAt - a.lastMessageAt),
      })
    })

    return result.sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * 获取或创建今天的会话
   */
  async function getTodaySession(): Promise<string> {
    try {
      const sessionIdPrefix = getTodaySessionPrefix()
      const data = await window.api.chatGetSessions()
      const todaySession = data.find((s: DbSession) => s.session_id.startsWith(sessionIdPrefix))

      if (!todaySession) {
        const sessionId = `${sessionIdPrefix}_01`
        const title = generateSessionTitle(1)

        await window.api.chatCreateSession({
          session_id: sessionId,
          title,
          started_at: Math.floor(Date.now() / 1000),
        })

        console.log('[AppStore] 创建今天的会话:', sessionId)
        return sessionId
      }

      console.log('[AppStore] 使用今天已有的会话:', todaySession.session_id)
      return todaySession.session_id
    }
    catch (error) {
      console.error('[AppStore] 获取今天会话失败:', error)
      return `chat_temp_${Date.now()}`
    }
  }

  /**
   * 切换会话
   */
  async function switchSession(sessionId: string) {
    try {
      console.log('[AppStore] 切换会话:', sessionId)

      // 加载消息
      const msgs = await window.api.chatGetMessages(sessionId)
      messages.value = msgs.map((m: DbMessage) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        emotion: m.emotion ?? undefined,
        imageData: m.image_data ?? undefined,
        timestamp: m.timestamp,
      }))

      // 更新当前会话 ID
      currentSessionId.value = sessionId

      // 重置流式状态
      resetStreamingState()

      // 更新会话列表的激活状态
      sessions.value.forEach((s) => {
        s.active = s.sessionId === sessionId
      })

      console.log('[AppStore] 会话已切换，消息数:', messages.value.length)
    }
    catch (error) {
      console.error('[AppStore] 切换会话失败:', error)
    }
  }

  /**
   * 创建新会话
   */
  async function createNewSession(): Promise<string | null> {
    try {
      const sessionIdPrefix = getTodaySessionPrefix()
      const data = await window.api.chatGetSessions()
      const todaySessions = data.filter((s: DbSession) => s.session_id.startsWith(sessionIdPrefix))
      const nextNumber = todaySessions.length + 1
      const sessionId = `${sessionIdPrefix}_${String(nextNumber).padStart(2, '0')}`

      const title = generateSessionTitle(nextNumber)
      await window.api.chatCreateSession({
        session_id: sessionId,
        title,
        started_at: Math.floor(Date.now() / 1000),
      })

      // 切换到新会话
      await switchSession(sessionId)

      // 刷新会话列表
      await loadSessions()

      console.log('[AppStore] 创建新会话:', sessionId)
      return sessionId
    }
    catch (error) {
      console.error('[AppStore] 创建新会话失败:', error)
      return null
    }
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string) {
    try {
      console.log('[AppStore] 删除会话:', sessionId)

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

      console.log('[AppStore] 会话已删除')
    }
    catch (error) {
      console.error('[AppStore] 删除会话失败:', error)
    }
  }

  // ==================== 消息处理（核心逻辑） ====================

  /**
   * 处理服务器消息（所有窗口统一调用）
   */
  async function handleServerMessage(message: ServerMessage) {
    console.log('[AppStore] 处理服务器消息:', message.type, message.text || '')

    // 确保有当前会话
    if (!currentSessionId.value) {
      currentSessionId.value = await getTodaySession()
      console.log('[AppStore] 自动创建会话:', currentSessionId.value)
    }

    // 处理不同类型的消息
    if (message.type === 'stt' && message.text) {
      await handleSttMessage(message.text)
    }
    else if (message.type === 'llm' && message.emotion) {
      emotion.value = message.emotion
    }
    else if (message.type === 'tts') {
      await handleTtsMessage(message)
    }
    else if (message.type === 'mcp') {
      await handleMcpMessage(message)
    }
  }

  /**
   * 处理 STT 消息（用户语音识别）
   */
  async function handleSttMessage(text: string) {
    console.log('[AppStore] 处理 STT 消息:', text)

    // 过滤特殊提示
    if (text === '获取用户输入文本。') {
      return
    }

    // 添加用户消息到界面
    messages.value.push({
      role: 'user',
      content: text,
      timestamp: Math.floor(Date.now() / 1000),
    })

    // 保存到数据库
    try {
      await window.api.chatAddMessage({
        session_id: currentSessionId.value,
        role: 'user',
        content: text,
        source_type: 'voice',
        timestamp: Math.floor(Date.now() / 1000),
      })

      // 刷新会话列表
      await loadSessions()

      console.log('[AppStore] STT 消息已保存')
    }
    catch (error) {
      console.error('[AppStore] 保存 STT 消息失败:', error)
    }
  }

  /**
   * 处理 TTS 消息（AI 回复）
   */
  async function handleTtsMessage(message: ServerMessage) {
    const state = message.state
    const text = message.text

    // 过滤工具调用提示
    if (text?.startsWith('% ')) {
      return
    }

    if (state === 'start') {
      console.log('[AppStore] TTS 开始')

      // 如果之前有未完成的流式消息，先保存
      if (isStreaming.value && accumulatedContent.value) {
        console.log('[AppStore] 检测到新的 TTS start，保存之前的消息')
        await handleTtsStop()
      }

      // 开始新的流式输出
      isStreaming.value = true
    }
    else if (state === 'sentence_start' && text) {
      handleSentenceStart(text)
    }
    else if (state === 'sentence_end' && text) {
      handleSentenceEnd(text)
    }
    else if (state === 'stop') {
      await handleTtsStop()
    }
  }

  /**
   * 处理 sentence_start
   */
  function handleSentenceStart(text: string) {
    console.log('[AppStore] sentence_start:', text)

    // 过滤工具调用提示（以 % 开头）
    if (text.startsWith('% ')) {
      console.log('[AppStore] 过滤工具调用提示:', text)
      return
    }

    // 如果没有正在流式输出的消息，创建一个
    if (streamingMessageIndex.value < 0) {
      messages.value.push({
        role: 'assistant',
        content: '',
        emotion: emotion.value,
        isStreaming: true,
      })
      streamingMessageIndex.value = messages.value.length - 1
    }

    // 累积内容
    if (accumulatedContent.value) {
      accumulatedContent.value += `\n${text}`
    }
    else {
      accumulatedContent.value = text
    }

    // 实时更新界面显示
    if (streamingMessageIndex.value >= 0) {
      messages.value[streamingMessageIndex.value].content = accumulatedContent.value
    }

    // 更新当前文本（MainView 显示用）
    currentText.value = text
  }

  /**
   * 处理 sentence_end
   */
  function handleSentenceEnd(text: string) {
    console.log('[AppStore] sentence_end:', text)

    // sentence_end 只是一个标记，表示句子播放完成
    // 不需要再次累积内容，因为 sentence_start 已经添加过了
    // 这里可以做一些其他的处理，比如记录日志等
  }

  /**
   * 处理 TTS stop（保存完整回复）
   */
  async function handleTtsStop() {
    console.log('[AppStore] TTS stop，保存完整回复')

    if (!accumulatedContent.value && !pendingImageData.value) {
      console.log('[AppStore] 没有需要保存的内容')
      resetStreamingState()
      return
    }

    // 检查是否已经保存过（防止重复保存）
    const contentToSave = accumulatedContent.value
    if (contentToSave && streamingMessageIndex.value >= 0) {
      const currentMessage = messages.value[streamingMessageIndex.value]
      // 如果当前消息已经不是 streaming 状态，说明已经保存过了
      if (!currentMessage?.isStreaming) {
        console.log('[AppStore] 消息已经保存过，跳过')
        resetStreamingState()
        return
      }
    }

    try {
      // 保存图片（如果有）
      if (pendingImageData.value) {
        const binaryString = atob(pendingImageData.value)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        await window.api.chatAddMessage({
          session_id: currentSessionId.value,
          role: 'assistant',
          content: '[图片]',
          source_type: 'image',
          image_data: bytes,
          timestamp: Math.floor(Date.now() / 1000) - 1,
        })

        pendingImageData.value = null
      }

      // 保存文本（如果有）
      if (accumulatedContent.value) {
        await window.api.chatAddMessage({
          session_id: currentSessionId.value,
          role: 'assistant',
          content: accumulatedContent.value,
          emotion: emotion.value,
          source_type: 'tts',
          timestamp: Math.floor(Date.now() / 1000),
        })

        console.log('[AppStore] 消息已保存，内容:', accumulatedContent.value)
      }

      // 刷新会话列表
      await loadSessions()
    }
    catch (error) {
      console.error('[AppStore] 保存消息失败:', error)
    }
    finally {
      resetStreamingState()
    }
  }

  /**
   * 处理 MCP 消息（工具调用）
   */
  async function handleMcpMessage(message: ServerMessage) {
    const toolName = message.payload?.params?.name

    // 检测截图/拍照工具
    if (toolName === 'self.screenshot.take' || toolName === 'self.camera.take') {
      console.log('[AppStore] 检测到图片工具调用，添加占位消息')

      const placeholderMessage = {
        role: 'assistant' as const,
        content: '[图片加载中...]',
      }

      if (streamingMessageIndex.value >= 0) {
        messages.value.splice(streamingMessageIndex.value, 0, placeholderMessage)
        streamingMessageIndex.value++
      }
      else {
        messages.value.push(placeholderMessage)
      }
    }
  }

  /**
   * 处理图片捕获
   */
  async function handleImageCaptured(imageBase64: string) {
    console.log('[AppStore] 处理图片捕获')

    // 转换为 Uint8Array
    const binaryString = atob(imageBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // 查找并替换占位消息
    const placeholderIndex = messages.value.findIndex(
      m => m.role === 'assistant' && m.content === '[图片加载中...]',
    )

    if (placeholderIndex >= 0) {
      messages.value[placeholderIndex] = {
        role: 'assistant',
        content: '[图片]',
        imageData: bytes,
      }
    }
    else {
      messages.value.push({
        role: 'assistant',
        content: '[图片]',
        imageData: bytes,
      })
    }

    // 保存图片数据待后续保存
    pendingImageData.value = imageBase64
  }

  /**
   * 添加文本消息（用户手动输入）
   */
  async function addTextMessage(text: string) {
    console.log('[AppStore] 添加文本消息:', text)

    // 确保有会话
    if (!currentSessionId.value) {
      currentSessionId.value = await getTodaySession()
    }

    // 添加到界面
    messages.value.push({
      role: 'user',
      content: text,
      timestamp: Math.floor(Date.now() / 1000),
    })

    // 保存到数据库
    try {
      await window.api.chatAddMessage({
        session_id: currentSessionId.value,
        role: 'user',
        content: text,
        source_type: 'text',
        timestamp: Math.floor(Date.now() / 1000),
      })

      // 刷新会话列表
      await loadSessions()

      console.log('[AppStore] 文本消息已保存')
    }
    catch (error) {
      console.error('[AppStore] 保存文本消息失败:', error)
    }
  }

  /**
   * 更新流式消息内容（用于打字机效果）
   */
  function updateStreamingContent(content: string) {
    if (streamingMessageIndex.value >= 0) {
      messages.value[streamingMessageIndex.value].content = content
    }
  }

  /**
   * 重置流式状态
   */
  function resetStreamingState() {
    isStreaming.value = false
    streamingMessageIndex.value = -1
    accumulatedContent.value = ''
    currentText.value = ''

    // 标记流式消息为完成
    messages.value.forEach((m) => {
      if (m.isStreaming) {
        m.isStreaming = false
      }
    })
  }

  /**
   * 清空消息
   */
  function clearMessages() {
    messages.value = []
    resetStreamingState()
  }

  // ==================== 返回 ====================

  return {
    // 设备 & 通话状态
    deviceState,
    channelOpen,
    emotion,
    currentText,

    // 会话 & 消息状态
    sessions,
    groupedSessions,
    currentSessionId,
    messages,
    isStreaming,
    streamingMessageIndex,
    accumulatedContent,

    // 计算属性
    isCalling,
    isIdle,
    isListening,
    isSpeaking,
    isCurrentSessionToday,
    hasActiveSession,

    // 设备 & 通话控制
    updateState,
    updateEmotion,
    updateCurrentText,
    resetState,
    sendText,
    sendTextViaAudio,
    startAutoConversation,
    stopAutoConversation,
    startListeningManual,
    stopListeningManual,

    // 会话管理
    loadSessions,
    getTodaySession,
    switchSession,
    createNewSession,
    deleteSession,

    // 消息处理
    handleServerMessage,
    handleImageCaptured,
    addTextMessage,
    updateStreamingContent,
    clearMessages,
  }
})

// ==================== 兼容性导出 ====================

/** @deprecated 使用 useAppStore 代替 */
export const useCallStore = useAppStore
