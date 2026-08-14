/**
 * 打包后校验当前目标平台的 sharp 原生二进制已解包。
 *
 * 真实文件在 lib/sharp-<runtime>.node（package exports 映射 ./sharp.node）。
 * pnpm 下 electron-builder 有时不会把 @img/sharp-* 打进 asar.unpacked，
 * 缺失时从工程 node_modules（含 .pnpm store）解引用拷进去。
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

function unpackedNodeModules(resourcesRoot) {
  return path.join(resourcesRoot, 'app.asar.unpacked', 'node_modules')
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

function findProjectSharpDir(projectDir, pkgName) {
  const hoisted = path.join(projectDir, 'node_modules', '@img', pkgName)
  const hoistedNode = path.join(hoisted, 'lib', `sharp-${pkgName.replace(/^sharp-/, '')}.node`)
  if (pkgName.startsWith('sharp-libvips-')) {
    if (fs.existsSync(hoisted))
      return hoisted
  }
  else if (fs.existsSync(hoistedNode) || fs.existsSync(path.join(hoisted, 'lib'))) {
    const files = fs.existsSync(path.join(hoisted, 'lib'))
      ? fs.readdirSync(path.join(hoisted, 'lib'))
      : []
    if (files.some(name => name.endsWith('.node')))
      return hoisted
  }

  const pnpmRoot = path.join(projectDir, 'node_modules', '.pnpm')
  if (!fs.existsSync(pnpmRoot))
    return null

  const prefix = `@img+${pkgName}@`
  for (const entry of fs.readdirSync(pnpmRoot)) {
    if (!entry.startsWith(prefix))
      continue
    const dir = path.join(pnpmRoot, entry, 'node_modules', '@img', pkgName)
    if (fs.existsSync(dir))
      return dir
  }
  return null
}

function copyPkgIntoUnpacked(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true, dereference: true })
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { recursive: true }).join('\n')
  }
  catch (error) {
    return `(unreadable ${dir}: ${error.message})`
  }
}

function ensureRuntime(context, runtime) {
  const root = resourcesDir(context)
  const existing = candidateSharpNodes(root, runtime).find(file => fs.existsSync(file))
  if (existing) {
    console.log(`[afterPack] sharp native ok: ${existing}`)
    return
  }

  const projectDir = context.packager.projectDir
  const sharpSrc = findProjectSharpDir(projectDir, `sharp-${runtime}`)
  if (!sharpSrc) {
    throw new Error(
      `Packed app missing sharp native binary for ${runtime}, and it is not installed in the project.\n`
      + `Looked in node_modules/@img/sharp-${runtime} and node_modules/.pnpm/@img+sharp-${runtime}@*.\n`
      + 'Check pnpm supportedArchitectures / optionalDependencies.',
    )
  }

  const dest = path.join(unpackedNodeModules(root), '@img', `sharp-${runtime}`)
  copyPkgIntoUnpacked(sharpSrc, dest)
  console.log(`[afterPack] copied sharp ${runtime} from ${sharpSrc} -> ${dest}`)

  const libvipsName = `sharp-libvips-${runtime}`
  const libvipsSrc = findProjectSharpDir(projectDir, libvipsName)
  if (libvipsSrc) {
    const libvipsDest = path.join(unpackedNodeModules(root), '@img', libvipsName)
    copyPkgIntoUnpacked(libvipsSrc, libvipsDest)
    console.log(`[afterPack] copied ${libvipsName} from ${libvipsSrc} -> ${libvipsDest}`)
  }

  const found = candidateSharpNodes(root, runtime).find(file => fs.existsSync(file))
  if (!found) {
    const listings = moduleRoots(root, runtime)
      .map(dir => `${dir}\n${listDir(dir)}`)
      .join('\n\n')
    throw new Error(
      `Copied sharp ${runtime} but still cannot find the .node.\n`
      + `Looked in:\n${candidateSharpNodes(root, runtime).map(file => `  - ${file}`).join('\n')}\n`
      + `Unpacked:\n${listings}`,
    )
  }
  console.log(`[afterPack] sharp native ok after copy: ${found}`)
}

async function afterPack(context) {
  const runtimes = runtimePlatforms(context.electronPlatformName, context.arch)
  for (const runtime of runtimes)
    ensureRuntime(context, runtime)
}

module.exports = afterPack
module.exports.default = afterPack
module.exports.runtimePlatforms = runtimePlatforms
module.exports.candidateSharpNodes = candidateSharpNodes
module.exports.findProjectSharpDir = findProjectSharpDir
