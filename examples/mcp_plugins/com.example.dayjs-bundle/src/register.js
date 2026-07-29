/**
 * 源码：依赖 dayjs（第三方）。
 * 发布前 npm run build → 根目录 register.js（单文件，无 node_modules）。
 */
const dayjs = require('dayjs')

function register(host) {
  const logger = host.get('logger')

  host.tool(
    'example.now',
    `Get current date-time formatted with dayjs (bundled third-party dep).

中文：用 dayjs 格式化当前时间（演示第三方依赖已打进 register.js，主程序无需安装 dayjs）。

Use when user asks current time / 现在几点 / format now.

Parameters:
- format: dayjs format string (default: YYYY-MM-DD HH:mm:ss)

Examples:
- "现在几点" → example.now
- format "YYYY年MM月DD日" → localized style date`,
    [
      { name: 'format', type: 'string', defaultValue: 'YYYY-MM-DD HH:mm:ss' },
    ],
  )(async (args) => {
    const format =
      typeof args.format === 'string' && args.format.trim()
        ? args.format
        : 'YYYY-MM-DD HH:mm:ss'
    const text = dayjs().format(format)
    if (logger && typeof logger.info === 'function') {
      logger.info('example.now', { format, text })
    }
    return `现在时间：${text}（dayjs bundle from com.example.dayjs-bundle）`
  })

  host.tool(
    'example.add_days',
    `Add N days to a date using dayjs (bundled).

中文：用 dayjs 给日期加天数（演示第三方库计算）。

Parameters:
- date: base date string (default: today). e.g. 2026-07-29
- days: integer days to add (can be negative)
- format: output format (default: YYYY-MM-DD)

Examples:
- "今天加7天是几号" → days=7
- date=2026-01-01 days=30`,
    [
      { name: 'date', type: 'string', defaultValue: '' },
      { name: 'days', type: 'integer', defaultValue: 1 },
      { name: 'format', type: 'string', defaultValue: 'YYYY-MM-DD' },
    ],
  )(async (args) => {
    const days = typeof args.days === 'number' ? Math.floor(args.days) : 1
    const format =
      typeof args.format === 'string' && args.format.trim()
        ? args.format
        : 'YYYY-MM-DD'
    const base =
      typeof args.date === 'string' && args.date.trim()
        ? dayjs(args.date)
        : dayjs()
    if (!base.isValid()) {
      return JSON.stringify({ success: false, message: `无效日期: ${args.date}` })
    }
    const result = base.add(days, 'day').format(format)
    if (logger && typeof logger.info === 'function') {
      logger.info('example.add_days', { base: base.format(), days, result })
    }
    return `基准 ${base.format('YYYY-MM-DD')} ${days >= 0 ? '+' : ''}${days} 天 → ${result}（dayjs）`
  })
}

module.exports = { register }
module.exports.register = register
module.exports.default = register
