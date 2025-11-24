import type { ChatMessage, DbMessage, ImageCapturedEvent, ServerMessage } from '../types/chat'
/**
 * 消息处理 Composable
 * 负责处理服务器消息、图片捕获、消息显示等操作
 */
import { nextTick, ref } from 'vue'

export function useMessageHandler() {
  // 状态
  const messages = ref<ChatMessage[]>([])
  const currentEmotion = ref<string>('neutral')
  const pendingImageData = ref<string | null>(null)
  const streamingMessageIndex = ref<number>(-1)
  const accumulatedContent = ref<string>('')

  /**
   * 加载会话消息
   */
  async function loadMessages(sessionId: string) {
    try {
      const msgs = await window.api.chatGetMessages(sessionId)

      messages.value = msgs.map((m: DbMessage) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        emotion: m.emotion ?? undefined,
        imageData: m.image_data ?? undefined,
        timestamp: m.timestamp,
      }))

      console.log('[useMessageHandler] 消息已加载，数量:', messages.value.length)
    }
    catch (error) {
      console.error('[useMessageHandler] 加载消息失败:', error)
    }
  }

  /**
   * 添加用户消息
   */
  async function addUserMessage(sessionId: string, text: string) {
    try {
      // 立即保存用户消息到数据库
      await window.api.chatAddMessage({
        session_id: sessionId,
        role: 'user',
        content: text,
        source_type: 'text',
        timestamp: Math.floor(Date.now() / 1000),
      })

      // 显示到界面
      messages.value.push({ role: 'user', content: text })

      console.log('[useMessageHandler] 用户消息已添加')
    }
    catch (error) {
      console.error('[useMessageHandler] 添加用户消息失败:', error)
    }
  }

  /**
   * 清空消息列表
   */
  function clearMessages() {
    messages.value = []
    streamingMessageIndex.value = -1
    accumulatedContent.value = ''
    pendingImageData.value = null
  }

  /**
   * 重置流式输出状态
   */
  function resetStreamingState() {
    streamingMessageIndex.value = -1
    accumulatedContent.value = ''
    pendingImageData.value = null
  }

  /**
   * 处理图片捕获事件
   */
  async function handleImageCaptured(data: ImageCapturedEvent, scrollToBottom: () => void) {
    console.log('[useMessageHandler] 收到图片捕获事件:', data.type, '大小:', data.imageBase64.length)

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
      console.log('[useMessageHandler] 找到占位消息，替换为真实图片, 索引:', placeholderIndex)
      messages.value[placeholderIndex] = {
        role: 'assistant',
        content: '[图片]',
        imageData: bytes,
      }
    }
    else {
      // 没有找到占位消息，直接添加（兜底逻辑）
      console.log('[useMessageHandler] 未找到占位消息，直接添加图片')
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
  async function handleServerMessage(
    message: ServerMessage,
    onSentenceStart: (text: string) => void,
    scrollToBottom: () => void,
  ) {
    console.log('[useMessageHandler] 收到服务器消息:', message.type, message.state || '', message.text || '')

    // 检测截图/拍照工具调用，立即添加占位消息
    if (message.type === 'mcp') {
      const toolName = message.payload?.params?.name
      if (toolName === 'self.screenshot.take' || toolName === 'self.camera.take') {
        console.log('[useMessageHandler] 检测到图片工具调用，添加占位消息')

        const placeholderMessage = {
          role: 'assistant' as const,
          content: '[图片加载中...]',
        }

        // 如果有正在流式输出的文本消息，把占位图片插入到它之前
        if (streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
          console.log('[useMessageHandler] 占位图片插入到流式消息之前, 索引:', streamingMessageIndex.value)
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

    // 处理 STT 消息 - 用户语音识别结果
    if (message.type === 'stt' && message.text) {
      console.log('[useMessageHandler] 收到 STT 消息，显示用户语音:', message.text)
      messages.value.push({
        role: 'user',
        content: message.text,
        timestamp: Math.floor(Date.now() / 1000),
      })
      await nextTick()
      scrollToBottom()

      // 标记为需要保存（返回特殊标记）
      return 'stt' as any
    }

    // 处理情感
    if (message.type === 'llm' && message.emotion) {
      currentEmotion.value = message.emotion
    }

    // 处理 AI 回复 - sentence_start 时开始显示（逐字效果）
    if (message.type === 'tts' && message.state === 'sentence_start' && message.text) {
      await handleSentenceStart(message.text, onSentenceStart)
    }

    // 处理 AI 回复 - sentence_end 时累积内容
    if (message.type === 'tts' && message.state === 'sentence_end' && message.text) {
      handleSentenceEnd(message.text)
    }

    // 返回是否需要保存（TTS stop）
    return message.type === 'tts' && message.state === 'stop'
  }

  /**
   * 过滤不需要的消息
   */
  function shouldFilterMessage(message: ServerMessage): boolean {
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
   * 处理 sentence_start - 开始打字机效果
   */
  async function handleSentenceStart(text: string, onSentenceStart: (text: string) => void) {
    console.log('[useMessageHandler] sentence_start - 准备打字显示:', text)

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

    // 通知外部启动打字机效果
    onSentenceStart(text)
  }

  /**
   * 处理 sentence_end - 累积内容（不保存到数据库，等 stop 时一起保存）
   */
  function handleSentenceEnd(text: string) {
    console.log('[useMessageHandler] sentence_end - 累积内容:', text)

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
   * 保存完整的 AI 回复到数据库
   */
  async function saveCompleteReply(sessionId: string, getRemainingContent: () => string) {
    console.log('[useMessageHandler] 保存完整回复:', accumulatedContent.value)

    // 获取打字机队列中剩余的内容
    const remainingContent = getRemainingContent()
    if (remainingContent && streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
      messages.value[streamingMessageIndex.value].content += remainingContent
    }

    // 如果没有累积内容且没有图片，直接返回
    if (!accumulatedContent.value && !pendingImageData.value) {
      console.log('[useMessageHandler] 没有需要保存的内容')
      return
    }

    try {
      // 如果有待保存的图片，先保存图片消息（作为 assistant 消息）
      if (pendingImageData.value) {
        // 将 base64 转换为 Uint8Array
        const binaryString = atob(pendingImageData.value)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        await window.api.chatAddMessage({
          session_id: sessionId,
          role: 'assistant',
          content: '[图片]',
          source_type: 'image',
          image_data: bytes,
          timestamp: Math.floor(Date.now() / 1000) - 1, // 时间戳稍早，确保排在文本前
        })

        console.log('[useMessageHandler] 图片消息已保存到数据库（assistant）')
        pendingImageData.value = null
      }

      // 保存完整内容到数据库（如果有内容）
      if (accumulatedContent.value) {
        await window.api.chatAddMessage({
          session_id: sessionId,
          role: 'assistant',
          content: accumulatedContent.value,
          emotion: currentEmotion.value,
          source_type: 'tts',
          timestamp: Math.floor(Date.now() / 1000),
        })
        console.log('[useMessageHandler] AI 回复已保存到数据库')
      }

      // 如果有正在流式输出的消息，标记为完成
      if (streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
        messages.value[streamingMessageIndex.value].isStreaming = false
      }

      // 重置状态
      streamingMessageIndex.value = -1
      accumulatedContent.value = ''
    }
    catch (error) {
      console.error('[useMessageHandler] 保存 AI 消息失败:', error)
    }
  }

  /**
   * 获取当前流式消息
   */
  function getStreamingMessage() {
    if (streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
      return messages.value[streamingMessageIndex.value]
    }
    return null
  }

  /**
   * 更新流式消息内容
   */
  function updateStreamingContent(content: string) {
    if (streamingMessageIndex.value >= 0 && messages.value[streamingMessageIndex.value]) {
      messages.value[streamingMessageIndex.value].content = content
    }
  }

  return {
    // 状态
    messages,
    currentEmotion,
    streamingMessageIndex,
    accumulatedContent,

    // 方法
    loadMessages,
    addUserMessage,
    clearMessages,
    resetStreamingState,
    handleImageCaptured,
    handleServerMessage,
    saveCompleteReply,
    getStreamingMessage,
    updateStreamingContent,
  }
}
