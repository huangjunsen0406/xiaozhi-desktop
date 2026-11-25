import type { AudioSettings, SourceType } from '@shared/types'
import type { Buffer } from 'node:buffer'
import type {
  DbAudioSettings,
  DbAudioSettingsPatch,
  DbCameraConfig,
  DbCameraConfigPatch,
  DbChatMessage,
  DbChatSession,
  DbDeviceInfo,
  DbMusicConfig,
  DbNetworkConfig,
  DbShortcutConfig,
  DbWakeWordConfig,
  DbWakeWordConfigPatch,
} from '../types/database'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { normalizeMcpHostCapabilities } from '../../shared/mcpCapabilities'
import { isAudioChannels, isAudioFrameDuration, isAudioSampleRate } from '../audio/audioSettingsValidation'
import { getLogger } from '../utils/logger'
import { getDatabasePath } from '../utils/paths'
import { ChatRepository } from './chatRepository'
import {
  CONFIG_VERSION,
  DEFAULT_SHORTCUTS,
  initializeDatabaseTables,
  runDatabaseMigrations,
} from './databaseSchema'

export { CONFIG_VERSION }

let _database: DatabaseManager | null = null

export function initializeDatabase(): DatabaseManager {
  if (_database)
    return _database
  _database = new DatabaseManager()
  return _database
}

export function getDatabase(): DatabaseManager {
  if (!_database) {
    throw new Error('Database not initialized. Call initializeDatabase() during app bootstrap before getDatabase().')
  }
  return _database
}

export function resetDatabase(): void {
  if (_database) {
    try {
      _database.close()
    }
    catch {
      // ignore close errors during test reset
    }
  }
  _database = null
}

export class DatabaseManager {
  private db: Database.Database
  private chatRepo: ChatRepository
  private logger = getLogger('Database')

  /** Created by initializeDatabase(); use getDatabase() in business code. */
  constructor() {
    const dbPath = getDatabasePath()
    const dbDir = dirname(dbPath)
    if (!existsSync(dbDir))
      mkdirSync(dbDir, { recursive: true })

    this.logger.info(`数据库路径: ${dbPath}`)
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.chatRepo = new ChatRepository(this.db)

    initializeDatabaseTables(this.db)
    runDatabaseMigrations(
      this.db,
      this.getConfigVersion(),
      version => this.setSchemaMeta('config_version', String(version)),
      this.logger,
    )
    this.logger.info('数据库表初始化完成')
  }

  getConfigVersion(): number {
    try {
      const row = this.db.prepare(`SELECT value FROM schema_meta WHERE key = 'config_version'`).get() as { value: string } | undefined
      if (!row)
        return 0
      const n = Number.parseInt(row.value, 10)
      return Number.isFinite(n) ? n : 0
    }
    catch {
      return 0
    }
  }

  getSchemaMeta(key: string): string | null {
    try {
      const row = this.db.prepare('SELECT value FROM schema_meta WHERE key = ?').get(key) as { value: string } | undefined
      return row?.value ?? null
    }
    catch {
      return null
    }
  }

  setSchemaMeta(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO schema_meta (key, value, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = strftime('%s', 'now')
    `).run(key, value)
  }

  getMcpDisabledTools(): string[] {
    const raw = this.getSchemaMeta('mcp_tools_disabled')
    if (!raw)
      return []
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed))
        return []
      return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
    }
    catch {
      return []
    }
  }

  setMcpDisabledTools(names: string[]): void {
    const unique = Array.from(new Set(names.filter(n => typeof n === 'string' && n.length > 0)))
    this.setSchemaMeta('mcp_tools_disabled', JSON.stringify(unique))
  }

  getMcpPluginsConfig(): {
    enabled: boolean
    disabledIds: string[]
    enabledIds: string[]
    allowHostGet: string[]
    enforcePrefix: boolean
  } {
    const parseJsonArray = (key: string, fallback: string[]): string[] => {
      const raw = this.getSchemaMeta(key)
      if (!raw)
        return fallback
      try {
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed))
          return fallback
        return parsed.filter((x): x is string => typeof x === 'string')
      }
      catch {
        return fallback
      }
    }

    const enabledRaw = this.getSchemaMeta('mcp_plugins_enabled')
    const enabled = enabledRaw === null ? true : enabledRaw !== '0' && enabledRaw !== 'false'
    const enforceRaw = this.getSchemaMeta('mcp_plugins_enforce_prefix')
    const enforcePrefix = enforceRaw === '1' || enforceRaw === 'true'

    const savedCapabilities = parseJsonArray('mcp_plugins_allow_host_get', ['logger', 'config_readonly'])
    const allowHostGet = normalizeMcpHostCapabilities(savedCapabilities, true)
    if (JSON.stringify(savedCapabilities) !== JSON.stringify(allowHostGet))
      this.setSchemaMeta('mcp_plugins_allow_host_get', JSON.stringify(allowHostGet))

    return {
      enabled,
      disabledIds: parseJsonArray('mcp_plugins_disabled_ids', []),
      enabledIds: parseJsonArray('mcp_plugins_enabled_ids', []),
      allowHostGet,
      enforcePrefix,
    }
  }

  setMcpPluginsConfig(partial: {
    enabled?: boolean
    disabledIds?: string[]
    enabledIds?: string[]
    allowHostGet?: string[]
    enforcePrefix?: boolean
  }): void {
    if (partial.enabled !== undefined)
      this.setSchemaMeta('mcp_plugins_enabled', partial.enabled ? '1' : '0')
    if (partial.disabledIds !== undefined)
      this.setSchemaMeta('mcp_plugins_disabled_ids', JSON.stringify(partial.disabledIds))
    if (partial.enabledIds !== undefined)
      this.setSchemaMeta('mcp_plugins_enabled_ids', JSON.stringify(partial.enabledIds))
    if (partial.allowHostGet !== undefined)
      this.setSchemaMeta('mcp_plugins_allow_host_get', JSON.stringify(partial.allowHostGet))
    if (partial.enforcePrefix !== undefined)
      this.setSchemaMeta('mcp_plugins_enforce_prefix', partial.enforcePrefix ? '1' : '0')
  }

  private patchSingletonRow(
    table: 'network_config' | 'audio_config' | 'wake_word_config' | 'camera_config' | 'music_config',
    rowId: number,
    updates: Record<string, unknown>,
  ): void {
    const entries: Array<[string, string | number | null]> = []
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined)
        continue
      entries.push([key, typeof value === 'boolean' ? (value ? 1 : 0) : (value as string | number | null)])
    }
    if (entries.length === 0)
      return

    const setClause = entries.map(([k]) => `${k} = ?`).join(', ')
    const values = entries.map(([, v]) => v)
    this.db.prepare(`
      UPDATE ${table}
      SET ${setClause}, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(...values, rowId)
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
      this.db.prepare(`UPDATE device_info SET updated_at = strftime('%s', 'now') WHERE serial_number = ?`).run(data.serial_number)
      return existing as DbDeviceInfo
    }

    const result = this.db.prepare(`
      INSERT INTO device_info (mac_address, serial_number, hmac_key, machine_id, hostname, system)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.mac_address, data.serial_number, data.hmac_key, data.machine_id, data.hostname || '', data.system || '')

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
    const result = this.db.prepare('SELECT activation_status FROM device_info WHERE serial_number = ?')
      .get(serialNumber) as { activation_status: number } | undefined
    return result ? result.activation_status === 1 : false
  }

  getOrCreateNetworkConfig(data: { client_id: string, device_id?: string }): DbNetworkConfig {
    const existing = this.db.prepare('SELECT * FROM network_config WHERE client_id = ?').get(data.client_id)
    if (existing)
      return existing as DbNetworkConfig

    const result = this.db.prepare('INSERT INTO network_config (client_id, device_id) VALUES (?, ?)')
      .run(data.client_id, data.device_id || null)
    return this.db.prepare('SELECT * FROM network_config WHERE id = ?').get(result.lastInsertRowid) as DbNetworkConfig
  }

  getNetworkConfig(): DbNetworkConfig | undefined {
    return this.db.prepare('SELECT * FROM network_config ORDER BY id DESC LIMIT 1').get() as DbNetworkConfig | undefined
  }

  private ensureNetworkConfigRow(): DbNetworkConfig {
    return this.getNetworkConfig() ?? this.getOrCreateNetworkConfig({ client_id: 'default' })
  }

  updateNetworkConfig(field: string, value: string | null): void {
    this.patchSingletonRow('network_config', this.ensureNetworkConfigRow().id, { [field]: value })
  }

  updateNetworkConfigBatch(updates: Record<string, string | null>): void {
    this.patchSingletonRow('network_config', this.ensureNetworkConfigRow().id, updates)
  }

  getAllConfig(): Record<string, string | null> {
    const config = this.getNetworkConfig()
    return {
      client_id: config?.client_id || '',
      device_id: config?.device_id || '',
      ota_version_url: config?.ota_version_url || '',
      activation_version: config?.activation_version || '',
      authorization_url: config?.authorization_url || '',
      websocket_url: config?.websocket_url || null,
      websocket_access_token: config?.websocket_access_token || null,
      mqtt_endpoint: config?.mqtt_endpoint || null,
      mqtt_client_id: config?.mqtt_client_id || null,
      mqtt_username: config?.mqtt_username || null,
      mqtt_password: config?.mqtt_password || null,
      mqtt_publish_topic: config?.mqtt_publish_topic || null,
      mqtt_subscribe_topic: config?.mqtt_subscribe_topic || null,
    }
  }

  getOrCreateAudioSettings(): DbAudioSettings {
    const existing = this.db.prepare('SELECT * FROM audio_config ORDER BY id DESC LIMIT 1').get()
    if (existing)
      return existing as DbAudioSettings

    const result = this.db.prepare(`
      INSERT INTO audio_config (
        enable_noise_reduction, enable_echo_cancellation, aec_mode, conversation_mode,
        input_sample_rate, output_sample_rate, channels, frame_duration
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 'app', 'auto', 16000, 24000, 1, 20)

    return this.db.prepare('SELECT * FROM audio_config WHERE id = ?').get(result.lastInsertRowid) as DbAudioSettings
  }

  updateAudioSettings(updates: DbAudioSettingsPatch): void {
    this.patchSingletonRow('audio_config', this.getOrCreateAudioSettings().id, updates)
  }

  getFormattedAudioSettings(): AudioSettings {
    const config = this.getOrCreateAudioSettings()
    const rawMode = (config.aec_mode || '').trim()
    const aecMode = rawMode === 'off' || rawMode === 'app' || rawMode === 'system'
      ? rawMode
      : config.enable_echo_cancellation ? 'app' : 'off'

    return {
      inputDeviceName: config.input_device_name || undefined,
      outputDeviceName: config.output_device_name || undefined,
      enableNoiseReduction: Boolean(config.enable_noise_reduction),
      enableEchoCancellation: aecMode !== 'off',
      aecMode,
      conversationMode: config.conversation_mode === 'realtime' ? 'realtime' : 'auto',
      inputSampleRate: isAudioSampleRate(config.input_sample_rate) ? config.input_sample_rate : 16000,
      outputSampleRate: isAudioSampleRate(config.output_sample_rate) ? config.output_sample_rate : 24000,
      channels: isAudioChannels(config.channels) ? config.channels : 1,
      frameDuration: isAudioFrameDuration(config.frame_duration) ? config.frame_duration : 20,
    }
  }

  getOrCreateWakeWordConfig(): DbWakeWordConfig {
    const existing = this.db.prepare('SELECT * FROM wake_word_config ORDER BY id DESC LIMIT 1').get()
    if (existing)
      return existing as DbWakeWordConfig

    const result = this.db.prepare(`
      INSERT INTO wake_word_config (
        enabled, language, keyword_zh, keyword_en,
        threshold, score, cooldown_ms, greet
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'zh', '你好小智', '', 0.2, 1.8, 1500, 0)

    return this.db.prepare('SELECT * FROM wake_word_config WHERE id = ?').get(result.lastInsertRowid) as DbWakeWordConfig
  }

  updateWakeWordConfig(updates: DbWakeWordConfigPatch): void {
    this.patchSingletonRow('wake_word_config', this.getOrCreateWakeWordConfig().id, updates)
  }

  getFormattedWakeWordConfig(): {
    enabled: boolean
    language: string
    keyword: string
    threshold: number
    score: number
    cooldownMs: number
    greet: boolean
  } {
    const config = this.getOrCreateWakeWordConfig()
    const language = config.language || 'zh'
    return {
      enabled: Boolean(config.enabled),
      language,
      keyword: language === 'zh' ? (config.keyword_zh || '你好小智') : (config.keyword_en || ''),
      threshold: config.threshold ?? 0.2,
      score: config.score ?? 1.8,
      cooldownMs: config.cooldown_ms ?? 1500,
      greet: Boolean(config.greet),
    }
  }

  getOrCreateCameraConfig(): DbCameraConfig {
    const existing = this.db.prepare('SELECT * FROM camera_config ORDER BY id DESC LIMIT 1').get()
    if (existing)
      return existing as DbCameraConfig

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

  updateCameraConfig(updates: DbCameraConfigPatch): void {
    this.patchSingletonRow('camera_config', this.getOrCreateCameraConfig().id, updates)
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
    if (existing)
      return existing as DbMusicConfig

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

  updateMusicConfig(updates: Partial<Omit<DbMusicConfig, 'id' | 'created_at' | 'updated_at'>>): void {
    this.patchSingletonRow('music_config', this.getOrCreateMusicConfig().id, updates)
  }

  getWindowPosition(mode: string): { x: number, y: number } | undefined {
    return this.db.prepare('SELECT x, y FROM window_positions WHERE mode = ?').get(mode) as { x: number, y: number } | undefined
  }

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

  createChatSession(data: { session_id: string, title?: string, started_at?: number }): DbChatSession {
    return this.chatRepo.createSession(data)
  }

  getChatSessions(limit = 50, offset = 0): DbChatSession[] {
    return this.chatRepo.getSessions(limit, offset)
  }

  getChatSession(sessionId: string): DbChatSession | undefined {
    return this.chatRepo.getSession(sessionId)
  }

  updateChatSessionTitle(sessionId: string, title: string): void {
    this.chatRepo.updateSessionTitle(sessionId, title)
  }

  updateChatSessionStats(sessionId: string): void {
    this.chatRepo.updateSessionStats(sessionId)
  }

  deleteChatSession(sessionId: string): void {
    this.chatRepo.deleteSession(sessionId)
  }

  addChatMessage(data: {
    session_id: string
    role: 'user' | 'assistant'
    content: string
    emotion?: string
    source_type: SourceType
    image_data?: Buffer
    timestamp?: number
  }): DbChatMessage {
    return this.chatRepo.addMessage(data)
  }

  getChatMessages(sessionId: string, limit?: number, offset = 0): DbChatMessage[] {
    return this.chatRepo.getMessages(sessionId, limit, offset)
  }

  getChatMessageCount(sessionId: string): number {
    return this.chatRepo.getMessageCount(sessionId)
  }

  deleteChatMessage(messageId: number): void {
    this.chatRepo.deleteMessage(messageId)
  }

  clearChatMessages(sessionId: string): void {
    this.chatRepo.clearMessages(sessionId)
  }

  insertDefaultShortcuts(): void {
    const stmt = this.db.prepare(`
      INSERT INTO shortcuts (action, name, category, accelerator, enabled, is_global, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1, ?, ?)
    `)
    const now = Math.floor(Date.now() / 1000)
    for (const shortcut of DEFAULT_SHORTCUTS)
      stmt.run(shortcut.action, shortcut.name, shortcut.category, shortcut.accelerator, now, now)
    this.logger.info('已插入默认快捷键')
  }

  getShortcuts(): DbShortcutConfig[] {
    return this.db.prepare('SELECT * FROM shortcuts').all() as DbShortcutConfig[]
  }

  getShortcut(action: string): DbShortcutConfig | undefined {
    return this.db.prepare('SELECT * FROM shortcuts WHERE action = ?').get(action) as DbShortcutConfig | undefined
  }

  updateShortcut(action: string, accelerator: string | null): void {
    const now = Math.floor(Date.now() / 1000)
    this.db.prepare('UPDATE shortcuts SET accelerator = ?, updated_at = ? WHERE action = ?')
      .run(accelerator, now, action)
  }

  deleteAllShortcuts(): void {
    this.db.prepare('DELETE FROM shortcuts').run()
  }

  isShortcutsEmpty(): boolean {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM shortcuts').get() as { count: number }
    return count.count === 0
  }

  close(): void {
    this.db.close()
  }
}
