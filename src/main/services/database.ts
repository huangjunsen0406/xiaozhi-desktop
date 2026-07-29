import type { ValidSampleRate } from '@shared/types'
import type { Buffer } from 'node:buffer'
import type {
  AudioConfigUpdate,
  DbAudioConfig,
  DbCameraConfig,
  DbChatMessage,
  DbChatSession,
  DbDeviceInfo,
  DbMusicConfig,
  DbNetworkConfig,
  DbSessionStats,
  DbShortcutConfig,
  DbWakeWordConfig,
} from '../types/database'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { getLogger } from '../utils/logger'
import { getDatabasePath } from '../utils/paths'

/**
 * 当前配置 schema 版本
 *
 * 向前迁移时递增；现有 ad-hoc 迁移收敛进版本框架后 stamp 到此基线。
 */
export const CONFIG_VERSION = 1

export class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private db: Database.Database
  private logger = getLogger('Database') // 移到类内部

  private constructor() {
    // 统一使用 paths API（默认仍为 userData/data，升级无感）
    const dbPath = getDatabasePath()
    const dbDir = dirname(dbPath)

    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    this.logger.info(`数据库路径: ${dbPath}`)

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
        keyword_zh TEXT DEFAULT '你好小智',
        keyword_en TEXT DEFAULT NULL,
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
        device_id TEXT DEFAULT NULL,
        device_label TEXT DEFAULT NULL,
        use_local_vision INTEGER DEFAULT 0,
        vl_api_key TEXT DEFAULT NULL,
        vl_url TEXT DEFAULT NULL,
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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shortcuts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        accelerator TEXT,
        enabled INTEGER DEFAULT 1,
        is_global INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS music_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        search_url TEXT DEFAULT 'http://search.kuwo.cn/r.s',
        url_api TEXT DEFAULT 'https://lxmusicapi.onrender.com',
        url_api_key TEXT DEFAULT 'share-v3',
        url_response_path TEXT DEFAULT 'data.url',
        lyrics_url TEXT DEFAULT 'http://m.kuwo.cn/newh5/singles/songinfoandlrc',
        default_source TEXT DEFAULT 'kw',
        default_quality TEXT DEFAULT '320k',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS window_positions (
        mode TEXT PRIMARY KEY,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    // 配置版本元表（CONFIG_VERSION 框架）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    // 按 CONFIG_VERSION 向前迁移（含既有 ad-hoc 迁移收敛）
    this.runConfigMigrations()

    this.logger.info('数据库表初始化完成')
  }

  /**
   * 读取当前已 stamp 的配置版本（无记录视为 0）
   */
  getConfigVersion(): number {
    try {
      const row = this.db.prepare(
        `SELECT value FROM schema_meta WHERE key = 'config_version'`,
      ).get() as { value: string } | undefined
      if (!row)
        return 0
      const n = Number.parseInt(row.value, 10)
      return Number.isFinite(n) ? n : 0
    }
    catch {
      return 0
    }
  }

  /**
   * 写入配置版本 stamp
   */
  private setConfigVersion(version: number): void {
    this.db.prepare(`
      INSERT INTO schema_meta (key, value, updated_at)
      VALUES ('config_version', ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = strftime('%s', 'now')
    `).run(String(version))
  }

  /**
   * CONFIG_VERSION 向前迁移入口
   *
   * - 版本 0→1：跑既有 ad-hoc 迁移并 stamp 基线
   * - 未来版本在此追加 step
   */
  private runConfigMigrations(): void {
    let current = this.getConfigVersion()
    this.logger.info(`CONFIG_VERSION: disk=${current}, target=${CONFIG_VERSION}`)

    if (current >= CONFIG_VERSION) {
      // 已是最新；仍幂等跑一遍结构修复（旧库可能 stamp 前半完成）
      this.migrateWakeWordConfig()
      this.migrateNetworkConfigDefaults()
      this.migrateMusicConfigUrlResponsePath()
      return
    }

    // v0 → v1：收敛历史 ad-hoc 迁移
    if (current < 1) {
      this.logger.info('执行配置迁移 v0 → v1...')
      this.migrateWakeWordConfig()
      this.migrateNetworkConfigDefaults()
      this.migrateMusicConfigUrlResponsePath()
      this.setConfigVersion(1)
      current = 1
      this.logger.info('配置迁移 v0 → v1 完成')
    }

    // 未来：if (current < 2) { ...; this.setConfigVersion(2) }

    if (current !== CONFIG_VERSION) {
      this.logger.warn(`配置版本 stamp 异常: current=${current}, expected=${CONFIG_VERSION}`)
    }
  }

  /**
   * 迁移唤醒词配置：keywords_list -> keyword_zh/keyword_en
   */
  private migrateWakeWordConfig(): void {
    try {
      // 检查是否存在旧字段 keywords_list
      const tableInfo = this.db.prepare('PRAGMA table_info(wake_word_config)').all() as Array<{
        cid: number
        name: string
        type: string
        notnull: number
        dflt_value: string | null
        pk: number
      }>

      const hasKeywordsList = tableInfo.some(col => col.name === 'keywords_list')
      const hasKeywordZh = tableInfo.some(col => col.name === 'keyword_zh')
      const hasKeywordEn = tableInfo.some(col => col.name === 'keyword_en')

      // 如果已经是新结构，不需要迁移
      if (hasKeywordZh && hasKeywordEn && !hasKeywordsList) {
        return
      }

      // 如果存在旧字段，执行迁移
      if (hasKeywordsList) {
        this.logger.info('检测到旧的 keywords_list 字段，开始迁移...')

        const migrate = this.db.transaction(() => {
          // 读取现有配置
          const config = this.db.prepare('SELECT * FROM wake_word_config ORDER BY id DESC LIMIT 1').get() as {
            id: number
            enabled: number
            language: string
            keywords_list: string
            threshold: number
            score: number
            cooldown_ms: number
          } | undefined

          // 创建新表
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS wake_word_config_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              enabled INTEGER DEFAULT 1,
              language TEXT DEFAULT 'zh',
              keyword_zh TEXT DEFAULT '你好小智',
              keyword_en TEXT DEFAULT NULL,
              threshold REAL DEFAULT 0.2,
              score REAL DEFAULT 1.8,
              cooldown_ms INTEGER DEFAULT 1500,
              created_at INTEGER DEFAULT (strftime('%s', 'now')),
              updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
          `)

          // 如果有旧数据，迁移到新表
          if (config) {
            const keywordZh = config.language === 'zh' ? config.keywords_list : '你好小智'
            const keywordEn = config.language === 'en' ? config.keywords_list : null

            this.db.prepare(`
              INSERT INTO wake_word_config_new (enabled, language, keyword_zh, keyword_en, threshold, score, cooldown_ms)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              config.enabled,
              config.language,
              keywordZh,
              keywordEn,
              config.threshold,
              config.score,
              config.cooldown_ms,
            )

            this.logger.info(`已迁移唤醒词配置: language=${config.language}, keyword=${config.keywords_list}`)
          }

          // 删除旧表，重命名新表
          this.db.exec('DROP TABLE wake_word_config')
          this.db.exec('ALTER TABLE wake_word_config_new RENAME TO wake_word_config')
        })

        migrate()
        this.logger.info('唤醒词配置迁移完成')
      }
      // 如果缺少新字段，添加它们
      else if (!hasKeywordZh || !hasKeywordEn) {
        this.logger.info('添加缺失的唤醒词字段...')

        if (!hasKeywordZh) {
          this.db.exec('ALTER TABLE wake_word_config ADD COLUMN keyword_zh TEXT DEFAULT \'你好小智\'')
        }
        if (!hasKeywordEn) {
          this.db.exec('ALTER TABLE wake_word_config ADD COLUMN keyword_en TEXT DEFAULT NULL')
        }

        this.logger.info('唤醒词字段添加完成')
      }
    }
    catch (error) {
      this.logger.error('迁移唤醒词配置失败:', error)
    }
  }

  /**
   * 迁移网络配置：修复空的默认值字段
   */
  private migrateNetworkConfigDefaults(): void {
    try {
      const config = this.getNetworkConfig()

      // 如果配置不存在，不需要迁移
      if (!config) {
        return
      }

      // 检查是否需要更新默认值
      const needsUpdate = !config.ota_version_url || !config.authorization_url

      if (needsUpdate) {
        this.logger.info('检测到空的网络配置默认值，开始修复...')

        const updates: Record<string, string> = {}

        if (!config.ota_version_url) {
          updates.ota_version_url = 'https://api.tenclass.net/xiaozhi/ota/'
        }

        if (!config.authorization_url) {
          updates.authorization_url = 'https://xiaozhi.me/'
        }

        // 批量更新
        if (Object.keys(updates).length > 0) {
          const fields = Object.keys(updates)
          const setClause = fields.map(f => `${f} = ?`).join(', ')
          const values = fields.map(f => updates[f])

          this.db.prepare(`
            UPDATE network_config
            SET ${setClause}, updated_at = strftime('%s', 'now')
            WHERE id = ?
          `).run(...values, config.id)

          this.logger.info('网络配置默认值修复完成:', updates)
        }
      }
    }
    catch (error) {
      this.logger.error('迁移网络配置失败:', error)
    }
  }

  /**
   * 迁移音乐配置：添加 url_response_path 列
   */
  private migrateMusicConfigUrlResponsePath(): void {
    try {
      const tableInfo = this.db.prepare('PRAGMA table_info(music_config)').all() as Array<{
        cid: number
        name: string
        type: string
        notnull: number
        dflt_value: string | null
        pk: number
      }>

      const hasUrlResponsePath = tableInfo.some(col => col.name === 'url_response_path')

      if (!hasUrlResponsePath && tableInfo.length > 0) {
        this.logger.info('添加 music_config.url_response_path 列...')
        this.db.exec(`ALTER TABLE music_config ADD COLUMN url_response_path TEXT DEFAULT 'data.url'`)
        this.logger.info('music_config.url_response_path 列添加完成')
      }
    }
    catch (error) {
      this.logger.error('迁移 music_config url_response_path 失败:', error)
    }
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
      // 如果没有配置记录，返回空配置（应该不会发生，因为 ConfigManager 会创建）
      return {
        client_id: '',
        device_id: '',
        ota_version_url: '',
        activation_version: '',
        authorization_url: '',
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

    // 返回数据库中的实际值（包括默认值）
    return {
      client_id: config.client_id || '',
      device_id: config.device_id || '',
      ota_version_url: config.ota_version_url || '',
      activation_version: config.activation_version || '',
      authorization_url: config.authorization_url || '',
      websocket_url: config.websocket_url || null,
      websocket_access_token: config.websocket_access_token || null,
      mqtt_endpoint: config.mqtt_endpoint || null,
      mqtt_client_id: config.mqtt_client_id || null,
      mqtt_username: config.mqtt_username || null,
      mqtt_password: config.mqtt_password || null,
      mqtt_publish_topic: config.mqtt_publish_topic || null,
      mqtt_subscribe_topic: config.mqtt_subscribe_topic || null,
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
        input_sample_rate, output_sample_rate, channels, frame_duration
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 'auto', 16000, 24000, 1, 20)

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
    inputSampleRate: ValidSampleRate
    outputSampleRate: ValidSampleRate
    channels: number
    frameDuration: number
  } {
    const VALID_RATES: readonly number[] = [8000, 12000, 16000, 24000, 48000]
    const isValidRate = (rate: number): rate is ValidSampleRate => VALID_RATES.includes(rate)

    const config = this.getOrCreateAudioConfig()
    const inputRate = config.input_sample_rate
    const outputRate = config.output_sample_rate

    return {
      inputDeviceName: config.input_device_name || undefined,
      outputDeviceName: config.output_device_name || undefined,
      enableNoiseReduction: Boolean(config.enable_noise_reduction),
      enableEchoCancellation: Boolean(config.enable_echo_cancellation),
      conversationMode: (config.conversation_mode as 'realtime' | 'auto') || 'auto',
      inputSampleRate: isValidRate(inputRate) ? inputRate : 16000,
      outputSampleRate: isValidRate(outputRate) ? outputRate : 24000,
      channels: config.channels || 1,
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
        enabled, language, keyword_zh, keyword_en,
        threshold, score, cooldown_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'zh', '你好小智', '', 0.2, 1.8, 1500)

    return this.db.prepare('SELECT * FROM wake_word_config WHERE id = ?').get(result.lastInsertRowid) as DbWakeWordConfig
  }

  getWakeWordConfig(): DbWakeWordConfig | undefined {
    return this.db.prepare('SELECT * FROM wake_word_config ORDER BY id DESC LIMIT 1').get() as DbWakeWordConfig | undefined
  }

  updateWakeWordConfig(updates: {
    enabled?: boolean
    language?: string
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

    // 根据当前语言返回对应的唤醒词
    const keyword = language === 'zh'
      ? (config.keyword_zh || '你好小智')
      : (config.keyword_en || '')

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

  getOrCreateMusicConfig(): DbMusicConfig {
    const existing = this.db.prepare('SELECT * FROM music_config ORDER BY id DESC LIMIT 1').get()

    if (existing) {
      return existing as DbMusicConfig
    }

    const result = this.db.prepare(`
      INSERT INTO music_config (search_url, url_api, url_api_key, url_response_path, lyrics_url, default_source, default_quality)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'http://search.kuwo.cn/r.s',
      'https://lxmusicapi.onrender.com',
      'share-v3',
      'data.url',
      'http://m.kuwo.cn/newh5/singles/songinfoandlrc',
      'kw',
      '320k',
    )

    return this.db.prepare('SELECT * FROM music_config WHERE id = ?').get(result.lastInsertRowid) as DbMusicConfig
  }

  getMusicConfig(): DbMusicConfig | undefined {
    return this.db.prepare('SELECT * FROM music_config ORDER BY id DESC LIMIT 1').get() as DbMusicConfig | undefined
  }

  updateMusicConfig(updates: Partial<Omit<DbMusicConfig, 'id' | 'created_at' | 'updated_at'>>): void {
    let config = this.getMusicConfig()
    if (!config) {
      config = this.getOrCreateMusicConfig()
    }

    const fields = Object.keys(updates).filter(k => updates[k as keyof typeof updates] !== undefined)
    if (fields.length === 0) {
      return
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => updates[f as keyof typeof updates])

    this.db.prepare(`
      UPDATE music_config
      SET ${setClause}, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(...values, config.id)
  }

  /**
   * 读取窗口位置
   */
  getWindowPosition(mode: string): { x: number, y: number } | undefined {
    const row = this.db.prepare('SELECT x, y FROM window_positions WHERE mode = ?').get(mode) as { x: number, y: number } | undefined
    return row
  }

  /**
   * 写入/更新窗口位置（UPSERT）
   */
  setWindowPosition(mode: string, x: number, y: number): void {
    this.db.prepare(`
      INSERT INTO window_positions (mode, x, y, updated_at)
      VALUES (?, ?, ?, strftime('%s', 'now'))
      ON CONFLICT(mode) DO UPDATE SET
        x = excluded.x,
        y = excluded.y,
        updated_at = excluded.updated_at
    `).run(mode, Math.round(x), Math.round(y))
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

  /**
   * 插入默认快捷键
   */
  insertDefaultShortcuts(): void {
    const defaults = [
      { action: 'settings.toggle', name: '打开设置', category: 'window', accelerator: 'CommandOrControl+,' },
      { action: 'window.main', name: '标准窗口', category: 'window', accelerator: 'CommandOrControl+1' },
      { action: 'window.mini', name: '迷你悬浮球', category: 'window', accelerator: 'CommandOrControl+2' },
      { action: 'window.chat', name: '聊天视图', category: 'window', accelerator: 'CommandOrControl+3' },
      { action: 'window.live2d', name: 'Live2D 桌宠', category: 'window', accelerator: 'CommandOrControl+4' },
      { action: 'conversation.manual', name: '手动监听', category: 'conversation', accelerator: 'CommandOrControl+M' },
      { action: 'conversation.auto', name: '自动对话', category: 'conversation', accelerator: 'CommandOrControl+Shift+M' },
      { action: 'conversation.interrupt', name: '打断对话', category: 'conversation', accelerator: 'CommandOrControl+.' },
      { action: 'app.activate', name: '唤起应用', category: 'quick', accelerator: 'CommandOrControl+Shift+X' },
    ]

    const stmt = this.db.prepare(`
      INSERT INTO shortcuts (action, name, category, accelerator, enabled, is_global, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1, ?, ?)
    `)

    const now = Math.floor(Date.now() / 1000)
    for (const shortcut of defaults) {
      stmt.run(shortcut.action, shortcut.name, shortcut.category, shortcut.accelerator, now, now)
    }

    this.logger.info('已插入默认快捷键')
  }

  /**
   * 获取所有快捷键
   */
  getShortcuts(): DbShortcutConfig[] {
    return this.db.prepare('SELECT * FROM shortcuts').all() as DbShortcutConfig[]
  }

  /**
   * 获取单个快捷键
   */
  getShortcut(action: string): DbShortcutConfig | undefined {
    return this.db.prepare('SELECT * FROM shortcuts WHERE action = ?').get(action) as DbShortcutConfig | undefined
  }

  /**
   * 更新快捷键
   */
  updateShortcut(action: string, accelerator: string | null): void {
    const now = Math.floor(Date.now() / 1000)
    this.db.prepare('UPDATE shortcuts SET accelerator = ?, updated_at = ? WHERE action = ?')
      .run(accelerator, now, action)
  }

  /**
   * 删除所有快捷键
   */
  deleteAllShortcuts(): void {
    this.db.prepare('DELETE FROM shortcuts').run()
  }

  /**
   * 检查快捷键表是否为空
   */
  isShortcutsEmpty(): boolean {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM shortcuts').get() as { count: number }
    return count.count === 0
  }

  close(): void {
    this.db.close()
  }
}
