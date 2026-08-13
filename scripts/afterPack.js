/**
 * 打包后校验目标平台的 sharp 原生二进制已解包。
 * Intel Mac 缺 @img/sharp-darwin-x64 时，主进程 require('sharp') 会直接弹框。
 */
const fs = require('node:fs')
const path = require('node:path')

/** @see electron-builder Arch */
const ARCH_NAME = {
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
  4: 'universal',
}

function runtimePlatforms(electronPlatformName, arch) {
  // mac 包无论打 arm64 还是 x64，都带上另一边：Rosetta / 下错 arch 时 sharp 才找得到
  if (electronPlatformName === 'darwin') {
    return ['darwin-x64', 'darwin-arm64']
  }
  const cpu = ARCH_NAME[arch] ?? String(arch)
  if (cpu === 'universal') {
    return [`${electronPlatformName}-x64`, `${electronPlatformName}-arm64`]
  }
  return [`${electronPlatformName}-${cpu}`]
}

function resourcesDir(context) {
  const { electronPlatformName, appOutDir, packager } = context
  if (electronPlatformName === 'darwin') {
    return path.join(
      appOutDir,
      `${packager.appInfo.productFilename}.app`,
      'Contents',
      'Resources',
    )
  }
  return path.join(appOutDir, 'resources')
}

function candidateSharpNodes(root, runtime) {
  return [
    path.join(root, 'app.asar.unpacked', 'node_modules', `@img/sharp-${runtime}`, 'sharp.node'),
    path.join(root, 'app', 'node_modules', `@img/sharp-${runtime}`, 'sharp.node'),
  ]
}

async function afterPack(context) {
  const runtimes = runtimePlatforms(context.electronPlatformName, context.arch)
  const root = resourcesDir(context)

  for (const runtime of runtimes) {
    const candidates = candidateSharpNodes(root, runtime)
    const found = candidates.find(file => fs.existsSync(file))
    if (!found) {
      throw new Error(
        `Packed app missing sharp native binary for ${runtime}.\n`
        + `Looked in:\n${candidates.map(file => `  - ${file}`).join('\n')}\n`
        + 'Install the matching optional package (e.g. @img/sharp-darwin-x64) and unpack node_modules/@img.',
      )
    }
    console.log(`[afterPack] sharp native ok: ${found}`)
  }
}

module.exports = afterPack
module.exports.default = afterPack
