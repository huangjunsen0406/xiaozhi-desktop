/**
 * 未签名 Mac 包不能走 Squirrel.Mac / ShipIt：
 * 1.1.7 的指定要求是 Electron 主程序 cdhash，任何重签都会失败。
 * 这里用 ditto 解压 zip，直接替换当前 .app 再 relaunch。
 */
import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { app } from 'electron'
import fs from 'fs-extra'
import { getLogger } from '../utils/logger'

const execFileAsync = promisify(execFile)
const logger = getLogger('MacZipInstall')

function currentAppBundlePath(): string {
  const bundle = path.resolve(process.execPath, '../../..')
  if (!bundle.endsWith('.app'))
    throw new Error(`无法定位当前应用包: ${bundle}`)
  return bundle
}

function findAppBundle(dir: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith('.app'))
      return path.join(dir, entry.name)
  }
  return null
}

export async function installMacZipAndRelaunch(zipPath: string): Promise<void> {
  if (!(await fs.pathExists(zipPath)))
    throw new Error(`更新包不存在: ${zipPath}`)

  const currentApp = currentAppBundlePath()
  const destName = path.basename(currentApp)
  const destDir = path.dirname(currentApp)
  const destApp = path.join(destDir, destName)
  const staging = path.join(app.getPath('temp'), `xiaozhi-update-${Date.now()}`)
  const backup = `${currentApp}.old`

  logger.info('开始用 zip 替换应用', { zipPath, currentApp })
  await fs.emptyDir(staging)

  try {
    await execFileAsync('ditto', ['-xk', zipPath, staging])
    const unpacked = findAppBundle(staging)
    if (!unpacked)
      throw new Error('更新包内未找到 .app')

    const source = path.join(staging, destName)
    if (path.basename(unpacked) !== destName)
      await fs.move(unpacked, source, { overwrite: true })

    const from = await fs.pathExists(source) ? source : unpacked
    await fs.remove(backup).catch(() => undefined)
    await fs.move(currentApp, backup)
    try {
      await fs.move(from, destApp)
    }
    catch (error) {
      await fs.move(backup, currentApp).catch(() => undefined)
      throw error
    }
    await fs.remove(backup).catch(() => undefined)
    logger.info('应用已替换，正在重启', { destApp })
    await execFileAsync('open', ['-n', destApp])
    app.quit()
  }
  finally {
    await fs.remove(staging).catch(() => undefined)
  }
}
