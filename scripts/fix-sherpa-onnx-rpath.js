// scripts/fix_sherpa_onnx_rpath.js
// 仅在 macOS 上修复 sherpa-onnx-node 的 rpath (@rpath -> @loader_path)

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

// 非 macOS 直接跳过
if (process.platform !== 'darwin') {
  console.log('[fix_sherpa_onnx_rpath] 非 macOS，跳过修复。')
  process.exit(0)
}

const projectRoot = path.resolve(__dirname, '..')

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir)
  }
  catch {
    return []
  }
}

function findSherpaDirs() {
  const dirs = []

  // 1) pnpm: node_modules/.pnpm/**/sherpa-onnx-darwin-*
  const pnpmRoot = path.join(projectRoot, 'node_modules', '.pnpm')
  for (const entry of safeReaddir(pnpmRoot)) {
    if (entry.includes('sherpa-onnx-darwin-')) {
      dirs.push(path.join(pnpmRoot, entry))
    }
  }

  // 2) 普通 node_modules: node_modules/sherpa-onnx-darwin-*
  const nmRoot = path.join(projectRoot, 'node_modules')
  for (const entry of safeReaddir(nmRoot)) {
    if (entry.startsWith('sherpa-onnx-darwin-')) {
      dirs.push(path.join(nmRoot, entry))
    }
  }

  return dirs
}

function run(cmd) {
  console.log(`[fix_sherpa_onnx_rpath] > ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

function patchSherpaDir(sherpaDir) {
  const nodeFile = path.join(sherpaDir, 'sherpa-onnx.node')
  if (!fs.existsSync(nodeFile)) {
    console.log(`[fix_sherpa_onnx_rpath] 跳过：未找到 sherpa-onnx.node (${nodeFile})`)
    return
  }

  const entries = safeReaddir(sherpaDir)

  const cApiDylib = entries.includes('libsherpa-onnx-c-api.dylib')
    ? path.join(sherpaDir, 'libsherpa-onnx-c-api.dylib')
    : null

  const onnxDylibs = entries
    .filter(
      f =>
        f.startsWith('libonnxruntime.')
        && f.endsWith('.dylib'),
    )
    .map(f => path.join(sherpaDir, f))

  console.log(`[fix_sherpa_onnx_rpath] 修复目录: ${sherpaDir}`)
  console.log(`[fix_sherpa_onnx_rpath] sherpa-onnx.node: ${nodeFile}`)
  if (cApiDylib)
    console.log(`[fix_sherpa_onnx_rpath] c-api dylib: ${cApiDylib}`)
  if (onnxDylibs.length) {
    console.log('[fix_sherpa_onnx_rpath] onnx dylibs:')
    onnxDylibs.forEach(p => console.log(`  - ${p}`))
  }

  // 1) 修改 sherpa-onnx.node 依赖的动态库路径
  try {
    let cmd
      = 'install_name_tool '
        + '-change @rpath/libsherpa-onnx-c-api.dylib @loader_path/libsherpa-onnx-c-api.dylib '

    for (const onnx of onnxDylibs) {
      const base = path.basename(onnx)
      cmd += `-change @rpath/${base} @loader_path/${base} `
    }

    cmd += `"${nodeFile}"`
    run(cmd)
    console.log('[fix_sherpa_onnx_rpath] ✅ 修改 sherpa-onnx.node 依赖路径完成')
  }
  catch (e) {
    console.error(
      '[fix_sherpa_onnx_rpath] 修改 sherpa-onnx.node 依赖路径失败：',
      e.message,
    )
  }

  // 2) 修改 libsherpa-onnx-c-api.dylib 的 ID
  if (cApiDylib && fs.existsSync(cApiDylib)) {
    try {
      run(
        `install_name_tool -id @loader_path/libsherpa-onnx-c-api.dylib "${cApiDylib}"`,
      )
      console.log(
        '[fix_sherpa_onnx_rpath] ✅ 修改 libsherpa-onnx-c-api.dylib ID 完成',
      )
    }
    catch (e) {
      console.error(
        '[fix_sherpa_onnx_rpath] 修改 libsherpa-onnx-c-api.dylib ID 失败：',
        e.message,
      )
    }
  }

  // 3) 修改 libonnxruntime.*.dylib 的 ID
  for (const onnx of onnxDylibs) {
    if (!fs.existsSync(onnx))
      continue
    const base = path.basename(onnx)
    try {
      run(`install_name_tool -id @loader_path/${base} "${onnx}"`)
      console.log(
        `[fix_sherpa_onnx_rpath] ✅ 修改 ${base} ID 完成`,
      )
    }
    catch (e) {
      console.error(
        `[fix_sherpa_onnx_rpath] 修改 ${base} ID 失败：`,
        e.message,
      )
    }
  }

  // 4) 打印最终依赖以供确认
  try {
    console.log('[fix_sherpa_onnx_rpath] 当前依赖 (otool -L):')
    run(`otool -L "${nodeFile}"`)
  }
  catch (e) {
    console.error(
      '[fix_sherpa_onnx_rpath] otool 检查失败：',
      e.message,
    )
  }
}

function main() {
  const sherpaDirs = findSherpaDirs()

  if (!sherpaDirs.length) {
    console.log(
      '[fix_sherpa_onnx_rpath] 未找到 sherpa-onnx-darwin-* 目录，可能未安装或不是 macOS 架构，跳过。',
    )
    return
  }

  try {
    for (const dir of sherpaDirs) {
      patchSherpaDir(dir)
    }
    console.log(
      '[fix_sherpa_onnx_rpath] ✅ sherpa-onnx rpath 修复完成（Node 脚本）',
    )
  }
  catch (e) {
    console.error('[fix_sherpa_onnx_rpath] 修复过程中出现异常：', e.message)
    // 为了不阻塞 npm/yarn/pnpm install，这里不抛 fatal
  }
}

main()
