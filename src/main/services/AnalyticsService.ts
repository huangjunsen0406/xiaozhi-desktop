/**
 * OpenPanel 产品分析（主进程）
 *
 * 事件口径：一次「启动 → 退出」算一次使用；不埋激活/对话内容。
 * - app_opened / app_closed / display_mode_changed / session_connected
 * - install_id 持久化后作为 profileId，用于用户数 / DAU / 版本分布
 */

import type { DisplayMode } from '../windows/windowManager'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { OpenPanel } from '@openpanel/sdk'
import { app } from 'electron'
import { getLogger } from '../utils/logger'
import { getDatabase } from './database'

const logger = getLogger('Analytics')

/** 写入保护串 + 常量；生产构建由 bytecodePlugin 处理 */
const OP_CLIENT_ID = 'a869e57d-7399-47bc-8e4f-15789fa0944c'
const OP_CLIENT_SECRET = 'sec_8bf9867d7e355eba22d1'
const OP_API_URL = 'https://openpanel.junsen.online/api'

const META_ENABLED = 'analytics_enabled'
const META_INSTALL_ID = 'analytics_install_id'

let client: OpenPanel | null = null
let initialized = false
let enabled = true
let installId = ''
let openedAtMs = 0
let lastDisplayMode: DisplayMode | '' = ''
/** 本进程是否已报过 session_connected，避免重连刷屏 */
let sessionConnectedReported = false

function readEnabled(): boolean {
  try {
    const raw = getDatabase().getSchemaMeta(META_ENABLED)
    // 默认开启；显式 '0' / 'false' 关闭
    if (raw === null)
      return true
    return raw !== '0' && raw !== 'false'
  }
  catch {
    return true
  }
}

function writeEnabled(value: boolean): void {
  try {
    getDatabase().setSchemaMeta(META_ENABLED, value ? '1' : '0')
  }
  catch (error) {
    logger.warn('写入分析开关失败', error)
  }
}

function ensureInstallId(): string {
  try {
    const db = getDatabase()
    const existing = db.getSchemaMeta(META_INSTALL_ID)?.trim()
    if (existing) {
      return existing
    }
    const id = randomUUID()
    db.setSchemaMeta(META_INSTALL_ID, id)
    return id
  }
  catch (error) {
    logger.warn('读写 install_id 失败，使用临时 id', error)
    return randomUUID()
  }
}

function safeTrack(name: string, properties?: Record<string, unknown>): void {
  if (!initialized || !enabled || !client)
    return
  void client.track(name, properties).catch((error) => {
    logger.debug(`track ${name} 失败`, error)
  })
}

/**
 * DB 初始化后调用。开发态也上报（便于 Realtime 验收）；可用开关关闭。
 */
export function initAnalyticsService(): void {
  if (initialized)
    return
  initialized = true

  enabled = readEnabled()
  installId = ensureInstallId()
  openedAtMs = Date.now()

  try {
    client = new OpenPanel({
      clientId: OP_CLIENT_ID,
      clientSecret: OP_CLIENT_SECRET,
      apiUrl: OP_API_URL,
      sdk: 'xiaozhi-desktop',
      sdkVersion: app.getVersion(),
      disabled: !enabled,
    })

    client.setGlobalProperties({
      app_version: app.getVersion(),
      os_platform: process.platform,
      os_arch: process.arch,
      is_packaged: app.isPackaged,
    })

    // 固定匿名用户，用于 Unique / 版本分布（identify 可能同步返回 undefined）
    const identifyResult = client.identify({
      profileId: installId,
      properties: {
        app_version: app.getVersion(),
        os_platform: process.platform,
        os_arch: process.arch,
      },
    })
    void identifyResult?.catch((error) => {
      logger.debug('identify 失败', error)
    })

    logger.info('Analytics 已初始化', {
      enabled,
      installIdPrefix: `${installId.slice(0, 8)}…`,
    })
  }
  catch (error) {
    logger.error('Analytics 初始化失败', error)
    client = null
  }
}

/** 启动完成、显示模式已恢复后打 app_opened */
export function trackAppOpened(displayMode: DisplayMode): void {
  lastDisplayMode = displayMode
  if (!openedAtMs)
    openedAtMs = Date.now()
  safeTrack('app_opened', {
    display_mode: displayMode,
  })
}

/** 显示模式切换（from → to） */
export function trackDisplayModeChanged(from: DisplayMode, to: DisplayMode): void {
  if (from === to)
    return
  lastDisplayMode = to
  safeTrack('display_mode_changed', { from, to })
}

/** 协议连接成功（每进程最多一次，避免重连刷） */
export function trackSessionConnected(protocol?: string): void {
  if (sessionConnectedReported)
    return
  sessionConnectedReported = true
  safeTrack('session_connected', {
    protocol: protocol || 'unknown',
  })
}

/**
 * 退出前上报使用时长并尽量刷出队列。
 * before-quit 里 await 本函数（有超时）。
 */
export async function trackAppClosedAndFlush(timeoutMs = 1500): Promise<void> {
  if (!initialized || !client)
    return

  const durationSec = openedAtMs > 0
    ? Math.max(0, Math.round((Date.now() - openedAtMs) / 1000))
    : 0

  if (enabled) {
    try {
      await Promise.race([
        client.track('app_closed', {
          duration_sec: durationSec,
          display_mode: lastDisplayMode || undefined,
        }),
        new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
      ])
    }
    catch (error) {
      logger.debug('app_closed 上报失败', error)
    }
  }
}

export function isAnalyticsEnabled(): boolean {
  return enabled
}

export function getAnalyticsInstallId(): string {
  return installId
}

/**
 * 设置页开关。关闭后不再 track；重新开启会 ready() 并放行后续事件。
 */
export function setAnalyticsEnabled(next: boolean): boolean {
  enabled = next
  writeEnabled(next)

  if (!client) {
    return enabled
  }

  if (next) {
    client.options.disabled = false
    client.ready()
    logger.info('Analytics 已开启')
  }
  else {
    client.options.disabled = true
    logger.info('Analytics 已关闭')
  }

  return enabled
}

export function getAnalyticsStatus(): {
  enabled: boolean
  installId: string
} {
  return {
    enabled,
    installId,
  }
}
