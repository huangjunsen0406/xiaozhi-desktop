import type { Buffer } from 'node:buffer'
import type {
  AudioConfigUpdate,
  DbAudioConfig,
  DbCameraConfig,
  DbChatMessage,
  DbChatSession,
  DbDeviceInfo,
  DbNetworkConfig,
  DbSessionStats,
  DbWakeWordConfig,
} from '../types/database'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { app } from 'electron'

export class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private db: Database.Database

  private constructor() {
    let dbDir: string
    if (app.isPackaged) {
      dbDir = join(app.getPath('userData'), 'data')
    }
    else {
      dbDir = join(process.cwd(), 'config')
    }

    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    const dbPath = join(dbDir, 'xiaozhi.db')
    console.log(`[Database] 数据库路径: ${dbPath}`)

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initializeTables()
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS device_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mac_address TEXT UNIQUE NOT NULL,
        serial_number TEXT UNIQUE NOT NULL,
        hmac_key TEXT NOT NULL,
        machine_id TEXT,
        system TEXT,
        hostname TEXT,
        activation_status INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS network_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT UNIQUE NOT NULL,
        device_id TEXT,
        ota_version_url TEXT DEFAULT 'https://api.tenclass.net/xiaozhi/ota/',
        activation_version TEXT DEFAULT 'v2',
        authorization_url TEXT DEFAULT 'https://xiaozhi.me/',
        websocket_url TEXT,
        websocket_access_token TEXT,
        mqtt_endpoint TEXT,
        mqtt_client_id TEXT,
        mqtt_username TEXT,
        mqtt_password TEXT,
        mqtt_publish_topic TEXT,
        mqtt_subscribe_topic TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audio_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        input_device_name TEXT,
        output_device_name TEXT,
        enable_noise_reduction INTEGER DEFAULT 1,
        enable_echo_cancellation INTEGER DEFAULT 1,
        conversation_mode TEXT DEFAULT 'auto',
        input_sample_rate INTEGER DEFAULT 16000,
        output_sample_rate INTEGER DEFAULT 24000,
        channels INTEGER DEFAULT 1,
        max_input_channels INTEGER DEFAULT 2,
        max_output_channels INTEGER DEFAULT 2,
        frame_duration INTEGER DEFAULT 20,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wake_word_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enabled INTEGER DEFAULT 1,
        language TEXT DEFAULT 'zh',
        keywords_list TEXT DEFAULT '你好小智',
        threshold REAL DEFAULT 0.2,
        score REAL DEFAULT 1.8,
        cooldown_ms INTEGER DEFAULT 1500,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS camera_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enabled INTEGER DEFAULT 1,
        device_id TEXT DEFAULT '',
        device_label TEXT DEFAULT '',
        use_local_vision INTEGER DEFAULT 0,
        vl_api_key TEXT DEFAULT '',
        vl_url TEXT DEFAULT '',
        vl_model TEXT DEFAULT 'glm-4v-plus',
        capture_width INTEGER DEFAULT 1280,
        capture_height INTEGER DEFAULT 720,
        jpeg_quality INTEGER DEFAULT 80,
        max_dimension INTEGER DEFAULT 320,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

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

  getOrCreateDeviceInfo(data: {
    mac_address: string
    serial_number: string
    hmac_key: string
    machine_id: string
    hostname?: string
    system?: string
  }): DbDeviceInfo {
    const existing = this.db.prepare('SELECT * FROM device_info WHERE serial_number = ?').get(data.serial_number)

    if (existing) {
      this.db.prepare('UPDATE device_info SET updated_at = strftime(\'%s\', \'now\') WHERE serial_number = ?')
        .run(data.serial_number)
      return existing as DbDeviceInfo
    }

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

    return this.db.prepare('SELECT * FROM device_info WHERE id = ?').get(result.lastInsertRowid) as DbDeviceInfo
  }

  getDeviceInfo(): DbDeviceInfo | undefined {
    return this.db.prepare('SELECT * FROM device_info ORDER BY id DESC LIMIT 1').get() as DbDeviceInfo | undefined
  }

  setActivationStatus(serialNumber: string, status: boolean): void {
    this.db.prepare(`
      UPDATE device_info
      SET activation_status = ?, updated_at = strftime('%s', 'now')
      WHERE serial_number = ?
    `).run(status ? 1 : 0, serialNumber)
  }

  getActivationStatus(serialNumber: string): boolean {
    const result = this.db.prepare('SELECT activation_status FROM device_info WHERE serial_number = ?').get(serialNumber) as { activation_status: number } | undefined
    return result ? result.activation_status === 1 : false
  }

  getOrCreateNetworkConfig(data: {
    client_id: string
    device_id?: string
  }): DbNetworkConfig {
    const existing = this.db.prepare('SELECT * FROM network_config WHERE client_id = ?').get(data.client_id)

    if (existing) {
      return existing as DbNetworkConfig
    }

    const result = this.db.prepare(`
      INSERT INTO network_config (client_id, device_id)
      VALUES (?, ?)
    `).run(data.client_id, data.device_id || null)

    return this.db.prepare('SELECT * FROM network_config WHERE id = ?').get(result.lastInsertRowid) as DbNetworkConfig
  }

  getNetworkConfig(): DbNetworkConfig | undefined {
    return this.db.prepare('SELECT * FROM network_config ORDER BY id DESC LIMIT 1').get() as DbNetworkConfig | undefined
  }

  updateNetworkConfig(field: string, value: string | null): void {
    let config = this.getNetworkConfig()
    if (!config) {
      const result = this.db.prepare(`
        INSERT INTO network_config (client_id) VALUES ('default')
      `).run()
      config = this.db.prepare('SELECT * FROM network_config WHERE id = ?').get(result.lastInsertRowid) as DbNetworkConfig
    }

    this.db.prepare(`
      UPDATE network_config
      SET ${field} = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(value, config.id)
  }

  updateNetworkConfigBatch(updates: Record<string, string | null>): void {
    let config = this.getNetworkConfig()
    if (!config) {
      const result = this.db.prepare(`
        INSERT INTO network_config (client_id) VALUES ('default')
      `).run()
      config = this.db.prepare('SELECT * FROM network_config WHERE id = ?').get(result.lastInsertRowid) as DbNetworkConfig
    }

    const fields = Object.keys(updates)
    const setClause = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => updates[f])

    this.db.prepare(`
      UPDATE network_config
      SET ${setClause}, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(...values, config.id)
  }

  getAllConfig(): Record<string, string | null> {
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

  getOrCreateAudioConfig(): DbAudioConfig {
    const existing = this.db.prepare('SELECT * FROM audio_config ORDER BY id DESC LIMIT 1').get()

    if (existing) {
      return existing as DbAudioConfig
    }

    const result = this.db.prepare(`
      INSERT INTO audio_config (
        enable_noise_reduction, enable_echo_cancellation, conversation_mode,
        input_sample_rate, output_sample_rate, channels,
        max_input_channels, max_output_channels, frame_duration
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 'auto', 16000, 24000, 1, 2, 2, 20)

    return this.db.prepare('SELECT * FROM audio_config WHERE id = ?').get(result.lastInsertRowid) as DbAudioConfig
  }

  getAudioConfig(): DbAudioConfig | undefined {
    return this.db.prepare('SELECT * FROM audio_config ORDER BY id DESC LIMIT 1').get() as DbAudioConfig | undefined
  }

  updateAudioConfig(updates: AudioConfigUpdate | Record<string, unknown>): void {
    let config = this.getAudioConfig()
    if (!config) {
      config = this.getOrCreateAudioConfig()
    }

    const dbUpdates: Record<string, string | number | null> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'boolean') {
        dbUpdates[key] = value ? 1 : 0
      }
      else if (value !== undefined) {
        dbUpdates[key] = value as string | number | null
      }
    }

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

  getFormattedAudioConfig(): {
    inputDeviceName?: string
    outputDeviceName?: string
    enableNoiseReduction: boolean
    enableEchoCancellation: boolean
    conversationMode: 'realtime' | 'auto'
    inputSampleRate: number
    outputSampleRate: number
    channels: number
    maxInputChannels: number
    maxOutputChannels: number
    frameDuration: number
  } {
    const config = this.getOrCreateAudioConfig()

    return {
      inputDeviceName: config.input_device_name || undefined,
      outputDeviceName: config.output_device_name || undefined,
      enableNoiseReduction: Boolean(config.enable_noise_reduction),
      enableEchoCancellation: Boolean(config.enable_echo_cancellation),
      conversationMode: (config.conversation_mode as 'realtime' | 'auto') || 'auto',
      inputSampleRate: config.input_sample_rate || 16000,
      outputSampleRate: config.output_sample_rate || 24000,
      channels: config.channels || 1,
      maxInputChannels: config.max_input_channels || 2,
      maxOutputChannels: config.max_output_channels || 2,
      frameDuration: config.frame_duration || 20,
    }
  }

  getOrCreateWakeWordConfig(): DbWakeWordConfig {
    const existing = this.db.prepare('SELECT * FROM wake_word_config ORDER BY id DESC LIMIT 1').get()

    if (existing) {
      return existing as DbWakeWordConfig
    }

    const result = this.db.prepare(`
      INSERT INTO wake_word_config (
        enabled, language, keywords_list,
        keyword_zh, keyword_en,
        threshold, score, cooldown_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'zh', '你好小智', '你好小智', 'MOSS', 0.2, 1.8, 1500)

    return this.db.prepare('SELECT * FROM wake_word_config WHERE id = ?').get(result.lastInsertRowid) as DbWakeWordConfig
  }

  getWakeWordConfig(): DbWakeWordConfig | undefined {
    return this.db.prepare('SELECT * FROM wake_word_config ORDER BY id DESC LIMIT 1').get() as DbWakeWordConfig | undefined
  }

  updateWakeWordConfig(updates: {
    enabled?: boolean
    language?: string
    keyword?: string
    keyword_zh?: string
    keyword_en?: string
    threshold?: number
    score?: number
    cooldown_ms?: number
  }): void {
    let config = this.getWakeWordConfig()
    if (!config) {
      config = this.getOrCreateWakeWordConfig()
    }

    const dbUpdates: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'boolean') {
        dbUpdates[key] = value ? 1 : 0
      }
      else if (value !== undefined) {
        dbUpdates[key] = value as string | number
      }
    }

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

  getOrCreateCameraConfig(): DbCameraConfig {
    const existing = this.db.prepare('SELECT * FROM camera_config ORDER BY id DESC LIMIT 1').get()

    if (existing) {
      return existing as DbCameraConfig
    }

    const result = this.db.prepare(`
      INSERT INTO camera_config (
        enabled, device_id, device_label,
        use_local_vision, vl_api_key, vl_url, vl_model,
        capture_width, capture_height, jpeg_quality, max_dimension
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, '', '', 0, '', '', 'glm-4v-plus', 1280, 720, 80, 320)

    return this.db.prepare('SELECT * FROM camera_config WHERE id = ?').get(result.lastInsertRowid) as DbCameraConfig
  }

  getCameraConfig(): DbCameraConfig | undefined {
    return this.db.prepare('SELECT * FROM camera_config ORDER BY id DESC LIMIT 1').get() as DbCameraConfig | undefined
  }

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
    let config = this.getCameraConfig()
    if (!config) {
      config = this.getOrCreateCameraConfig()
    }

    const dbUpdates: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'boolean') {
        dbUpdates[key] = value ? 1 : 0
      }
      else if (value !== undefined) {
        dbUpdates[key] = value as string | number
      }
    }

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

  createChatSession(data: {
    session_id: string
    title?: string
    started_at?: number
  }): DbChatSession {
    const startedAt = data.started_at || Math.floor(Date.now() / 1000)

    const result = this.db.prepare(`
      INSERT INTO chat_sessions (session_id, title, started_at, last_message_at)
      VALUES (?, ?, ?, ?)
    `).run(data.session_id, data.title || null, startedAt, startedAt)

    return this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(result.lastInsertRowid) as DbChatSession
  }

  getChatSessions(limit = 50, offset = 0): DbChatSession[] {
    return this.db.prepare(`
      SELECT * FROM chat_sessions
      ORDER BY last_message_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as DbChatSession[]
  }

  getChatSession(sessionId: string): DbChatSession | undefined {
    return this.db.prepare('SELECT * FROM chat_sessions WHERE session_id = ?').get(sessionId) as DbChatSession | undefined
  }

  updateChatSessionTitle(sessionId: string, title: string): void {
    this.db.prepare(`
      UPDATE chat_sessions
      SET title = ?
      WHERE session_id = ?
    `).run(title, sessionId)
  }

  updateChatSessionStats(sessionId: string): void {
    const stats = this.db.prepare(`
      SELECT COUNT(*) as count, MAX(timestamp) as last_ts
      FROM chat_messages
      WHERE session_id = ?
    `).get(sessionId) as DbSessionStats

    this.db.prepare(`
      UPDATE chat_sessions
      SET message_count = ?, last_message_at = ?
      WHERE session_id = ?
    `).run(stats.count, stats.last_ts, sessionId)
  }

  deleteChatSession(sessionId: string): void {
    const deleteMessages = this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?')
    const deleteSession = this.db.prepare('DELETE FROM chat_sessions WHERE session_id = ?')

    const transaction = this.db.transaction(() => {
      deleteMessages.run(sessionId)
      deleteSession.run(sessionId)
    })

    transaction()
  }

  addChatMessage(data: {
    session_id: string
    role: 'user' | 'assistant'
    content: string
    emotion?: string
    source_type: string
    image_data?: Buffer
    timestamp?: number
  }): DbChatMessage {
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

    this.updateChatSessionStats(data.session_id)

    return this.db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(result.lastInsertRowid) as DbChatMessage
  }

  getChatMessages(sessionId: string, limit?: number, offset = 0): DbChatMessage[] {
    // 如果不指定 limit，则加载所有消息
    if (limit === undefined || limit === null || limit <= 0) {
      return this.db.prepare(`
        SELECT * FROM chat_messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
      `).all(sessionId) as DbChatMessage[]
    }

    // 如果指定了 limit，则使用分页查询
    return this.db.prepare(`
      SELECT * FROM chat_messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset) as DbChatMessage[]
  }

  getChatMessageCount(sessionId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM chat_messages
      WHERE session_id = ?
    `).get(sessionId) as { count: number }
    return result.count
  }

  deleteChatMessage(messageId: number): void {
    const message = this.db.prepare('SELECT session_id FROM chat_messages WHERE id = ?').get(messageId) as { session_id: string } | undefined

    if (message) {
      this.db.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId)
      this.updateChatSessionStats(message.session_id)
    }
  }

  clearChatMessages(sessionId: string): void {
    this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId)
    this.updateChatSessionStats(sessionId)
  }

  close(): void {
    this.db.close()
  }
}
