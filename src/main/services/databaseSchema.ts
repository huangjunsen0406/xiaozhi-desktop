import type Database from 'better-sqlite3'

export const CONFIG_VERSION = 2

export const DEFAULT_SHORTCUTS = [
  { action: 'settings.toggle', name: '打开设置', category: 'window', accelerator: 'CommandOrControl+,' },
  { action: 'window.main', name: '标准窗口', category: 'window', accelerator: 'CommandOrControl+1' },
  { action: 'window.mini', name: '迷你悬浮球', category: 'window', accelerator: 'CommandOrControl+2' },
  { action: 'window.chat', name: '聊天视图', category: 'window', accelerator: 'CommandOrControl+3' },
  { action: 'window.live2d', name: 'Live2D 桌宠', category: 'window', accelerator: 'CommandOrControl+4' },
  { action: 'conversation.manual', name: '手动监听', category: 'conversation', accelerator: 'CommandOrControl+M' },
  { action: 'conversation.auto', name: '自动对话', category: 'conversation', accelerator: 'CommandOrControl+Shift+M' },
  { action: 'conversation.interrupt', name: '打断对话', category: 'conversation', accelerator: 'CommandOrControl+.' },
  { action: 'app.activate', name: '唤起应用', category: 'quick', accelerator: 'CommandOrControl+Shift+X' },
] as const

interface MigrationLogger {
  info: (message: string, data?: unknown) => void
}

export function initializeDatabaseTables(db: Database.Database): void {
  db.exec(`
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
    );

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
    );

    CREATE TABLE IF NOT EXISTS audio_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input_device_name TEXT,
      output_device_name TEXT,
      enable_noise_reduction INTEGER DEFAULT 1,
      enable_echo_cancellation INTEGER DEFAULT 1,
      aec_mode TEXT DEFAULT 'app',
      conversation_mode TEXT DEFAULT 'auto',
      input_sample_rate INTEGER DEFAULT 16000,
      output_sample_rate INTEGER DEFAULT 24000,
      channels INTEGER DEFAULT 1,
      max_input_channels INTEGER DEFAULT 2,
      max_output_channels INTEGER DEFAULT 2,
      frame_duration INTEGER DEFAULT 20,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS wake_word_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enabled INTEGER DEFAULT 1,
      language TEXT DEFAULT 'zh',
      keyword_zh TEXT DEFAULT '你好小智',
      keyword_en TEXT DEFAULT NULL,
      threshold REAL DEFAULT 0.2,
      score REAL DEFAULT 1.8,
      cooldown_ms INTEGER DEFAULT 1500,
      greet INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

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
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      title TEXT,
      message_count INTEGER DEFAULT 0,
      started_at INTEGER NOT NULL,
      last_message_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

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
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_message_at ON chat_sessions(last_message_at);

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
    );

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
    );

    CREATE TABLE IF NOT EXISTS window_positions (
      mode TEXT PRIMARY KEY,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `)
}

function getColumnNames(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map(r => r.name))
}

function migrateWakeWordConfig(db: Database.Database, logger: MigrationLogger): void {
  const cols = getColumnNames(db, 'wake_word_config')
  const hasKeywordsList = cols.has('keywords_list')
  const hasKeywordZh = cols.has('keyword_zh')
  const hasKeywordEn = cols.has('keyword_en')

  if (hasKeywordZh && hasKeywordEn && !hasKeywordsList)
    return

  if (hasKeywordsList) {
    logger.info('检测到旧的 keywords_list 字段，开始迁移...')
    const config = db.prepare('SELECT * FROM wake_word_config ORDER BY id DESC LIMIT 1').get() as {
      enabled: number
      language: string
      keywords_list: string
      threshold: number
      score: number
      cooldown_ms: number
    } | undefined

    db.exec(`
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

    if (config) {
      db.prepare(`
        INSERT INTO wake_word_config_new (enabled, language, keyword_zh, keyword_en, threshold, score, cooldown_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        config.enabled,
        config.language,
        config.language === 'zh' ? config.keywords_list : '你好小智',
        config.language === 'en' ? config.keywords_list : null,
        config.threshold,
        config.score,
        config.cooldown_ms,
      )
    }

    db.exec('DROP TABLE wake_word_config')
    db.exec('ALTER TABLE wake_word_config_new RENAME TO wake_word_config')
    logger.info('唤醒词配置迁移完成')
    return
  }

  if (!hasKeywordZh)
    db.exec(`ALTER TABLE wake_word_config ADD COLUMN keyword_zh TEXT DEFAULT '你好小智'`)
  if (!hasKeywordEn)
    db.exec('ALTER TABLE wake_word_config ADD COLUMN keyword_en TEXT DEFAULT NULL')
}

function migrateWakeWordGreet(db: Database.Database, logger: MigrationLogger): void {
  if (!getColumnNames(db, 'wake_word_config').has('greet')) {
    db.exec('ALTER TABLE wake_word_config ADD COLUMN greet INTEGER DEFAULT 0')
    logger.info('wake_word_config 已添加 greet 列')
  }
}

function migrateNetworkConfigDefaults(db: Database.Database, logger: MigrationLogger): void {
  const row = db.prepare('SELECT id, ota_version_url, authorization_url FROM network_config ORDER BY id DESC LIMIT 1').get() as {
    id: number
    ota_version_url: string | null
    authorization_url: string | null
  } | undefined
  if (!row)
    return

  if (!row.ota_version_url) {
    db.prepare(`UPDATE network_config SET ota_version_url = ?, updated_at = strftime('%s', 'now') WHERE id = ?`)
      .run('https://api.tenclass.net/xiaozhi/ota/', row.id)
    logger.info('网络配置默认 ota_version_url 修复完成')
  }
  if (!row.authorization_url) {
    db.prepare(`UPDATE network_config SET authorization_url = ?, updated_at = strftime('%s', 'now') WHERE id = ?`)
      .run('https://xiaozhi.me/', row.id)
    logger.info('网络配置默认 authorization_url 修复完成')
  }
}

function migrateMusicConfigUrlResponsePath(db: Database.Database, logger: MigrationLogger): void {
  const cols = getColumnNames(db, 'music_config')
  if (cols.size > 0 && !cols.has('url_response_path')) {
    db.exec(`ALTER TABLE music_config ADD COLUMN url_response_path TEXT DEFAULT 'data.url'`)
    logger.info('music_config.url_response_path 列添加完成')
  }
}

function migrateAudioAecMode(db: Database.Database, logger: MigrationLogger): void {
  if (!getColumnNames(db, 'audio_config').has('aec_mode')) {
    db.exec(`ALTER TABLE audio_config ADD COLUMN aec_mode TEXT DEFAULT 'app'`)
    logger.info('audio_config 已添加 aec_mode 列')
  }

  db.prepare(`
    UPDATE audio_config
    SET aec_mode = CASE
      WHEN enable_echo_cancellation = 0 THEN 'off'
      ELSE 'app'
    END
    WHERE aec_mode IS NULL OR TRIM(aec_mode) = ''
  `).run()
}

export function runDatabaseMigrations(
  db: Database.Database,
  currentVersion: number,
  stampVersion: (version: number) => void,
  logger: MigrationLogger,
): void {
  let current = currentVersion
  logger.info(`CONFIG_VERSION: disk=${current}, target=${CONFIG_VERSION}`)

  if (current >= CONFIG_VERSION)
    return

  if (current < 1) {
    logger.info('执行配置迁移 v0 → v1...')
    db.transaction(() => {
      migrateWakeWordConfig(db, logger)
      migrateWakeWordGreet(db, logger)
      migrateNetworkConfigDefaults(db, logger)
      migrateMusicConfigUrlResponsePath(db, logger)
      stampVersion(1)
    })()
    current = 1
    logger.info('配置迁移 v0 → v1 完成')
  }

  if (current < 2) {
    logger.info('执行配置迁移 v1 → v2 (aec_mode)...')
    db.transaction(() => {
      migrateAudioAecMode(db, logger)
      stampVersion(2)
    })()
    current = 2
    logger.info('配置迁移 v1 → v2 完成')
  }
}
