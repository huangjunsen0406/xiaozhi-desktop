/**
 * Chromium AEC 策略（应用内 / 系统级 / 关闭）
 *
 * - 应用内 app：ChromeWideEchoCancellation + gUM echoCancellation
 * - 系统级 system：另加 SystemLoopbackAsAecReference（旧参数，非 forced_on）
 * - 关闭 off：gUM 不请求 EC（feature 仍可带 ChromeWide 以减少重启）
 *
 * Feature flag 须在 app.ready 前 appendSwitch；跨 system 依赖启动 flag，需重启。
 */

import type { AecMode } from '@shared/types'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

export const AEC_BOOT_FILENAME = 'aec-boot.json'

const VALID_MODES: readonly AecMode[] = ['off', 'app', 'system']

export function isAecMode(value: unknown): value is AecMode {
  return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value)
}

export function normalizeAecMode(value: unknown, fallback: AecMode = 'app'): AecMode {
  if (isAecMode(value))
    return value
  return fallback
}

/**
 * 旧布尔 enableEchoCancellation → aecMode（不自动升 system）
 */
export function aecModeFromLegacyEchoFlag(enableEchoCancellation: boolean | undefined | null): AecMode {
  if (enableEchoCancellation === false)
    return 'off'
  return 'app'
}

/**
 * aecMode → 兼容字段 enableEchoCancellation
 */
export function legacyEchoFlagFromAecMode(mode: AecMode): boolean {
  return mode !== 'off'
}

/**
 * 启动时 enable-features 字符串（ready 前调用）
 */
export function featuresForAecMode(mode: AecMode): string {
  if (mode === 'system') {
    // 与历史启动参数一致：仅 enable feature，不带 :forced_on/true
    return 'ChromeWideEchoCancellation,SystemLoopbackAsAecReference'
  }
  // off / app：带 ChromeWide，便于 off→app 热切 gUM；不启用系统 loopback 参考
  return 'ChromeWideEchoCancellation'
}

/**
 * 切换 mode 是否需要重启才能完整生效（system 的启动 feature 依赖 appendSwitch）
 */
export function requiresRelaunchForAecMode(prev: AecMode, next: AecMode): boolean {
  const prevSystem = prev === 'system'
  const nextSystem = next === 'system'
  return prevSystem !== nextSystem
}

export function getAecBootFilePath(userDataDir?: string): string {
  const root = userDataDir ?? app.getPath('userData')
  return join(root, AEC_BOOT_FILENAME)
}

/**
 * 同步读取启动镜像（appendSwitch 前；DB 可能尚未 init）
 */
export function readAecBootMode(userDataDir?: string): AecMode {
  try {
    const file = getAecBootFilePath(userDataDir)
    if (!existsSync(file))
      return 'app'
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { aecMode?: unknown }
    return normalizeAecMode(raw.aecMode, 'app')
  }
  catch {
    return 'app'
  }
}

/**
 * 设置保存时写入启动镜像
 */
export function writeAecBootMode(mode: AecMode, userDataDir?: string): void {
  const file = getAecBootFilePath(userDataDir)
  const dir = dirname(file)
  if (!existsSync(dir))
    mkdirSync(dir, { recursive: true })
  writeFileSync(
    file,
    `${JSON.stringify({ aecMode: mode, updatedAt: Date.now() }, null, 2)}\n`,
    'utf8',
  )
}

/**
 * 在 app.ready 前根据 boot mode 设置 Chromium features
 */
export function applyAecCommandLineFeatures(mode?: AecMode): AecMode {
  const resolved = mode ?? readAecBootMode()
  const features = featuresForAecMode(resolved)
  app.commandLine.appendSwitch('enable-features', features)
  return resolved
}
