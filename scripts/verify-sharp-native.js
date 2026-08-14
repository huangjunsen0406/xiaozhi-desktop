/**
 * CI：确认当前目标平台的 @img/sharp-<os>-<cpu> 已安装。
 * 用法：node scripts/verify-sharp-native.js <cpu>
 * cpu 为 electron-builder / matrix arch：x64 | arm64 | ia32
 */
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const cpu = process.argv[2]
if (!cpu) {
  console.error('usage: node scripts/verify-sharp-native.js <x64|arm64|ia32>')
  process.exit(2)
}

const osName = process.platform
const runtime = `${osName}-${cpu}`
const pkg = `@img/sharp-${runtime}`
const candidates = [
  path.join('node_modules', '@img', `sharp-${runtime}`, 'lib', `sharp-${runtime}.node`),
]

const pnpmRoot = path.join('node_modules', '.pnpm')
if (fs.existsSync(pnpmRoot)) {
  for (const entry of fs.readdirSync(pnpmRoot)) {
    if (!entry.startsWith(`@img+sharp-${runtime}@`))
      continue
    candidates.push(path.join(
      pnpmRoot,
      entry,
      'node_modules',
      '@img',
      `sharp-${runtime}`,
      'lib',
      `sharp-${runtime}.node`,
    ))
  }
}

const found = candidates.find(file => fs.existsSync(file))
if (!found) {
  console.error(`Missing ${pkg} (${runtime})`)
  console.error('Looked in:')
  for (const file of candidates)
    console.error(`  - ${file}`)
  console.error('node_modules/@img:', fs.existsSync('node_modules/@img')
    ? fs.readdirSync('node_modules/@img').join(', ')
    : '(missing)')
  process.exit(1)
}

console.log(`sharp native ok: ${found}`)
