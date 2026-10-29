import type { AppStateSnapshot, DeviceState, ListeningMode } from '@shared/types'
import type { ChatMessage, ChatSession, ServerMessage } from '../types/chat'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { mapIpcMessageToChatMessage, mapIpcSessionToChatSession } from '../utils/transformers'

type ConversationIntent = 'send-text' | 'start-auto' | 'stop-auto' | 'start-manual' | 'stop-manual'

/** Each renderer owns its view state; conversation commands are coordinated in main. */
export const useAppStore = defineStore('app', () => {
  const deviceState = ref<DeviceState>('idle')
  const listeningMode = ref<ListeningMode>('manual')
  const keepListening = ref(false)
  const channelOpen = ref(false)
  const emotion = ref('neutral')
  const currentText = ref('')
  const pendingIntent = ref<ConversationIntent | null>(null)

  const sessionRecords = ref<ChatSession[]>([])
  const selectedSessionId = ref('')
  const liveSessionId = ref('')
  // Follow new conversations initially; an explicit history selection pauses following.
  const followLive = ref(true)
  const messages = ref<ChatMessage[]>([])
  let sessionsRequestId = 0
  let messagesRequestId = 0
  let stateVersion = 0
  let stateRequestId = 0
  let lifecycleVersion = 0

  function invalidatePendingRequests(): void {
    lifecycleVersion++
    stateRequestId++
    sessionsRequestId++
    messagesRequestId++
  }

  async function refreshState(isActive: () => boolean = () => true): Promise<void> {
    const version = stateVersion
    const requestId = ++stateRequestId
    const snapshot = await window.api.appGetState()
    if (isActive() && requestId === stateRequestId && version === stateVersion)
      updateState(snapshot)
  }

  const sessions = computed(() => sessionRecords.value.map(session => ({
    ...session,
    active: session.sessionId === selectedSessionId.value,
  })))
  const isCalling = computed(() => deviceState.value !== 'idle')
  const isConnecting = computed(() => deviceState.value === 'connecting')
  const isIdle = computed(() => deviceState.value === 'idle')
  const isListening = computed(() => deviceState.value === 'listening')
  const isSpeaking = computed(() => deviceState.value === 'speaking')
  const hasSelectedSession = computed(() => !!selectedSessionId.value)
  const isAutoConversationActive = computed(() =>
    keepListening.value && isCalling.value && (listeningMode.value === 'realtime' || listeningMode.value === 'auto'),
  )
  const isManualListening = computed(() => isListening.value && listeningMode.value === 'manual')
  const isConversationPending = computed(() => pendingIntent.value !== null)

  function updateState(state: AppStateSnapshot): void {
    stateVersion++
    deviceState.value = state.deviceState
    listeningMode.value = state.listeningMode
    keepListening.value = state.keepListening
    channelOpen.value = state.channelOpen
  }

  function updateEmotion(value: string): void {
    emotion.value = value
  }

  function updateCurrentText(value: string): void {
    currentText.value = value
  }

  function resetState(): void {
    updateState({ deviceState: 'idle', listeningMode: 'manual', keepListening: false, channelOpen: false })
    emotion.value = 'neutral'
    currentText.value = ''
  }

  /** A completed command is followed by a snapshot, unless a newer event already arrived. */
  async function runConversationIntent(intent: ConversationIntent, command: () => Promise<void>): Promise<void> {
    if (isConversationPending.value)
      return
    pendingIntent.value = intent
    const version = lifecycleVersion
    try {
      await command()
      if (version !== lifecycleVersion)
        return
      try {
        await refreshState()
      }
      catch (error) {
        console.error('命令已完成，刷新应用状态失败', error)
      }
    }
    finally {
      pendingIntent.value = null
    }
  }

  async function submitText(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed)
      throw new Error('文本内容不能为空')
    await runConversationIntent('send-text', () => window.api.appSendText(trimmed))
  }

  async function startAutoConversation(): Promise<void> {
    await runConversationIntent('start-auto', () => window.api.appStartAutoConversation())
  }

  async function stopAutoConversation(): Promise<void> {
    await runConversationIntent('stop-auto', async () => {
      await window.api.appStopAutoConversation()
      currentText.value = ''
    })
  }

  async function toggleAutoConversation(): Promise<void> {
    if (isAutoConversationActive.value)
      await stopAutoConversation()
    else
      await startAutoConversation()
  }

  async function toggleManualListening(): Promise<void> {
    if (isManualListening.value)
      await runConversationIntent('stop-manual', () => window.api.appStopListeningManual())
    else
      await runConversationIntent('start-manual', () => window.api.appStartListeningManual())
  }

  async function loadSessions(): Promise<void> {
    const requestId = ++sessionsRequestId
    try {
      const data = await window.api.chatGetSessions()
      if (requestId === sessionsRequestId)
        sessionRecords.value = data.map(mapIpcSessionToChatSession)
    }
    catch (error) {
      console.error('加载会话列表失败', error)
    }
  }

  async function loadMessages(sessionId: string): Promise<void> {
    const requestId = ++messagesRequestId
    try {
      const data = await window.api.chatGetMessages(sessionId)
      if (requestId === messagesRequestId && selectedSessionId.value === sessionId)
        messages.value = data.map(mapIpcMessageToChatMessage)
    }
    catch (error) {
      console.error('加载消息失败', error)
    }
  }

  function selectSession(sessionId: string): void {
    if (selectedSessionId.value === sessionId)
      return
    selectedSessionId.value = sessionId
    messagesRequestId++
    messages.value = []
  }

  async function switchSession(sessionId: string): Promise<void> {
    followLive.value = sessionId === liveSessionId.value
    selectSession(sessionId)
    await loadMessages(sessionId)
  }

  /** Initial history fallback does not turn off following the next live conversation. */
  async function ensureSelectedSession(): Promise<void> {
    const version = lifecycleVersion
    await loadSessions()
    if (version !== lifecycleVersion)
      return
    if (!selectedSessionId.value) {
      const sessionId = liveSessionId.value || sessionRecords.value[0]?.sessionId
      if (sessionId)
        selectSession(sessionId)
    }
    if (selectedSessionId.value)
      await loadMessages(selectedSessionId.value)
  }

  function updateLiveSession(sessionId: string): void {
    liveSessionId.value = sessionId
    if (followLive.value)
      selectSession(sessionId)
  }

  /** Single and batch message events share selection and refresh policy. */
  async function handleMessagesAdded({ sessionId }: { sessionId: string }): Promise<void> {
    updateLiveSession(sessionId)
    await Promise.all([
      loadSessions(),
      selectedSessionId.value === sessionId ? loadMessages(sessionId) : Promise.resolve(),
    ])
  }

  async function handleSessionCreated({ sessionId }: { sessionId: string }): Promise<void> {
    const version = lifecycleVersion
    updateLiveSession(sessionId)
    await loadSessions()
    if (version === lifecycleVersion && selectedSessionId.value === sessionId)
      await loadMessages(sessionId)
  }

  async function deleteSession(sessionId: string): Promise<void> {
    const version = lifecycleVersion
    await window.api.chatDeleteSession(sessionId)
    if (version !== lifecycleVersion)
      return
    if (liveSessionId.value === sessionId)
      liveSessionId.value = ''
    if (selectedSessionId.value === sessionId)
      selectSession('')
    await loadSessions()
    // A selection made while deletion was in flight takes precedence.
    if (version === lifecycleVersion && !selectedSessionId.value) {
      const nextSessionId = sessionRecords.value[0]?.sessionId
      if (nextSessionId) {
        selectSession(nextSessionId)
        await loadMessages(nextSessionId)
      }
    }
  }

  function handleServerMessage(message: ServerMessage): void {
    const sessionId = message.session_id?.trim()
    if (sessionId && sessionId !== liveSessionId.value) {
      updateLiveSession(sessionId)
      void loadSessions()
      if (selectedSessionId.value === sessionId)
        void loadMessages(sessionId)
    }
    if (message.type === 'llm' && message.emotion)
      emotion.value = message.emotion
    if (message.type === 'stt' && message.text)
      currentText.value = message.text
    else if (message.type === 'tts' && message.state === 'stop')
      currentText.value = ''
    else if (message.type === 'tts' && message.text)
      currentText.value = message.text
  }

  return {
    deviceState,
    listeningMode,
    keepListening,
    channelOpen,
    emotion,
    currentText,
    pendingIntent,
    sessions,
    selectedSessionId,
    liveSessionId,
    followLive,
    messages,
    isCalling,
    isConnecting,
    isIdle,
    isListening,
    isSpeaking,
    hasSelectedSession,
    isAutoConversationActive,
    isManualListening,
    isConversationPending,
    updateState,
    refreshState,
    invalidatePendingRequests,
    updateEmotion,
    updateCurrentText,
    resetState,
    submitText,
    startAutoConversation,
    stopAutoConversation,
    toggleAutoConversation,
    toggleManualListening,
    loadSessions,
    loadMessages,
    ensureSelectedSession,
    switchSession,
    deleteSession,
    handleMessagesAdded,
    handleSessionCreated,
    handleServerMessage,
  }
})
