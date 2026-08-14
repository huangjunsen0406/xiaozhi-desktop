/**
 * 打包后校验当前目标平台的 sharp 原生二进制已解包。
 *
 * 真实文件在 lib/sharp-<runtime>.node（package exports 映射 ./sharp.node），
 * 不是包根下的 sharp.node。只检查本次打包的 arch，不强求把另一边
 * 的 Darwin 二进制塞进单 arch 包（electron-builder 通常不会打进去）。
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

function moduleRoots(resourcesRoot, runtime) {
  return [
    path.join(resourcesRoot, 'app.asar.unpacked', 'node_modules', `@img/sharp-${runtime}`),
    path.join(resourcesRoot, 'app', 'node_modules', `@img/sharp-${runtime}`),
  ]
}

function candidateSharpNodes(resourcesRoot, runtime) {
  return moduleRoots(resourcesRoot, runtime).flatMap(dir => [
    path.join(dir, 'lib', `sharp-${runtime}.node`),
    path.join(dir, 'sharp.node'),
  ])
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { recursive: true }).join('\n')
  }
  catch (error) {
    return `(unreadable ${dir}: ${error.message})`
  }
}

async function afterPack(context) {
  const runtimes = runtimePlatforms(context.electronPlatformName, context.arch)
  const root = resourcesDir(context)

  for (const runtime of runtimes) {
    const candidates = candidateSharpNodes(root, runtime)
    const found = candidates.find(file => fs.existsSync(file))
    if (!found) {
      const listings = moduleRoots(root, runtime)
        .map(dir => `${dir}\n${listDir(dir)}`)
        .join('\n\n')
      throw new Error(
        `Packed app missing sharp native binary for ${runtime}.\n`
        + `Looked in:\n${candidates.map(file => `  - ${file}`).join('\n')}\n`
        + `Unpacked @img/sharp-${runtime}:\n${listings}\n`
        + 'Install the matching optional package and unpack node_modules/@img.',
      )
    }
    console.log(`[afterPack] sharp native ok: ${found}`)
  }
}

module.exports = afterPack
module.exports.default = afterPack
module.exports.runtimePlatforms = runtimePlatforms
module.exports.candidateSharpNodes = candidateSharpNodes
