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

    console.log('[Database] 数据库表检查完成')
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

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close()
  }
}
