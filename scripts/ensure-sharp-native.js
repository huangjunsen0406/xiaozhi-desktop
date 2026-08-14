/**
 * 确保目标 arch 的 @img/sharp-<os>-<cpu> 落在 node_modules。
 *
 * pnpm 在 arm64 runner 上交叉打 x64 时，supportedArchitectures / npm_config_arch
 * 经常仍只装宿主机 optional 包。这里按包名 npm pack，不依赖 pnpm 的 arch 过滤。
 *
 * 用法：node scripts/ensure-sharp-native.js <x64|arm64|ia32>
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')

const SHARP_VERSION = '0.34.5'
const LIBVIPS_VERSION = '1.2.4'

const cpu = process.argv[2]
if (!cpu) {
  console.error('usage: node scripts/ensure-sharp-native.js <x64|arm64|ia32>')
  process.exit(2)
}

const runtime = `${process.platform}-${cpu}`
const sharpPkg = `@img/sharp-${runtime}`
const libvipsPkg = `@img/sharp-libvips-${runtime}`
const projectRoot = path.resolve(__dirname, '..')

function sharpNodePath(pkgRoot) {
  return path.join(pkgRoot, 'lib', `sharp-${runtime}.node`)
}

function findInstalled(pkgName, nodeFile) {
  const hoisted = path.join(projectRoot, 'node_modules', '@img', pkgName.replace('@img/', ''))
  if (nodeFile) {
    if (fs.existsSync(sharpNodePath(hoisted)))
      return hoisted
  }
  else if (fs.existsSync(hoisted)) {
    return hoisted
  }

  const pnpmRoot = path.join(projectRoot, 'node_modules', '.pnpm')
  if (!fs.existsSync(pnpmRoot))
    return null

  const prefix = `${pkgName.replace('/', '+')}@`
  for (const entry of fs.readdirSync(pnpmRoot)) {
    if (!entry.startsWith(prefix))
      continue
    const dir = path.join(pnpmRoot, entry, 'node_modules', '@img', pkgName.replace('@img/', ''))
    if (nodeFile && fs.existsSync(sharpNodePath(dir)))
      return dir
    if (!nodeFile && fs.existsSync(dir))
      return dir
  }
  return null
}

function npmPackExtract(spec, dest) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaozhi-sharp-'))
  try {
    const tgz = execFileSync('npm', ['pack', spec, '--pack-destination', tmp], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }).trim().split(/\r?\n/).pop()
    const tgzPath = path.join(tmp, tgz)
    const extractDir = path.join(tmp, 'extract')
    fs.mkdirSync(extractDir)
    execFileSync('tar', ['-xzf', tgzPath, '-C', extractDir], { stdio: 'inherit' })
    const pkgDir = path.join(extractDir, 'package')
    if (!fs.existsSync(pkgDir))
      throw new Error(`npm pack ${spec} 没有 package/ 目录`)

    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(pkgDir, dest, { recursive: true })
    console.log(`installed ${spec} -> ${dest}`)
  }
  finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

const destSharp = path.join(projectRoot, 'node_modules', '@img', `sharp-${runtime}`)
let sharpDir = findInstalled(sharpPkg, true)
if (!sharpDir) {
  npmPackExtract(`${sharpPkg}@${SHARP_VERSION}`, destSharp)
  sharpDir = destSharp
}
else {
  console.log(`already have ${sharpPkg}: ${sharpDir}`)
}

if (!fs.existsSync(sharpNodePath(sharpDir))) {
  console.error(`still missing ${sharpNodePath(sharpDir)}`)
  process.exit(1)
}

if (process.platform === 'darwin' || process.platform === 'linux') {
  const destVips = path.join(projectRoot, 'node_modules', '@img', `sharp-libvips-${runtime}`)
  const vipsDir = findInstalled(libvipsPkg, false)
  if (!vipsDir)
    npmPackExtract(`${libvipsPkg}@${LIBVIPS_VERSION}`, destVips)
  else
    console.log(`already have ${libvipsPkg}: ${vipsDir}`)
}

console.log(`sharp native ok: ${sharpNodePath(sharpDir)}`)
