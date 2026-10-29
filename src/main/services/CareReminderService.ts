/**
 * 本地关怀提醒调度
 *
 * - 无语音 / 无 Opus / 不 sendText / 不写聊天记录
 * - 可见桌宠使用本地气泡，其余场景使用静默系统通知
 * - 配置落盘 userData/care-reminders.json；设置变更热重启调度
 *
 * 生产间隔（代码常量，UI 不可改）：
 * - water 50min / walk 55min / eyes 45min
 * - sleep：本地 23:00–06:00 至多一次
 * water/walk/eyes 在 00:00–07:00 静默；sleep 可在 23:00–06:00 触发
 */

import type {
  CareReminderConfig,
  CareReminderDemoResult,
  CareReminderTypeId,
} from '@shared/types'
import {
  DEFAULT_CARE_REMINDER_CONFIG,
  DeviceStateValue,
} from '@shared/types'
import { powerMonitor } from 'electron'
import fs from 'fs-extra'
import { getServiceContainer } from '../core/ServiceContainer'
import { getLogger } from '../utils/logger'
import { getCareRemindersConfigFile } from '../utils/paths'
import { canPresentCareReminder, presentCareReminder } from './careReminderNotification'

const logger = getLogger('CareReminderService')

/** 展示时长（ms） */
export const CARE_REMINDER_DISPLAY_MS = 5000

/**
 * 各类型间隔与文案池。
 * 如需本地快速验证，可临时改 INTERVAL_MS（勿提交短间隔到生产默认）。
 */
const REMINDER_DEFS: Record<
  Exclude<CareReminderTypeId, 'sleep'>,
  { intervalMs: number, texts: readonly string[], startOffsetMs: number }
> = {
  // eyes 45min，启动错开 2min
  eyes: {
    intervalMs: 45 * 60 * 1000,
    startOffsetMs: 2 * 60 * 1000,
    texts: ['看看远处，歇歇眼睛', '眨眨眼，放松一下', '眺望远方歇会儿眼'],
  },
  // water 50min，启动错开 5min
  water: {
    intervalMs: 50 * 60 * 1000,
    startOffsetMs: 5 * 60 * 1000,
    texts: ['该喝口水了', '补杯水吧', '记得润润嗓子'],
  },
  // walk 55min（含伸展文案），启动错开 8min
  walk: {
    intervalMs: 55 * 60 * 1000,
    startOffsetMs: 8 * 60 * 1000,
    texts: [
      '起来走一走',
      '活动一下',
      '站起来伸个懒腰',
      '动一动肩膀和脖子',
    ],
  },
}

const SLEEP_TEXTS = ['不早了，该休息了', '收工休息吧', '夜深了，早点睡吧'] as const
/** sleep 轮询间隔（检查是否进入夜间窗口） */
const SLEEP_CHECK_MS = 5 * 60 * 1000
/** sleep 相对启动的错开 */
const SLEEP_START_OFFSET_MS = 3 * 60 * 1000

/** 00:00–07:00 对 water/walk/eyes 静默 */
const QUIET_START_HOUR = 0
const QUIET_END_HOUR = 7
/** sleep 可触发窗口：23:00–06:00 */
const SLEEP_WINDOW_START_HOUR = 23
const SLEEP_WINDOW_END_HOUR = 6

let configCache: CareReminderConfig | null = null
let started = false
let suspended = false
let locked = false
let deliveryController = new AbortController()
let demoController = new AbortController()
const pendingTypes = new Set<CareReminderTypeId>()
const timers = new Map<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>()
/** 演示一轮专用定时器（与正式调度分离） */
const demoTimers: Array<ReturnType<typeof setTimeout>> = []
/** 上次触发时间（cooldown = interval） */
const lastFiredAt = new Map<CareReminderTypeId, number>()
/** 本夜 sleep 是否已触发（按本地日历日键） */
let sleepNightKey: string | null = null

/** 演示顺序：喝水 → 活动 → 用眼 → 睡觉 */
const DEMO_ORDER: readonly CareReminderTypeId[] = ['water', 'walk', 'eyes', 'sleep']
/** 演示每类间隔（ms），与展示时长一致 */
const DEMO_STEP_MS = CARE_REMINDER_DISPLAY_MS

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * 规范化配置，缺省回填默认 true
 */
export function normalizeCareReminderConfig(raw: unknown): CareReminderConfig {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  return {
    enabled: isBoolean(obj.enabled) ? obj.enabled : DEFAULT_CARE_REMINDER_CONFIG.enabled,
    water: isBoolean(obj.water) ? obj.water : DEFAULT_CARE_REMINDER_CONFIG.water,
    walk: isBoolean(obj.walk) ? obj.walk : DEFAULT_CARE_REMINDER_CONFIG.walk,
    eyes: isBoolean(obj.eyes) ? obj.eyes : DEFAULT_CARE_REMINDER_CONFIG.eyes,
    sleep: isBoolean(obj.sleep) ? obj.sleep : DEFAULT_CARE_REMINDER_CONFIG.sleep,
  }
}

/**
 * 读取关怀提醒配置
 */
export async function getCareReminderConfig(): Promise<CareReminderConfig> {
  if (configCache)
    return { ...configCache }

  try {
    const file = getCareRemindersConfigFile()
    if (await fs.pathExists(file)) {
      const raw = await fs.readJson(file)
      configCache = normalizeCareReminderConfig(raw)
      return { ...configCache }
    }
  }
  catch (error) {
    logger.error('读取关怀提醒配置失败', error)
  }

  configCache = { ...DEFAULT_CARE_REMINDER_CONFIG }
  return { ...configCache }
}

/**
 * 保存配置并热重启调度
 */
export async function updateCareReminderConfig(
  updates: Partial<CareReminderConfig>,
): Promise<CareReminderConfig> {
  const current = await getCareReminderConfig()
  const next = normalizeCareReminderConfig({
    ...current,
    ...updates,
  })
  const file = getCareRemindersConfigFile()
  await fs.writeJson(file, next, { spaces: 2 })
  configCache = next
  logger.info('关怀提醒配置已更新', next)
  restartCareReminderScheduler()
  return { ...next }
}

function pickRandom(texts: readonly string[]): string {
  if (texts.length === 0)
    return ''
  const idx = Math.floor(Math.random() * texts.length)
  return texts[idx] ?? texts[0]
}

function localHourMinute(): { hour: number, minute: number, nightKey: string } {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  // 夜键：23:00 起算「当晚」——用 23 点后的日历日，或 0–6 点用前一日
  let y = now.getFullYear()
  let m = now.getMonth()
  let d = now.getDate()
  if (hour < SLEEP_WINDOW_END_HOUR) {
    const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    y = prev.getFullYear()
    m = prev.getMonth()
    d = prev.getDate()
  }
  const nightKey = `${y}-${m + 1}-${d}`
  return { hour, minute, nightKey }
}

/** water/walk/eyes：00:00–07:00 静默 */
function isQuietHoursForPeriodic(): boolean {
  const { hour } = localHourMinute()
  return hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR
}

/** sleep：23:00–06:00 */
function isInSleepWindow(): boolean {
  const { hour } = localHourMinute()
  return hour >= SLEEP_WINDOW_START_HOUR || hour < SLEEP_WINDOW_END_HOUR
}

/**
 * 跳过 speaking / connecting；container 未就绪时保守跳过
 */
function shouldSkipForDeviceState(): boolean {
  try {
    const state = getServiceContainer().getDeviceState()
    return state === DeviceStateValue.SPEAKING || state === DeviceStateValue.CONNECTING
  }
  catch {
    // bootstrap 早期或已 shutdown：不弹
    return true
  }
}

async function sendLocalReminder(text: string, signal: AbortSignal): Promise<boolean> {
  try {
    const shown = await presentCareReminder(
      text,
      CARE_REMINDER_DISPLAY_MS,
      signal,
      () => !suspended && !locked && !shouldSkipForDeviceState(),
    )
    if (shown)
      logger.info(`本地关怀提醒: ${text}`)
    return shown
  }
  catch (error) {
    logger.warn('关怀提醒展示失败', error)
    return false
  }
}

function canFireType(type: CareReminderTypeId, intervalMs: number): boolean {
  const last = lastFiredAt.get(type)
  if (last != null && Date.now() - last < intervalMs)
    return false
  return true
}

async function tryFirePeriodic(type: Exclude<CareReminderTypeId, 'sleep'>): Promise<void> {
  const cfg = configCache ?? DEFAULT_CARE_REMINDER_CONFIG
  if (!cfg.enabled || !cfg[type] || suspended || locked || pendingTypes.has(type))
    return
  if (isQuietHoursForPeriodic() || shouldSkipForDeviceState())
    return

  const def = REMINDER_DEFS[type]
  if (!canFireType(type, def.intervalMs))
    return

  const text = pickRandom(def.texts)
  const signal = deliveryController.signal
  pendingTypes.add(type)
  try {
    if (text && await sendLocalReminder(text, signal) && !signal.aborted)
      lastFiredAt.set(type, Date.now())
  }
  finally {
    if (signal === deliveryController.signal)
      pendingTypes.delete(type)
  }
}

async function tryFireSleep(): Promise<void> {
  const cfg = configCache ?? DEFAULT_CARE_REMINDER_CONFIG
  if (!cfg.enabled || !cfg.sleep || suspended || locked || pendingTypes.has('sleep'))
    return
  if (!isInSleepWindow() || shouldSkipForDeviceState())
    return

  const { nightKey } = localHourMinute()
  if (sleepNightKey === nightKey || !canFireType('sleep', SLEEP_CHECK_MS))
    return

  const signal = deliveryController.signal
  pendingTypes.add('sleep')
  try {
    if (await sendLocalReminder(pickRandom(SLEEP_TEXTS), signal) && !signal.aborted) {
      sleepNightKey = nightKey
      lastFiredAt.set('sleep', Date.now())
    }
  }
  finally {
    if (signal === deliveryController.signal)
      pendingTypes.delete('sleep')
  }
}

function clearAllTimers(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer as ReturnType<typeof setTimeout>)
    clearInterval(timer as ReturnType<typeof setInterval>)
  }
  timers.clear()
}

function clearDemoTimers(): void {
  for (const timer of demoTimers)
    clearTimeout(timer)
  demoTimers.length = 0
  demoController.abort()
  demoController = new AbortController()
}

function textForDemoType(type: CareReminderTypeId): string {
  if (type === 'sleep')
    return pickRandom(SLEEP_TEXTS)
  return pickRandom(REMINDER_DEFS[type].texts)
}

/** Demo previews ignore configuration and time windows, but retain power/device exclusions. */
export function startDemoRound(): CareReminderDemoResult {
  clearDemoTimers()

  if (suspended || locked || shouldSkipForDeviceState()) {
    return { started: false, message: '当前设备忙碌或系统休眠、锁屏，稍后再试' }
  }
  if (!canPresentCareReminder()) {
    logger.warn('关怀提醒演示跳过：当前系统不支持通知且无可见桌宠')
    return { started: false, message: '当前系统不支持通知，切换至可见桌宠后可预览气泡' }
  }

  const signal = demoController.signal
  for (let i = 0; i < DEMO_ORDER.length; i++) {
    const type = DEMO_ORDER[i]!
    const timer = setTimeout(() => {
      void sendLocalReminder(textForDemoType(type), signal)
    }, i * DEMO_STEP_MS)
    demoTimers.push(timer)
  }
  const cleanup = setTimeout(() => {
    demoTimers.length = 0
    logger.info('关怀提醒演示一轮结束')
  }, DEMO_ORDER.length * DEMO_STEP_MS)
  demoTimers.push(cleanup)

  return {
    started: true,
    message: '已启动四类提醒预览；可见桌宠使用气泡，其余使用静默系统通知',
  }
}

function schedulePeriodic(type: Exclude<CareReminderTypeId, 'sleep'>): void {
  const def = REMINDER_DEFS[type]
  const firstKey = `${type}:first`
  const loopKey = `${type}:loop`

  const first = setTimeout(() => {
    timers.delete(firstKey)
    void tryFirePeriodic(type)
    const loop = setInterval(() => {
      void tryFirePeriodic(type)
    }, def.intervalMs)
    timers.set(loopKey, loop)
  }, def.startOffsetMs)

  timers.set(firstKey, first)
}

function scheduleSleep(): void {
  const firstKey = 'sleep:first'
  const loopKey = 'sleep:loop'

  const first = setTimeout(() => {
    timers.delete(firstKey)
    void tryFireSleep()
    const loop = setInterval(() => {
      void tryFireSleep()
    }, SLEEP_CHECK_MS)
    timers.set(loopKey, loop)
  }, SLEEP_START_OFFSET_MS)

  timers.set(firstKey, first)
}

/**
 * 按当前配置重建定时器（不清 lastFired，避免保存设置后立刻连弹）
 */
function restartCareReminderScheduler(): void {
  clearAllTimers()
  deliveryController.abort()
  deliveryController = new AbortController()
  pendingTypes.clear()
  if (!started || suspended || locked)
    return
  const cfg = configCache ?? DEFAULT_CARE_REMINDER_CONFIG
  if (!cfg.enabled) {
    logger.info('关怀提醒总开关关闭，调度已停止')
    return
  }

  if (cfg.eyes)
    schedulePeriodic('eyes')
  if (cfg.water)
    schedulePeriodic('water')
  if (cfg.walk)
    schedulePeriodic('walk')
  if (cfg.sleep)
    scheduleSleep()

  logger.info('关怀提醒调度已启动/重建', {
    eyes: cfg.eyes,
    water: cfg.water,
    walk: cfg.walk,
    sleep: cfg.sleep,
  })
}

function onSuspend(): void {
  suspended = true
  clearDemoTimers()
  restartCareReminderScheduler()
}

function onResume(): void {
  suspended = false
  restartCareReminderScheduler()
}

function onLock(): void {
  locked = true
  clearDemoTimers()
  restartCareReminderScheduler()
}

function onUnlock(): void {
  locked = false
  restartCareReminderScheduler()
}

/** 应用启动后调用：读配置并开始调度。 */
export async function startCareReminderService(): Promise<void> {
  if (started)
    return
  started = true
  suspended = false
  locked = powerMonitor.getSystemIdleState(1) === 'locked'
  powerMonitor.on('suspend', onSuspend)
  powerMonitor.on('resume', onResume)
  powerMonitor.on('lock-screen', onLock)
  powerMonitor.on('unlock-screen', onUnlock)
  await getCareReminderConfig()
  restartCareReminderScheduler()
  logger.info('CareReminderService 已启动')
}

/** 应用退出前停止，恢复事件不得重启已停止的服务。 */
export function stopCareReminderService(): void {
  started = false
  clearAllTimers()
  clearDemoTimers()
  deliveryController.abort()
  pendingTypes.clear()
  powerMonitor.removeListener('suspend', onSuspend)
  powerMonitor.removeListener('resume', onResume)
  powerMonitor.removeListener('lock-screen', onLock)
  powerMonitor.removeListener('unlock-screen', onUnlock)
  logger.info('CareReminderService 已停止')
}
