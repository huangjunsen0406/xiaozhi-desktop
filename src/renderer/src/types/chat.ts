/**
 * 聊天相关的类型定义
 */

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 消息 ID（数据库主键） */
  id?: number
  /** 角色：用户或助手 */
  role: 'user' | 'assistant'
  /** 消息内容 */
  content: string
  /** 情感类型（AI 回复时） */
  emotion?: string
  /** 图片数据（二进制） */
  imageData?: Uint8Array
  /** 消息时间戳（秒） */
  timestamp?: number
  /** 是否正在流式输出 */
  isStreaming?: boolean
}

/**
 * 聊天会话
 */
export interface ChatSession {
  /** 会话数据库 ID */
  id: number
  /** 会话 ID（格式：chat_YYYYMMDD_序号） */
  sessionId: string
  /** 会话标题 */
  title: string
  /** 是否为当前激活的会话 */
  active: boolean
  /** 消息数量 */
  messageCount: number
  /** 最后一条消息的时间戳（秒） */
  lastMessageAt: number
}

/**
 * 按日期分组的会话列表
 */
export interface GroupedSessions {
  /** 日期标签（如 "11月24日"） */
  date: string
  /** 用于排序的时间戳（秒） */
  timestamp: number
  /** 该日期下的会话列表 */
  sessions: ChatSession[]
}

/**
 * 服务器消息类型
 */
export interface ServerMessage {
  /** 消息类型 */
  type: 'llm' | 'tts' | 'stt' | 'mcp'
  /** 消息状态 */
  state?: 'start' | 'stop' | 'sentence_start' | 'sentence_end'
  /** 文本内容 */
  text?: string
  /** 情感类型 */
  emotion?: string
  /** MCP 工具调用参数 */
  payload?: {
    params?: {
      name?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  /** 其他属性 */
  [key: string]: unknown
}

/**
 * 图片捕获事件数据
 */
export interface ImageCapturedEvent {
  /** 图片类型 */
  type: 'screenshot' | 'camera'
  /** 图片 base64 数据 */
  imageBase64: string
  /** 捕获时间戳（毫秒） */
  timestamp: number
}

/**
 * 添加消息参数
 */
export interface AddMessageParams {
  /** 会话 ID */
  session_id: string
  /** 角色 */
  role: 'user' | 'assistant'
  /** 消息内容 */
  content: string
  /** 来源类型 */
  source_type?: 'text' | 'voice' | 'tts' | 'image'
  /** 情感类型 */
  emotion?: string
  /** 图片数据 */
  image_data?: Uint8Array
  /** 时间戳（秒） */
  timestamp: number
}

/**
 * 创建会话参数
 */
export interface CreateSessionParams {
  /** 会话 ID */
  session_id: string
  /** 会话标题 */
  title: string
  /** 开始时间戳（秒） */
  started_at: number
}

/**
 * 数据库会话数据（来自后端）
 */
export interface DbSession {
  /** 数据库 ID */
  id: number
  /** 会话 ID */
  session_id: string
  /** 标题 */
  title: string | null
  /** 开始时间 */
  started_at: number
  /** 消息数量 */
  message_count: number
  /** 最后一条消息时间 */
  last_message_at: number
}

/**
 * 数据库消息数据（来自后端）
 */
export interface DbMessage {
  /** 数据库 ID */
  id: number
  /** 会话 ID */
  session_id: string
  /** 角色 */
  role: 'user' | 'assistant'
  /** 内容 */
  content: string
  /** 来源类型 */
  source_type: string | null
  /** 情感 */
  emotion: string | null
  /** 图片数据 */
  image_data: Uint8Array | null
  /** 时间戳 */
  timestamp: number
}
