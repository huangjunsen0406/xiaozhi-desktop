import type { Buffer } from 'node:buffer'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { app } from 'electron'
/**
 * 数据库管理器 - 单例模式
 */
export class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private db: Database.Database

  private constructor() {
    // 根据是否为开发模式决定数据库文件位置
    let dbDir: string
    if (app.isPackaged) {
      // 生产模式：使用系统目录
      dbDir = join(app.getPath('userData'), 'data')
    }
    else {
      // 开发模式：使用项目根目录
      dbDir = join(process.cwd(), 'config')
    }

    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    const dbPath = join(dbDir, 'xiaozhi.db')
    console.log(`[Database] 数据库路径: ${dbPath}`)

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL') // 提高并发性能
    this.initializeTables()
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  /**
   * 初始化数据库表
   */
  private initializeTables(): void {
    // 设备信息表 - 平铺所有设备信息（包含设备指纹）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS device_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- 设备标识
        mac_address TEXT UNIQUE NOT NULL,
        serial_number TEXT UNIQUE NOT NULL,
        hmac_key TEXT NOT NULL,
        machine_id TEXT,
        -- 设备指纹
        system TEXT,
        hostname TEXT,
        -- 激活状态
        activation_status INTEGER DEFAULT 0,
        -- 时间戳
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    // 网络配置表 - 所有网络相关配置（包含 MQTT）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS network_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- 基本配置
        client_id TEXT UNIQUE NOT NULL,
        device_id TEXT,
        -- OTA 配置
        ota_version_url TEXT DEFAULT 'https://api.tenclass.net/xiaozhi/ota/',
        activation_version TEXT DEFAULT 'v2',
        authorization_url TEXT DEFAULT 'https://xiaozhi.me/',
        -- WebSocket 配置
        websocket_url TEXT,
        websocket_access_token TEXT,
        -- MQTT 配置
        mqtt_endpoint TEXT,
        mqtt_client_id TEXT,
        mqtt_username TEXT,
        mqtt_password TEXT,
        mqtt_publish_topic TEXT,
        mqtt_subscribe_topic TEXT,
        -- 时间戳
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    // 音频配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audio_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- 设备选择（通过名称匹配设备）
        input_device_name TEXT,
        output_device_name TEXT,
        -- 音频处理
        enable_noise_reduction INTEGER DEFAULT 1,
        enable_echo_cancellation INTEGER DEFAULT 1,
        -- 对话模式: 'auto' 或 'realtime'
        conversation_mode TEXT DEFAULT 'auto',
        -- 时间戳
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    // 唤醒词配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wake_word_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- 启用状态
        enabled INTEGER DEFAULT 1,
        -- 当前语言/模型
        language TEXT DEFAULT 'zh',
        -- 唤醒词列表（换行符分隔的中文列表）
        keywords_list TEXT DEFAULT '你好小智',
        -- 检测阈值 (0.1-1.0, 越低越灵敏)
        threshold REAL DEFAULT 0.2,
        -- 分数权重
        score REAL DEFAULT 1.8,
        -- 冷却时间（毫秒）
        cooldown_ms INTEGER DEFAULT 1500,
        -- 时间戳
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    // 摄像头配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS camera_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- 基础设置
        enabled INTEGER DEFAULT 1,
        device_id TEXT DEFAULT '',
        device_label TEXT DEFAULT '',
        -- 视觉服务配置（本地）
        use_local_vision INTEGER DEFAULT 0,
        vl_api_key TEXT DEFAULT '',
        vl_url TEXT DEFAULT '',
        vl_model TEXT DEFAULT 'glm-4v-plus',
        -- 捕获设置
        capture_width INTEGER DEFAULT 1280,
        capture_height INTEGER DEFAULT 720,
        jpeg_quality INTEGER DEFAULT 80,
        max_dimension INTEGER DEFAULT 320,
        -- 时间戳
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    // 聊天会话表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        title TEXT,
        message_count INTEGER DEFAULT 0,
        started_at INTEGER NOT NULL,
        last_message_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    // 聊天消息表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        emotion TEXT,
        source_type TEXT NOT NULL,
        image_data BLOB,
        timestamp INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id)
      )
    `)

    // 创建索引以提高查询性能
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_message_at ON chat_sessions(last_message_at)
    `)

    console.log('[Database] 数据库表初始化完成')
  }

  /* ==================== 设备信息相关 ==================== */

  /**
   * 获取或创建设备信息
   */
  getOrCreateDeviceInfo(data: {
    mac_address: string
    serial_number: string
    hmac_key: string
    machine_id: string
    hostname?: string
    system?: string
  }): any {
    // 先尝试查找
    const existing = this.db.prepare('SELECT * FROM device_info WHERE serial_number = ?').get(data.serial_number)

    if (existing) {
      // 更新时间戳
      this.db.prepare('UPDATE device_info SET updated_at = strftime(\'%s\', \'now\') WHERE serial_number = ?')
        .run(data.serial_number)
      return existing
    }

    // 插入新记录
    const result = this.db.prepare(`
      INSERT INTO device_info (mac_address, serial_number, hmac_key, machine_id, hostname, system)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.mac_address,
      data.serial_number,
      data.hmac_key,
      data.machine_id,
      data.hostname || '',
      data.system || '',
    )

    return this.db.prepare('SELECT * FROM device_info WHERE id = ?').get(result.lastInsertRowid)
  }

  /**
   * 获取设备信息
   */
  getDeviceInfo(): any {
    return this.db.prepare('SELECT * FROM device_info ORDER BY id DESC LIMIT 1').get()
  }

  /**
   * 更新激活状态
   */
  setActivationStatus(serialNumber: string, status: boolean): void {
    this.db.prepare(`
      UPDATE device_info
      SET activation_status = ?, updated_at = strftime('%s', 'now')
      WHERE serial_number = ?
    `).run(status ? 1 : 0, serialNumber)
  }

  /**
   * 获取激活状态
   */
  getActivationStatus(serialNumber: string): boolean {
    const result = this.db.prepare('SELECT activation_status FROM device_info WHERE serial_number = ?').get(serialNumber) as any
    return result ? result.activation_status === 1 : false
  }

  /* ==================== 网络配置相关 ==================== */

  /**
   * 获取或创建网络配置
   */
  getOrCreateNetworkConfig(data: {
    client_id: string
    device_id?: string
  }): any {
    // 先尝试查找
    const existing = this.db.prepare('SELECT * FROM network_config WHERE client_id = ?').get(data.client_id)

    if (existing) {
      return existing
    }

    // 插入新记录
    const result = this.db.prepare(`
      INSERT INTO network_config (client_id, device_id)
      VALUES (?, ?)
    `).run(data.client_id, data.device_id || null)

    return this.db.prepare('SELECT * FROM network_config WHERE id = ?').get(result.lastInsertRowid)
  }

  /**
   * 获取网络配置
   */
  getNetworkConfig(): any {
    return this.db.prepare('SELECT * FROM network_config ORDER BY id DESC LIMIT 1').get()
  }

  /**
   * 更新网络配置字段
   */
  updateNetworkConfig(field: string, value: any): void {
    // 确保配置记录存在
    let config = this.getNetworkConfig()
    if (!config) {
      // 创建默认配置
      const result = this.db.prepare(`
        INSERT INTO network_config (client_id) VALUES ('default')
      `).run()
      config = this.db.prepare('SELECT * FROM network_config WHERE id = ?').get(result.lastInsertRowid)
    }

    // 更新字段
    this.db.prepare(`
      UPDATE network_config
      SET ${field} = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(value, config.id)
  }

  /**
   * 批量更新网络配置
   */
  updateNetworkConfigBatch(updates: Record<string, any>): void {
    // 确保配置记录存在
    let config = this.getNetworkConfig()
    if (!config) {
      const result = this.db.prepare(`
        INSERT INTO network_config (client_id) VALUES ('default')
      `).run()
      config = this.db.prepare('SELECT * FROM network_config WHERE id = ?').get(result.lastInsertRowid)
    }

    // 构建更新语句
    const fields = Object.keys(updates)
    const setClause = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => updates[f])

    this.db.prepare(`
      UPDATE network_config
      SET ${setClause}, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(...values, config.id)
  }

  /* ==================== 类型安全的配置访问方法 ==================== */

  /**
   * 获取所有网络配置（扁平格式）
   */
  getAllConfig(): Record<string, any> {
    const config = this.getNetworkConfig()
    if (!config) {
      return {
        client_id: '',
        device_id: '',
        ota_version_url: 'https://api.tenclass.net/xiaozhi/ota/',
        activation_version: 'v2',
        authorization_url: 'https://xiaozhi.me/',
        websocket_url: null,
        websocket_access_token: null,
        mqtt_endpoint: null,
        mqtt_client_id: null,
        mqtt_username: null,
        mqtt_password: null,
        mqtt_publish_topic: null,
        mqtt_subscribe_topic: null,
      }
    }

    return {
      client_id: config.client_id,
      device_id: config.device_id,
      ota_version_url: config.ota_version_url,
      activation_version: config.activation_version,
      authorization_url: config.authorization_url,
      websocket_url: config.websocket_url,
      websocket_access_token: config.websocket_access_token,
      mqtt_endpoint: config.mqtt_endpoint,
      mqtt_client_id: config.mqtt_client_id,
      mqtt_username: config.mqtt_username,
      mqtt_password: config.mqtt_password,
      mqtt_publish_topic: config.mqtt_publish_topic,
      mqtt_subscribe_topic: config.mqtt_subscribe_topic,
    }
  }

  /* ==================== 音频配置相关 ==================== */

  /**
   * 获取或创建音频配置
   */
  getOrCreateAudioConfig(): any {
    // 先尝试查找
    const existing = this.db.prepare('SELECT * FROM audio_config ORDER BY id DESC LIMIT 1').get()

    if (existing) {
      return existing
    }

    // 插入默认配置（不包含音量）
    const result = this.db.prepare(`
      INSERT INTO audio_config (enable_noise_reduction, enable_echo_cancellation, conversation_mode)
      VALUES (?, ?, ?)
    `).run(1, 1, 'auto')

    return this.db.prepare('SELECT * FROM audio_config WHERE id = ?').get(result.lastInsertRowid)
  }

  /**
   * 获取音频配置
   */
  getAudioConfig(): any {
    return this.db.prepare('SELECT * FROM audio_config ORDER BY id DESC LIMIT 1').get()
  }

  /**
   * 更新音频配置（批量）
   */
  updateAudioConfig(updates: {
    input_device_name?: string | null
    output_device_name?: string | null
    enable_noise_reduction?: boolean
    enable_echo_cancellation?: boolean
    conversation_mode?: string
  }): void {
    // 确保配置记录存在
    let config = this.getAudioConfig()
    if (!config) {
      config = this.getOrCreateAudioConfig()
    }

    // 转换布尔值为整数
    const dbUpdates: Record<string, any> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'boolean') {
        dbUpdates[key] = value ? 1 : 0
      }
      else if (value !== undefined) {
        dbUpdates[key] = value
      }
    }

    // 构建更新语句
    const fields = Object.keys(dbUpdates)
    if (fields.length === 0) {
      return
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => dbUpdates[f])

    this.db.prepare(`
      UPDATE audio_config
      SET ${setClause}, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(...values, config.id)
  }

  /**
   * 获取格式化的音频配置（转换为应用使用的格式）
   */
  getFormattedAudioConfig(): {
    inputDeviceName?: string
    outputDeviceName?: string
    enableNoiseReduction: boolean
    enableEchoCancellation: boolean
    conversationMode: 'realtime' | 'auto'
  } {
    const config = this.getOrCreateAudioConfig()

    return {
      inputDeviceName: config.input_device_name || undefined,
      outputDeviceName: config.output_device_name || undefined,
      enableNoiseReduction: Boolean(config.enable_noise_reduction),
      enableEchoCancellation: Boolean(config.enable_echo_cancellation),
      conversationMode: (config.conversation_mode as 'realtime' | 'auto') || 'auto',
    }
  }

  /* ==================== 唤醒词配置相关 ==================== */

  /**
   * 获取或创建唤醒词配置
   */
  getOrCreateWakeWordConfig(): any {
    // 先尝试查找
    const existing = this.db.prepare('SELECT * FROM wake_word_config ORDER BY id DESC LIMIT 1').get()

    if (existing) {
      return existing
    }

    // 插入默认配置
    const result = this.db.prepare(`
      INSERT INTO wake_word_config (
        enabled, language, keywords_list,
        keyword_zh, keyword_en,
        threshold, score, cooldown_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'zh', '你好小智', '你好小智', 'MOSS', 0.2, 1.8, 1500)

    return this.db.prepare('SELECT * FROM wake_word_config WHERE id = ?').get(result.lastInsertRowid)
  }

  /**
   * 获取唤醒词配置
   */
  getWakeWordConfig(): any {
    return this.db.prepare('SELECT * FROM wake_word_config ORDER BY id DESC LIMIT 1').get()
  }

  /**
   * 更新唤醒词配置（批量）
   */
  updateWakeWordConfig(updates: {
    enabled?: boolean
    language?: string
    keyword?: string
    threshold?: number
    score?: number
    cooldown_ms?: number
  }): void {
    // 确保配置记录存在
    let config = this.getWakeWordConfig()
    if (!config) {
      config = this.getOrCreateWakeWordConfig()
    }

    // 转换布尔值为整数
    const dbUpdates: Record<string, any> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'boolean') {
        dbUpdates[key] = value ? 1 : 0
      }
      else if (value !== undefined) {
        dbUpdates[key] = value
      }
    }

    // 构建更新语句
    const fields = Object.keys(dbUpdates)
    if (fields.length === 0) {
      return
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => dbUpdates[f])

    this.db.prepare(`
      UPDATE wake_word_config
      SET ${setClause}, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(...values, config.id)
  }

  /**
   * 获取格式化的唤醒词配置（转换为应用使用的格式）
   */
  getFormattedWakeWordConfig(): {
    enabled: boolean
    language: string
    keyword: string
    threshold: number
    score: number
    cooldownMs: number
  } {
    const config = this.getOrCreateWakeWordConfig()
    const language = config.language || 'zh'

    // 根据当前语言选择对应的唤醒词
    let keyword: string
    if (language === 'zh') {
      keyword = config.keyword_zh || '小智'
    }
    else if (language === 'en') {
      keyword = config.keyword_en || 'HELLO'
    }
    else {
      keyword = config.keyword || '小智'
    }

    return {
      enabled: Boolean(config.enabled),
      language,
      keyword,
      threshold: config.threshold || 0.2,
      score: config.score || 1.8,
      cooldownMs: config.cooldown_ms || 1500,
    }
  }

  /* ==================== 摄像头配置相关 ==================== */

  /**
   * 获取或创建摄像头配置
   */
  getOrCreateCameraConfig(): any {
    // 先尝试查找
    const existing = this.db.prepare('SELECT * FROM camera_config ORDER BY id DESC LIMIT 1').get()

    if (existing) {
      return existing
    }

    // 插入默认配置
    const result = this.db.prepare(`
      INSERT INTO camera_config (
        enabled, device_id, device_label,
        use_local_vision, vl_api_key, vl_url, vl_model,
        capture_width, capture_height, jpeg_quality, max_dimension
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, '', '', 0, '', '', 'glm-4v-plus', 1280, 720, 80, 320)

    return this.db.prepare('SELECT * FROM camera_config WHERE id = ?').get(result.lastInsertRowid)
  }

  /**
   * 获取摄像头配置
   */
  getCameraConfig(): any {
    return this.db.prepare('SELECT * FROM camera_config ORDER BY id DESC LIMIT 1').get()
  }

  /**
   * 更新摄像头配置（批量）
   */
  updateCameraConfig(updates: {
    enabled?: boolean
    device_id?: string
    device_label?: string
    use_local_vision?: boolean
    vl_api_key?: string
    vl_url?: string
    vl_model?: string
    capture_width?: number
    capture_height?: number
    jpeg_quality?: number
    max_dimension?: number
  }): void {
    // 确保配置记录存在
    let config = this.getCameraConfig()
    if (!config) {
      config = this.getOrCreateCameraConfig()
    }

    // 转换布尔值为整数
    const dbUpdates: Record<string, any> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'boolean') {
        dbUpdates[key] = value ? 1 : 0
      }
      else if (value !== undefined) {
        dbUpdates[key] = value
      }
    }

    // 构建更新语句
    const fields = Object.keys(dbUpdates)
    if (fields.length === 0) {
      return
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => dbUpdates[f])

    this.db.prepare(`
      UPDATE camera_config
      SET ${setClause}, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(...values, config.id)
  }

  /**
   * 获取格式化的摄像头配置（转换为应用使用的格式）
   */
  getFormattedCameraConfig(): {
    enabled: boolean
    deviceId: string
    deviceLabel: string
    useLocalVision: boolean
    vlApiKey: string
    vlUrl: string
    vlModel: string
    captureWidth: number
    captureHeight: number
    jpegQuality: number
    maxDimension: number
  } {
    const config = this.getOrCreateCameraConfig()

    return {
      enabled: Boolean(config.enabled),
      deviceId: config.device_id || '',
      deviceLabel: config.device_label || '',
      useLocalVision: Boolean(config.use_local_vision),
      vlApiKey: config.vl_api_key || '',
      vlUrl: config.vl_url || '',
      vlModel: config.vl_model || 'glm-4v-plus',
      captureWidth: config.capture_width || 1280,
      captureHeight: config.capture_height || 720,
      jpegQuality: config.jpeg_quality || 80,
      maxDimension: config.max_dimension || 320,
    }
  }

  /* ==================== 聊天会话相关 ==================== */

  /**
   * 创建新会话
   */
  createChatSession(data: {
    session_id: string
    title?: string
    started_at?: number
  }): any {
    const startedAt = data.started_at || Math.floor(Date.now() / 1000)

    const result = this.db.prepare(`
      INSERT INTO chat_sessions (session_id, title, started_at, last_message_at)
      VALUES (?, ?, ?, ?)
    `).run(data.session_id, data.title || null, startedAt, startedAt)

    return this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(result.lastInsertRowid)
  }

  /**
   * 获取所有会话列表（按最后消息时间倒序）
   */
  getChatSessions(limit = 50, offset = 0): any[] {
    return this.db.prepare(`
      SELECT * FROM chat_sessions
      ORDER BY last_message_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[]
  }

  /**
   * 根据 session_id 获取会话
   */
  getChatSession(sessionId: string): any {
    return this.db.prepare('SELECT * FROM chat_sessions WHERE session_id = ?').get(sessionId)
  }

  /**
   * 更新会话标题
   */
  updateChatSessionTitle(sessionId: string, title: string): void {
    this.db.prepare(`
      UPDATE chat_sessions
      SET title = ?
      WHERE session_id = ?
    `).run(title, sessionId)
  }

  /**
   * 更新会话的消息数量和最后消息时间
   */
  updateChatSessionStats(sessionId: string): void {
    // 获取该会话的消息数量和最后一条消息时间
    const stats = this.db.prepare(`
      SELECT COUNT(*) as count, MAX(timestamp) as last_ts
      FROM chat_messages
      WHERE session_id = ?
    `).get(sessionId) as any

    this.db.prepare(`
      UPDATE chat_sessions
      SET message_count = ?, last_message_at = ?
      WHERE session_id = ?
    `).run(stats.count, stats.last_ts, sessionId)
  }

  /**
   * 删除会话及其所有消息
   */
  deleteChatSession(sessionId: string): void {
    // 开启事务，确保原子性
    const deleteMessages = this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?')
    const deleteSession = this.db.prepare('DELETE FROM chat_sessions WHERE session_id = ?')

    const transaction = this.db.transaction(() => {
      deleteMessages.run(sessionId)
      deleteSession.run(sessionId)
    })

    transaction()
  }

  /* ==================== 聊天消息相关 ==================== */

  /**
   * 添加消息到会话
   */
  addChatMessage(data: {
    session_id: string
    role: 'user' | 'assistant'
    content: string
    emotion?: string
    source_type: string
    image_data?: Buffer
    timestamp?: number
  }): any {
    const timestamp = data.timestamp || Math.floor(Date.now() / 1000)

    const result = this.db.prepare(`
      INSERT INTO chat_messages (session_id, role, content, emotion, source_type, image_data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.session_id,
      data.role,
      data.content,
      data.emotion || null,
      data.source_type,
      data.image_data || null,
      timestamp,
    )

    // 更新会话统计
    this.updateChatSessionStats(data.session_id)

    return this.db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(result.lastInsertRowid)
  }

  /**
   * 获取指定会话的所有消息
   */
  getChatMessages(sessionId: string, limit = 100, offset = 0): any[] {
    return this.db.prepare(`
      SELECT * FROM chat_messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset) as any[]
  }

  /**
   * 获取指定会话的消息数量
   */
  getChatMessageCount(sessionId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM chat_messages
      WHERE session_id = ?
    `).get(sessionId) as any
    return result.count
  }

  /**
   * 删除指定消息
   */
  deleteChatMessage(messageId: number): void {
    // 先获取消息所属的会话
    const message = this.db.prepare('SELECT session_id FROM chat_messages WHERE id = ?').get(messageId) as any

    if (message) {
      this.db.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId)
      // 更新会话统计
      this.updateChatSessionStats(message.session_id)
    }
  }

  /**
   * 清空指定会话的所有消息
   */
  clearChatMessages(sessionId: string): void {
    this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId)
    // 更新会话统计
    this.updateChatSessionStats(sessionId)
  }

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close()
  }
}
