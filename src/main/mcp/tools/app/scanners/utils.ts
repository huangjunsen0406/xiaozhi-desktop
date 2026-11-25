import type { AppInfo } from '../types'

/**
 * 清理应用名称：移除尾部版本号、商标符号及多余空格（Windows 可选去除快捷方式与括号后缀）。
 */
export function cleanAppName(appName: string, options: { stripWindowsSuffixes?: boolean } = {}): string {
  let clean = appName.replace(/\s+\d+(\.\d+)*$/, '')
  if (options.stripWindowsSuffixes) {
    clean = clean.replace(/\s*-\s*Shortcut$/i, '')
    clean = clean.replace(/\s*\(.*\)$/, '')
  }
  clean = clean.replace(/[™®©]/g, '').trim()
  return clean || appName
}

/**
 * 按小写名称去重，保留先出现条目（保证用户目录 / 应用目录优先于内置系统工具兜底）。
 */
export function dedupeApps(apps: AppInfo[]): AppInfo[] {
  const seen = new Set<string>()
  const unique: AppInfo[] = []
  for (const app of apps) {
    const key = app.name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(app)
    }
  }
  return unique
}
