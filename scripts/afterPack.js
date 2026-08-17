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

function macAppPath(context) {
  return path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )
}

/**
 * 只删 bundle 级 _CodeSignature / CodeResources，不动 Mach-O 的 linker-signed。
 * extraResources 之后若留下过期封印，ShipIt 会报「签名指示这些资源必须存在」。
 */
function stripMacBundleCodeSignature(dir, removed) {
  if (!fs.existsSync(dir))
    return
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (!entry.isDirectory())
      continue
    if (entry.name === '_CodeSignature') {
      fs.rmSync(full, { recursive: true, force: true })
      removed.push(full)
      continue
    }
    stripMacBundleCodeSignature(full, removed)
  }
  const codeResources = path.join(dir, 'CodeResources')
  if (fs.existsSync(codeResources)) {
    fs.rmSync(codeResources, { force: true })
    removed.push(codeResources)
  }
}

function stripStaleMacSignatures(context) {
  if (context.electronPlatformName !== 'darwin')
    return

  const appPath = macAppPath(context)
  if (!fs.existsSync(appPath))
    return

  const removed = []
  stripMacBundleCodeSignature(appPath, removed)
  if (removed.length > 0)
    console.log(`[afterPack] stripped stale mac signatures:\n${removed.join('\n')}`)
}

/**
 * 校验其他平台原生包（sherpa-onnx / node-screenshots）已解包到 asar.unpacked。
 * 与 sharp 不同：这些包平台声明齐全，缺了说明依赖/配置问题，直接抛错让 CI 红，
 * 而不是像 sharp 那样补拷（补拷只兜 sharp 的 pnpm 特例）。
 */
function platformNativePackages(electronPlatformName, arch) {
  const cpu = ARCH_NAME[arch] ?? String(arch)
  const mac = electronPlatformName === 'darwin'
  const win = electronPlatformName === 'win32'
  const linux = electronPlatformName === 'linux'

  // sherpa-onnx：win 特名 sherpa-onnx-win-<arch>，其余 <platform>-<arch>
  const sherpaName = win
    ? `sherpa-onnx-win-${cpu}`
    : `sherpa-onnx-${electronPlatformName}-${cpu}`

  // node-screenshots：linux 带 libc 后缀（glibc 构建目标）；win 带 msvc 后缀
  const nsOs = win ? 'win32' : electronPlatformName
  const nsSuffix = linux
    ? `-${cpu}-gnu`
    : win
      ? `-${cpu}-msvc`
      : `-${cpu}`
  const nsName = `node-screenshots-${nsOs}${nsSuffix}`

  return mac || win || linux ? [sherpaName, nsName] : []
}

function assertPlatformNative(context, pkgName) {
  const root = resourcesDir(context)
  const pkgDir = path.join(root, 'app.asar.unpacked', 'node_modules', pkgName)
  if (!fs.existsSync(pkgDir)) {
    throw new Error(
      `[afterPack] 打包产物缺少平台原生包 ${pkgName}（asar.unpacked 下未找到）。\n`
      + `检查 pnpm-workspace.yaml 的 supportedArchitectures 与本机安装是否一致。`,
    )
  }
  const nodes = fs.readdirSync(pkgDir).filter(f => f.endsWith('.node'))
  if (nodes.length === 0) {
    throw new Error(
      `[afterPack] ${pkgName} 目录存在但没有 .node 文件（${pkgDir}）`,
    )
  }
  console.log(`[afterPack] ${pkgName} native ok: ${nodes.join(', ')}`)
}

async function afterPack(context) {
  const runtimes = runtimePlatforms(context.electronPlatformName, context.arch)
  for (const runtime of runtimes)
    ensureRuntime(context, runtime)

  for (const pkg of platformNativePackages(context.electronPlatformName, context.arch))
    assertPlatformNative(context, pkg)

  stripStaleMacSignatures(context)
}

module.exports = afterPack
module.exports.default = afterPack
module.exports.runtimePlatforms = runtimePlatforms
module.exports.candidateSharpNodes = candidateSharpNodes
module.exports.findProjectSharpDir = findProjectSharpDir
module.exports.stripMacBundleCodeSignature = stripMacBundleCodeSignature
