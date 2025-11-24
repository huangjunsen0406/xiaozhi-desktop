<script setup lang="ts">
import { NButton, NDropdown } from 'naive-ui'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

import AudioWave from '../components/AudioWave.vue'

interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  emotion?: string
  imageData?: Uint8Array
  timestamp?: number
  isStreaming?: boolean // 是否正在流式输出
}

interface ChatSession {
  id: number
  sessionId: string
  title: string
  active: boolean
  messageCount: number
  lastMessageAt: number
}

interface GroupedSessions {
  date: string // 日期标签，如 "11月24日"
  timestamp: number // 用于排序的时间戳
  sessions: ChatSession[]
}

// 状态
const historyList = ref<ChatSession[]>([])
const groupedHistoryList = ref<GroupedSessions[]>([])
const messages = ref<ChatMessage[]>([])
const inputValue = ref('')
const currentSessionId = ref<string>('')
const currentEmotion = ref<string>('neutral')
const isRecording = ref(false)
const isSidebarOpen = ref(true)
const messagesContainer = ref<HTMLElement>()

// 当前本地会话 ID（由客户端管理，格式：chat_YYYYMMDD_序号）
const localSessionId = ref<string>('')

// 当前正在流式输出的 AI 消息索引
const streamingMessageIndex = ref<number>(-1)

// 累积的 AI 回复内容（用于合并多个句子）
const accumulatedContent = ref<string>('')

// 是否正在进行对话（有活跃的对话）
const isActiveConversation = ref(false)

// 待保存的图片数据（等待 session_id 后保存）
const pendingImageData = ref<string | null>(null)

// 打字机效果相关
const typewriterTimer = ref<number | null>(null)
const typewriterQueue = ref<string[]>([]) // 待打字的句子队列

/**
 * 组件挂载
 */
onMounted(async () => {
  console.log('[ChatView] 组件已挂载')

  // 加载会话列表
  await loadSessions()

  // 自动选中今天最新的会话
  if (historyList.value.length > 0) {
    // 查找今天的会话
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const todayPrefix = `chat_${dateStr}`

    // 过滤出今天的会话
    const todaySessions = historyList.value.filter(s => s.sessionId.startsWith(todayPrefix))

    if (todaySessions.length > 0) {
      // 今天有会话，选中最新的一个（第一个，因为已经按时间倒序排列）
      const latestTodaySession = todaySessions[0]
      console.log('[ChatView] 自动选中今天最新的会话:', latestTodaySession.sessionId)
      await switchSession(latestTodaySession.sessionId)
    }
    else {
      console.log('[ChatView] 今天还没有会话')
    }
  }

  // 监听服务器消息
  window.api.appOnServerMessage(handleServerMessage)

  // 监听图片捕获事件
  window.api.chatOnImageCaptured(handleImageCaptured)

  console.log('[ChatView] 开始监听服务器消息和图片捕获事件')
})

/**
 * 组件卸载
 */
onUnmounted(() => {
  console.log('[ChatView] 组件卸载，移除监听器')
  window.api.appRemoveServerMessageListener()
  window.api.chatRemoveImageCapturedListener()
  stopTypewriter() // 清理打字机定时器
})

/**
 * 处理图片捕获事件
 */
async function handleImageCaptured(data: { type: 'screenshot' | 'camera', imageBase64: string, timestamp: number }) {
  console.log('[ChatView] 收到图片捕获事件:', data.type, '大小:', data.imageBase64.length)

  // 立即显示图片到界面
  const binaryString = atob(data.imageBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // 查找占位消息并替换，或者直接添加
  const placeholderIndex = messages.value.findIndex(
    m => m.role === 'assistant' && m.content === '[图片加载中...]',
  )

  if (placeholderIndex >= 0) {
    // 找到占位消息，替换它
    console.log('[ChatView] 找到占位消息，替换为真实图片, 索引:', placeholderIndex)
    messages.value[placeholderIndex] = {
      role: 'assistant',
      content: '[图片]',
      imageData: bytes,
    }
  }
  else {
    // 没有找到占位消息，直接添加（兜底逻辑）
    console.log('[ChatView] 未找到占位消息，直接添加图片')
    messages.value.push({
      role: 'assistant',
      content: '[图片]',
      imageData: bytes,
    })
  }

  await nextTick()
  scrollToBottom()

  // 保存图片数据，等待稍后保存到数据库
  pendingImageData.value = data.imageBase64
}

/**
 * 处理服务器消息
 */
async function handleServerMessage(message: any) {
  console.log('[ChatView] 收到服务器消息:', message.type, message.state || '', message.text || '')

  // 检测截图/拍照工具调用，立即添加占位消息
  if (message.type === 'mcp') {
    const toolName = message.payload?.params?.name
    if (toolName === 'self.screenshot.take' || toolName === 'self.camera.take') {
      console.log('[ChatView] 检测到图片工具调用，添加占位消息')

      const placeholderMessage = {
        role: 'assistant' as const,
        content: '[图片加载中...]',
      }

      // 如果有正在流式输出的文本消息，把占位图片插入到它之前
      if (streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
        console.log('[ChatView] 占位图片插入到流式消息之前, 索引:', streamingMessageIndex.value)
        messages.value.splice(streamingMessageIndex.value, 0, placeholderMessage)
        // 更新流式消息索引（因为插入了一条消息）
        streamingMessageIndex.value++
      }
      else {
        // 否则添加到末尾
        messages.value.push(placeholderMessage)
      }

      await nextTick()
      scrollToBottom()
    }
  }

  // 过滤不需要的消息
  if (shouldFilterMessage(message)) {
    return
  }

  // 确保有本地会话 ID
  if (!localSessionId.value) {
    localSessionId.value = await getTodaySession()
    currentSessionId.value = localSessionId.value
    console.log('[ChatView] 创建/使用本地会话:', localSessionId.value)
  }

  // 标记为活跃对话（有消息回复说明正在对话）
  isActiveConversation.value = true

  // 处理情感
  if (message.type === 'llm' && message.emotion) {
    currentEmotion.value = message.emotion
  }

  // 处理 AI 回复 - sentence_start 时开始显示（逐字效果）
  if (message.type === 'tts' && message.state === 'sentence_start' && message.text) {
    await handleSentenceStart(message.text)
  }

  // 处理 AI 回复 - sentence_end 时累积内容
  if (message.type === 'tts' && message.state === 'sentence_end' && message.text) {
    await handleSentenceEnd(message.text)
  }

  // 处理 TTS stop - 保存完整的 AI 回复到数据库
  if (message.type === 'tts' && message.state === 'stop') {
    await handleTtsStop()
  }
}

/**
 * 处理 sentence_start - 开始打字机效果
 */
async function handleSentenceStart(text: string) {
  console.log('[ChatView] sentence_start - 准备打字显示:', text)

  // 如果没有正在流式输出的消息，创建一个
  if (streamingMessageIndex.value < 0 || !messages.value[streamingMessageIndex.value]) {
    // 创建新的 AI 文本回复消息（图片已在 handleImageCaptured 中显示，无需重复）
    messages.value.push({
      role: 'assistant',
      content: '',
      emotion: currentEmotion.value,
      isStreaming: true,
    })
    streamingMessageIndex.value = messages.value.length - 1
  }

  // 将新句子加入打字队列
  typewriterQueue.value.push(text)

  // 如果没有正在执行打字效果，启动
  if (!typewriterTimer.value) {
    startTypewriter()
  }
}

/**
 * 启动打字机效果
 */
function startTypewriter() {
  let currentCharIndex = 0
  let currentSentence = typewriterQueue.value.shift() || ''

  typewriterTimer.value = window.setInterval(() => {
    if (streamingMessageIndex.value < 0 || !messages.value[streamingMessageIndex.value]) {
      stopTypewriter()
      return
    }

    // 每次添加一个字符
    if (currentCharIndex < currentSentence.length) {
      messages.value[streamingMessageIndex.value].content += currentSentence[currentCharIndex]
      currentCharIndex++

      // 滚动到底部
      scrollToBottom()
    }
    else {
      // 当前句子打完了，检查队列
      if (typewriterQueue.value.length > 0) {
        currentSentence = typewriterQueue.value.shift() || ''
        currentCharIndex = 0
      }
      else {
        // 队列为空，停止打字效果
        stopTypewriter()
      }
    }
  }, 50) // 每 50ms 显示一个字符
}

/**
 * 停止打字机效果
 */
function stopTypewriter() {
  if (typewriterTimer.value) {
    clearInterval(typewriterTimer.value)
    typewriterTimer.value = null
  }
}

/**
 * 处理 sentence_end - 累积内容（不保存到数据库，等 stop 时一起保存）
 */
async function handleSentenceEnd(text: string) {
  console.log('[ChatView] sentence_end - 累积内容:', text)

  // 累积内容，每句话后换行
  if (accumulatedContent.value) {
    accumulatedContent.value += `\n${text}`
  }
  else {
    accumulatedContent.value = text
  }

  // 更新界面上的消息内容（确保显示完整）
  if (streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
    messages.value[streamingMessageIndex.value].content = accumulatedContent.value
  }
}

/**
 * 处理 TTS stop - 保存完整的 AI 回复到数据库
 */
async function handleTtsStop() {
  console.log('[ChatView] TTS stop - 保存完整回复:', accumulatedContent.value)

  // 停止打字机效果，立即显示所有剩余内容
  stopTypewriter()

  // 如果队列中还有未显示的内容，立即显示
  while (typewriterQueue.value.length > 0) {
    const remainingText = typewriterQueue.value.shift()
    if (remainingText && streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
      messages.value[streamingMessageIndex.value].content += remainingText
    }
  }

  // 如果没有累积内容且没有图片，直接返回
  if (!accumulatedContent.value && !pendingImageData.value) {
    console.log('[ChatView] 没有需要保存的内容')
    return
  }

  try {
    // 确保有本地会话 ID
    if (!localSessionId.value) {
      localSessionId.value = await getTodaySession()
      currentSessionId.value = localSessionId.value
    }

    // 如果有待保存的图片，先保存图片消息（作为 assistant 消息）
    if (pendingImageData.value) {
      // 将 base64 转换为 Uint8Array
      const binaryString = atob(pendingImageData.value)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      await window.api.chatAddMessage({
        session_id: localSessionId.value,
        role: 'assistant',
        content: '[图片]',
        source_type: 'image',
        image_data: bytes,
        timestamp: Math.floor(Date.now() / 1000) - 1, // 时间戳稍早，确保排在文本前
      })

      console.log('[ChatView] 图片消息已保存到数据库（assistant）')
      pendingImageData.value = null
    }

    // 保存完整内容到数据库（如果有内容）
    if (accumulatedContent.value) {
      await window.api.chatAddMessage({
        session_id: localSessionId.value,
        role: 'assistant',
        content: accumulatedContent.value,
        emotion: currentEmotion.value,
        source_type: 'tts',
        timestamp: Math.floor(Date.now() / 1000),
      })
      console.log('[ChatView] AI 回复已保存到数据库')
    }

    // 如果有正在流式输出的消息，标记为完成
    if (streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
      messages.value[streamingMessageIndex.value].isStreaming = false
    }

    // 重置状态
    streamingMessageIndex.value = -1
    accumulatedContent.value = ''

    // 刷新会话列表
    await loadSessions()
  }
  catch (error) {
    console.error('[ChatView] 保存 AI 消息失败:', error)
  }
}

/**
 * 过滤不需要的消息
 */
function shouldFilterMessage(message: any): boolean {
  // MCP 工具调用（蓝色JSON）
  if (message.type === 'mcp')
    return true

  // 工具调用提示
  if (message.type === 'tts' && message.text?.startsWith('% '))
    return true

  // 语音提示
  if (message.type === 'stt' && message.text === '获取用户输入文本。')
    return true

  // TTS 的 start（stop 需要处理，不过滤）
  if (message.type === 'tts' && message.state === 'start')
    return true

  return false
}

/**
 * 获取或创建今天的会话
 */
async function getTodaySession(): Promise<string> {
  try {
    // 生成今天的日期标识（格式：chat_20250124）
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const sessionIdPrefix = `chat_${dateStr}`

    // 查找今天的会话
    const sessions = await window.api.chatGetSessions()
    const todaySession = sessions.find((s: any) => s.session_id.startsWith(sessionIdPrefix))

    if (!todaySession) {
      // 创建今天的第一个会话
      const sessionId = `${sessionIdPrefix}_01`
      const title = `${today.getMonth() + 1}月${today.getDate()}日的对话`

      await window.api.chatCreateSession({
        session_id: sessionId,
        title,
        started_at: Math.floor(Date.now() / 1000),
      })

      console.log('[ChatView] 创建今天的会话:', sessionId)
      return sessionId
    }

    console.log('[ChatView] 使用今天已有的会话:', todaySession.session_id)
    return todaySession.session_id
  }
  catch (error) {
    console.error('[ChatView] 获取今天会话失败:', error)
    // 失败时返回一个临时 ID
    return `chat_temp_${Date.now()}`
  }
}

/**
 * 开启新对话（手动创建）
 */
async function startNewConversation() {
  try {
    // 生成新的会话 ID
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const sessionIdPrefix = `chat_${dateStr}`

    // 查找今天已有的会话数量
    const sessions = await window.api.chatGetSessions()
    const todaySessions = sessions.filter((s: any) => s.session_id.startsWith(sessionIdPrefix))
    const nextNumber = todaySessions.length + 1
    const sessionId = `${sessionIdPrefix}_${String(nextNumber).padStart(2, '0')}`

    // 创建新会话
    const title = nextNumber === 1 ? `${today.getMonth() + 1}月${today.getDate()}日的对话` : `新对话 ${nextNumber}`
    await window.api.chatCreateSession({
      session_id: sessionId,
      title,
      started_at: Math.floor(Date.now() / 1000),
    })

    // 清空当前消息
    messages.value = []
    currentSessionId.value = sessionId
    localSessionId.value = sessionId
    isActiveConversation.value = true
    accumulatedContent.value = ''
    streamingMessageIndex.value = -1
    pendingImageData.value = null

    // 刷新会话列表
    await loadSessions()

    // 更新激活状态
    historyList.value.forEach((item) => {
      item.active = item.sessionId === sessionId
    })

    console.log('[ChatView] 创建新对话:', sessionId)
  }
  catch (error) {
    console.error('[ChatView] 创建新对话失败:', error)
  }
}

/**
 * 发送消息
 */
async function sendMessage() {
  const text = inputValue.value.trim()
  if (!text)
    return

  try {
    console.log('[ChatView] 发送消息:', text)

    // 确保有本地会话 ID（获取或创建今天的会话）
    if (!localSessionId.value) {
      localSessionId.value = await getTodaySession()
      currentSessionId.value = localSessionId.value
      console.log('[ChatView] 使用本地会话:', localSessionId.value)
    }

    // 标记为活跃对话
    isActiveConversation.value = true

    // 立即保存用户消息到数据库
    await window.api.chatAddMessage({
      session_id: localSessionId.value,
      role: 'user',
      content: text,
      source_type: 'text',
      timestamp: Math.floor(Date.now() / 1000),
    })

    // 显示到界面
    messages.value.push({ role: 'user', content: text })
    inputValue.value = ''

    // 滚动到底部
    await nextTick()
    scrollToBottom()

    // 刷新会话列表
    await loadSessions()

    // 发送到服务器
    await window.api.appSendTextViaAudio(text)
  }
  catch (error) {
    console.error('[ChatView] 发送消息失败:', error)
  }
}

/**
 * 加载会话列表
 */
async function loadSessions() {
  try {
    const sessions = await window.api.chatGetSessions()
    historyList.value = sessions.map((s: any) => ({
      id: s.id,
      sessionId: s.session_id,
      title: s.title || '新对话',
      active: s.session_id === currentSessionId.value,
      messageCount: s.message_count,
      lastMessageAt: s.last_message_at,
    }))

    // 按天分组
    groupedHistoryList.value = groupSessionsByDate(historyList.value)

    console.log('[ChatView] 会话列表已加载:', historyList.value.length, '分组数:', groupedHistoryList.value.length)
  }
  catch (error) {
    console.error('[ChatView] 加载会话列表失败:', error)
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
    const date = new Date(timestamp * 1000)
    const dateKey = `${date.getMonth() + 1}月${date.getDate()}日`

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
 * 检查会话是否是今天的
 */
function isTodaySession(sessionId: string): boolean {
  const today = new Date()
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const todayPrefix = `chat_${dateStr}`
  return sessionId.startsWith(todayPrefix)
}

/**
 * 切换会话
 */
async function switchSession(sessionId: string) {
  try {
    console.log('[ChatView] 切换会话:', sessionId)

    const msgs = await window.api.chatGetMessages(sessionId)

    messages.value = msgs.map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      emotion: m.emotion,
      imageData: m.image_data,
      timestamp: m.timestamp,
    }))
    currentSessionId.value = sessionId

    // 重置流式输出相关状态
    streamingMessageIndex.value = -1
    accumulatedContent.value = ''
    stopTypewriter()
    typewriterQueue.value = []
    pendingImageData.value = null

    // 判断是否是今天的会话
    const isToday = isTodaySession(sessionId)
    if (isToday) {
      // 今天的会话保持活跃状态（显示输入框）
      isActiveConversation.value = true
      localSessionId.value = sessionId
      console.log('[ChatView] 切换到今天的会话，保持活跃状态')
    }
    else {
      // 历史会话标记为非活跃（不显示输入框）
      isActiveConversation.value = false
      console.log('[ChatView] 切换到历史会话，标记为非活跃')
    }

    // 更新激活状态
    historyList.value.forEach((item) => {
      item.active = item.sessionId === sessionId
    })

    // 滚动到底部
    await nextTick()
    scrollToBottom()

    console.log('[ChatView] 会话已切换，消息数:', messages.value.length, '是否今天:', isToday)
  }
  catch (error) {
    console.error('[ChatView] 切换会话失败:', error)
  }
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

/**
 * 显示图片（从 Blob 数据）
 */
function getImageUrl(imageData: Uint8Array | any): string {
  try {
    console.log('[ChatView] getImageUrl 输入:', typeof imageData, imageData?.constructor?.name, imageData?.length)

    // 处理不同的数据格式
    let buffer: Uint8Array

    if (imageData instanceof Uint8Array) {
      buffer = imageData
      console.log('[ChatView] 数据是 Uint8Array')
    }
    else if (imageData?.data && Array.isArray(imageData.data)) {
      // 如果是 {type: 'Buffer', data: [...]} 格式
      buffer = new Uint8Array(imageData.data)
      console.log('[ChatView] 数据是 Buffer 格式，转换后长度:', buffer.length)
    }
    else if (Array.isArray(imageData)) {
      // 如果是数组格式
      buffer = new Uint8Array(imageData)
      console.log('[ChatView] 数据是数组格式，转换后长度:', buffer.length)
    }
    else if (imageData?.buffer) {
      // 如果有 buffer 属性
      buffer = new Uint8Array(imageData.buffer)
      console.log('[ChatView] 数据有 buffer 属性，转换后长度:', buffer.length)
    }
    else {
      console.error('[ChatView] 无法识别的图片数据格式:', typeof imageData, imageData)
      return ''
    }

    // 检查数据是否有效
    if (buffer.length === 0) {
      console.error('[ChatView] 图片数据为空')
      return ''
    }

    // 检查 PNG 或 JPEG 头
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
    const mimeType = isPNG ? 'image/png' : 'image/jpeg'

    console.log('[ChatView] 图片格式:', isPNG ? 'PNG' : 'JPEG', '大小:', buffer.length, '前4字节:', Array.from(buffer.slice(0, 4)))

    // 确保 buffer 是标准的 ArrayBuffer（使用类型断言）
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    const blob = new Blob([arrayBuffer], { type: mimeType })
    const url = URL.createObjectURL(blob)
    console.log('[ChatView] Blob URL:', url, 'Blob 大小:', blob.size)

    return url
  }
  catch (error) {
    console.error('[ChatView] getImageUrl 失败:', error)
    return ''
  }
}

/**
 * 切换录音状态
 */
function toggleRecording() {
  isRecording.value = !isRecording.value
}

/**
 * 切换侧边栏
 */
function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}

/**
 * 处理回车发送
 */
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

/**
 * 删除会话
 */
async function deleteSession(sessionId: string) {
  try {
    console.log('[ChatView] 删除会话:', sessionId)

    // 调用 API 删除会话
    await window.api.chatDeleteSession(sessionId)

    // 如果删除的是当前会话，切换到第一个会话或清空
    if (currentSessionId.value === sessionId) {
      // 刷新会话列表
      await loadSessions()

      // 如果还有其他会话，切换到第一个
      if (historyList.value.length > 0) {
        await switchSession(historyList.value[0].sessionId)
      }
      else {
        // 没有会话了，清空显示
        messages.value = []
        currentSessionId.value = ''
        localSessionId.value = ''
      }
    }
    else {
      // 不是当前会话，只刷新列表
      await loadSessions()
    }

    console.log('[ChatView] 会话已删除')
  }
  catch (error) {
    console.error('[ChatView] 删除会话失败:', error)
  }
}
</script>

<template>
  <div class="flex w-full h-screen overflow-hidden bg-white dark:bg-gray-900 font-sans">
    <!-- Sidebar -->
    <div
      class="flex-shrink-0 bg-[#F7F7F7] dark:bg-gray-800 flex flex-col border-r border-gray-100 dark:border-gray-700 transition-all duration-300 ease-in-out overflow-hidden"
      :class="[isSidebarOpen ? 'w-64' : 'w-[68px]']"
    >
      <!-- Drag Region (Top Left) -->
      <div class="h-10 w-full" style="-webkit-app-region: drag" />

      <!-- Sidebar Header -->
      <div class="px-4 pb-2 text-xs font-medium text-gray-400 whitespace-nowrap">
        <span :class="{ 'opacity-0': !isSidebarOpen }">历史对话</span>
      </div>

      <!-- History List (Grouped by Date) -->
      <div class="flex-1 overflow-y-auto px-2 space-y-3">
        <div v-for="group in groupedHistoryList" :key="group.date" class="space-y-1">
          <!-- Date Header -->
          <div
            class="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400"
            :class="{ 'opacity-0': !isSidebarOpen }"
          >
            {{ group.date }}
          </div>
          <!-- Sessions in this group -->
          <div
            v-for="item in group.sessions"
            :key="item.id"
            class="group flex items-center gap-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors whitespace-nowrap relative"
            :class="[
              item.active
                ? 'bg-gray-200/60 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50',
            ]"
            @click="switchSession(item.sessionId)"
          >
            <icon-carbon-chat class="w-4 h-4 flex-shrink-0 opacity-70" />
            <span class="truncate flex-1" :class="{ 'opacity-0': !isSidebarOpen }">{{ item.title }}</span>
            <NDropdown
              v-if="item.active && isSidebarOpen"
              trigger="click"
              :options="[
                { label: '删除对话', key: 'delete' },
              ]"
              @select="(key: string) => key === 'delete' && deleteSession(item.sessionId)"
            >
              <icon-carbon-overflow-menu-horizontal
                class="w-4 h-4 opacity-50 hover:opacity-100 cursor-pointer"
                @click.stop
              />
            </NDropdown>
          </div>
        </div>
      </div>

      <!-- Sidebar Footer (Toggle Button) -->
      <div class="p-4 flex items-center" :class="[isSidebarOpen ? 'justify-end' : 'justify-center']">
        <NButton quaternary circle size="small" @click="toggleSidebar">
          <icon-carbon-side-panel-close v-if="isSidebarOpen" class="w-4 h-4 text-gray-500" />
          <icon-carbon-side-panel-open v-else class="w-4 h-4 text-gray-500" />
        </NButton>
      </div>
    </div>

    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col relative bg-white dark:bg-gray-900">
      <!-- Drag Region (Top Right) -->
      <div class="h-10 w-full flex-shrink-0" style="-webkit-app-region: drag" />

      <!-- Messages Area -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto px-20 py-4">
        <div v-for="(msg, index) in messages" :key="index" class="mb-8 flex flex-col">
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="self-end max-w-[80%]">
            <!-- 图片 -->
            <img
              v-if="msg.imageData"
              :src="getImageUrl(msg.imageData)"
              class="rounded-lg mb-2 max-w-full"
              alt="User uploaded image"
            >
            <!-- 文本 -->
            <div class="bg-[#F3F3F3] dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed">
              {{ msg.content }}
            </div>
          </div>

          <!-- Assistant Message -->
          <div v-else class="self-start max-w-[80%]">
            <!-- 图片 -->
            <img
              v-if="msg.imageData"
              :src="getImageUrl(msg.imageData)"
              class="rounded-lg mb-2 max-w-full shadow-md"
              alt="Screenshot or photo"
            >
            <!-- 文本 (只在有内容时显示) -->
            <div v-if="msg.content && msg.content !== '[图片]'" class="text-gray-900 dark:text-gray-100 text-sm leading-relaxed whitespace-pre-line">
              {{ msg.content }}
              <!-- 流式输出指示器 -->
              <span v-if="msg.isStreaming" class="inline-block w-2 h-4 ml-1 bg-gray-400 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="px-20 pb-8 pt-2">
        <!-- 活跃对话时显示输入框 -->
        <div v-if="isActiveConversation || messages.length === 0" class="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-sm hover:shadow-md transition-shadow duration-200">
          <textarea
            v-model="inputValue"
            placeholder="发消息或输入 / 选择技能"
            class="w-full min-h-[56px] max-h-[200px] py-4 px-5 bg-transparent border-none outline-none resize-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            rows="1"
            @keydown="handleKeydown"
          />

          <!-- Input Actions -->
          <div class="flex items-center justify-end gap-2 px-4 pb-3">
            <NButton quaternary circle size="small" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <icon-carbon-phone class="w-4 h-4" />
            </NButton>
            <NButton
              quaternary
              circle
              size="small"
              class="transition-colors duration-200"
              :class="[isRecording ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300']"
              @click="toggleRecording"
            >
              <AudioWave v-if="isRecording" :active="true" class="w-4 h-4" />
              <icon-carbon-microphone v-else class="w-4 h-4" />
            </NButton>
            <NButton
              circle
              size="small"
              class="bg-[#E5E5E5] dark:bg-gray-700 text-white dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 border-none"
              :disabled="!inputValue"
              @click="sendMessage"
            >
              <icon-carbon-arrow-up class="w-4 h-4" />
            </NButton>
          </div>
        </div>

        <!-- 查看历史记录时显示提示 -->
        <div v-else class="text-center py-4">
          <NButton type="primary" @click="startNewConversation">
            <icon-carbon-add class="w-4 h-4 mr-2" />
            开启新对话
          </NButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom Scrollbar for Sidebar */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
}
</style>
