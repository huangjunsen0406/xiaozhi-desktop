import type { ChatMessage as IpcChatMessage, ChatSession as IpcChatSession } from '../../../preload/index.d'
import type { ChatMessage as ChatMessageType, ChatSession, ServerMessage, StreamingState } from '../types/chat'
/**
 * 全局应用 Store
 * 统一管理设备状态、通话状态、会话、消息等
 * 所有窗口（MainView、ChatView、HoverView、Live2D）共享此状态
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { generateSessionTitle, getTodaySessionId, isTodaySession } from '../utils/dateUtils'

// ==================== 类型定义 ====================

/** 设备状态类型 */
export type DeviceState = 'idle' | 'connecting' | 'listening' | 'speaking'

/** 监听模式类型 */
export type ListeningMode = 'auto' | 'manual' | 'realtime'

/** 应用状态快照 */
export interface AppStateSnapshot {
  deviceState: DeviceState
  listeningMode: ListeningMode
  channelOpen: boolean
}

// ==================== Store 定义 ====================

export const useAppStore = defineStore('app', () => {
  // ==================== 设备 & 通话状态 ====================

  /** 设备状态 */
  const deviceState = ref<DeviceState>('idle')

  /** 监听模式 */
  const listeningMode = ref<ListeningMode>('manual')

  /** 音频通道是否打开 */
  const channelOpen = ref(false)

  /** 当前表情 */
  const emotion = ref<string>('neutral')

  /** 当前显示的文本（用于实时更新，如 MainView） */
  const currentText = ref<string>('')

  // ==================== 会话 & 消息状态 ====================

  /** 会话列表 */
  const sessions = ref<ChatSession[]>([])

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
  // 图片数据持久化由主进程负责，这里仅做 UI 展示

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

  /** 是否为自动模式 (通话中且模式为 realtime 或 auto) */
  const isAutoMode = computed(() => {
    return isCalling.value && (listeningMode.value === 'realtime' || listeningMode.value === 'auto')
  })

  /** 是否为手动模式 (正在监听且模式为 manual) */
  const isManualMode = computed(() => {
    return deviceState.value === 'listening' && listeningMode.value === 'manual'
  })

  // ==================== 设备 & 通话状态管理 ====================

  /**
   * 更新设备状态
   */
  function updateState(state: AppStateSnapshot) {
    deviceState.value = state.deviceState
    listeningMode.value = state.listeningMode
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
    channelOpen.value = false
    emotion.value = 'neutral'
    currentText.value = ''
  }

  // ==================== 通话控制方法 ====================

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
      console.log('[AppStore] 文本消息已发送，等待 STT 返回:', trimmedText)
    }
    catch (error) {
      console.error('[AppStore] 发送文本失败:', error)
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
      sessions.value = data.map((s: IpcChatSession) => ({
        id: s.id,
        sessionId: s.session_id,
        title: s.title || '新对话',
        active: s.session_id === currentSessionId.value,
        messageCount: s.message_count,
        lastMessageAt: s.last_message_at ?? s.started_at,
      }))

      console.log('[AppStore] 会话列表已加载:', sessions.value.length)
    }
    catch (error) {
      console.error('[AppStore] 加载会话列表失败:', error)
    }
  }

  /**
   * 加载指定会话的消息列表
   */
  async function loadMessages(sessionId: string) {
    try {
      console.log('[AppStore] 加载会话消息:', sessionId)

      // 如果当前会话正处于流式输出，先暂存占位内容，避免被覆盖
      const keepStreamingPlaceholder = (
        isStreaming.value
        && streamingMessageIndex.value >= 0
        && sessionId === currentSessionId.value
      )
      const currentStreamingMsg = keepStreamingPlaceholder
        ? messages.value[streamingMessageIndex.value]
        : null
      const streamingPlaceholder = currentStreamingMsg
        ? { ...currentStreamingMsg }
        : keepStreamingPlaceholder
          ? {
              role: 'assistant' as const,
              content: accumulatedContent.value,
              emotion: emotion.value,
              isStreaming: true,
            }
          : null

      const msgs = await window.api.chatGetMessages(sessionId)
      messages.value = msgs.map((m: IpcChatMessage) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        emotion: m.emotion ?? undefined,
        imageData: m.image_data ?? undefined,
        timestamp: m.timestamp,
      }))

      // 重新插入流式占位，防止被加载覆盖到用户气泡
      if (keepStreamingPlaceholder && streamingPlaceholder) {
        messages.value.push({
          role: streamingPlaceholder.role ?? 'assistant',
          content: streamingPlaceholder.content ?? accumulatedContent.value,
          emotion: streamingPlaceholder.emotion ?? emotion.value,
          isStreaming: true,
        })
        streamingMessageIndex.value = messages.value.length - 1
        isStreaming.value = true
      }

      console.log('[AppStore] 消息已加载，数量:', messages.value.length)
    }
    catch (error) {
      console.error('[AppStore] 加载消息失败:', error)
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

      const isSameSession = currentSessionId.value === sessionId

      // 如果当前正在流式同一会话，避免覆盖流式内容
      if (isSameSession && isStreaming.value) {
        console.log('[AppStore] 当前会话正在流式，跳过刷新消息列表')
        return
      }

      // 加载消息
      const msgs = await window.api.chatGetMessages(sessionId)
      messages.value = msgs.map((m: IpcChatMessage) => ({
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
      if (!isSameSession) {
        resetStreamingState()
      }

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
   * 删除会话
   */
  async function deleteSession(sessionId: string) {
    try {
      console.log('[AppStore] 删除会话:', sessionId)

      // 当天会话禁止删除，避免后续消息写入历史会话
      if (isTodaySession(sessionId)) {
        console.warn('[AppStore] 当天会话禁止删除，已忽略操作')
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
      // 流式显示交给主进程广播的 streaming-update 事件
      return
    }
    else if (message.type === 'mcp') {
      await handleMcpMessage(message)
    }
  }

  /**
   * 处理 STT 消息（用户语音识别）
   * ⚠️ 主进程 ChatPlugin 负责保存和过滤，前端通过 message-added 事件刷新
   * 这里不做任何界面更新，避免状态同步问题
   */
  async function handleSttMessage(text: string) {
    // 过滤特殊提示
    if (text === '获取用户输入文本。') {
      return
    }

    // STT 消息由主进程统一处理保存和过滤，前端只等待 message-added 事件刷新
    console.log('[AppStore] STT 消息已收到，等待 message-added 事件刷新:', text)
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
    // 如果没有占位，等待主进程保存后通过 message-added 刷新，避免重复插入
  }

  // ==================== 流式状态同步（主进程广播） ====================

  /**
   * 初次挂载时补偿当前的流式消息（如果存在）
   */
  async function hydrateStreamingState(snapshot: StreamingState | null): Promise<void> {
    if (!snapshot)
      return
    await handleStreamingUpdate(snapshot)
  }

  /**
   * 处理主进程的流式增量更新
   */
  async function handleStreamingUpdate(snapshot: StreamingState): Promise<void> {
    if (!snapshot)
      return

    // 如果当前会话不同，切换并加载该会话，避免将流式消息插入旧会话
    if (snapshot.sessionId !== currentSessionId.value) {
      currentSessionId.value = snapshot.sessionId
      sessions.value.forEach((s) => {
        s.active = s.sessionId === snapshot.sessionId
      })
      await loadMessages(snapshot.sessionId)
    }
    else if (!currentSessionId.value) {
      currentSessionId.value = snapshot.sessionId
    }

    isStreaming.value = true
    accumulatedContent.value = snapshot.content || ''

    // 创建或更新流式占位消息
    if (streamingMessageIndex.value < 0) {
      messages.value.push({
        role: snapshot.role,
        content: snapshot.content || '',
        emotion: snapshot.emotion,
        isStreaming: true,
      })
      streamingMessageIndex.value = messages.value.length - 1
    }
    else if (messages.value[streamingMessageIndex.value]) {
      const currentMessage = messages.value[streamingMessageIndex.value]
      currentMessage.content = snapshot.content || ''
      currentMessage.emotion = snapshot.emotion ?? currentMessage.emotion
      currentMessage.isStreaming = true
    }

    // 更新当前显示文本（取最后一句）
    const lines = (snapshot.content || '').split('\n').filter(Boolean)
    currentText.value = lines.length > 0 ? lines[lines.length - 1] : snapshot.content || ''
  }

  /**
   * 处理流式完成事件（stop 前广播），保持内容直到 DB 刷新覆盖
   */
  async function handleStreamingFinalize(snapshot: StreamingState): Promise<void> {
    if (!snapshot)
      return

    // 保证会话切换到流式所属会话
    if (snapshot.sessionId !== currentSessionId.value) {
      currentSessionId.value = snapshot.sessionId
      sessions.value.forEach((s) => {
        s.active = s.sessionId === snapshot.sessionId
      })
      await loadMessages(snapshot.sessionId)
    }
    else if (!currentSessionId.value) {
      currentSessionId.value = snapshot.sessionId
    }

    accumulatedContent.value = snapshot.content || ''

    if (streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
      const currentMessage = messages.value[streamingMessageIndex.value]
      currentMessage.content = snapshot.content || ''
      currentMessage.emotion = snapshot.emotion ?? currentMessage.emotion
      currentMessage.isStreaming = false
    }
    else if (snapshot.content) {
      messages.value.push({
        role: snapshot.role,
        content: snapshot.content,
        emotion: snapshot.emotion,
        isStreaming: false,
      })
    }

    isStreaming.value = false
    streamingMessageIndex.value = -1
    currentText.value = ''
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
    listeningMode,
    channelOpen,
    emotion,
    currentText,

    // 会话 & 消息状态
    sessions,

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
    handleImageCaptured,
    hydrateStreamingState,
    handleStreamingUpdate,
    handleStreamingFinalize,
    updateStreamingContent,
    clearMessages,
  }
})

// ==================== 兼容性导出 ====================

/** @deprecated 使用 useAppStore 代替 */
export const useCallStore = useAppStore
