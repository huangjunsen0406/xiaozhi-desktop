import path from 'node:path'
import fs from 'fs-extra'
import { isPathInside } from '../../utils/paths'
import { withMcpPluginSource } from './archive'
import { validatePackageTree } from './inventory'
import { readPluginManifest } from './loader'

export interface InstallPluginOptions {
  sourcePath: string
  pluginsDir: string
  unload: () => Promise<unknown>
  reload: () => Promise<unknown>
  isLoaded: (id: string, rootDir: string) => boolean
}

interface RollbackState {
  pluginsDir: string
  destination: string
  backup: string
  pluginId: string
  wasLoaded: boolean
  stopped: boolean
  backedUp: boolean
  replaced: boolean
  options: InstallPluginOptions
}

async function rollbackInstall(state: RollbackState): Promise<void> {
  const { pluginsDir, destination, backup, pluginId, wasLoaded, stopped, backedUp, replaced, options } = state
  if (replaced || backedUp)
    await options.unload()
  if (replaced) {
    if (path.dirname(destination) !== pluginsDir)
      throw new Error('恢复目标路径非法')
    await fs.remove(destination)
  }
  if (backedUp)
    await fs.rename(backup, destination)
  if (stopped) {
    await options.reload()
    if (wasLoaded && !options.isLoaded(pluginId, destination))
      throw new Error('原目录已恢复，但原插件未能重新加载')
  }
}

export async function installMcpPlugin(options: InstallPluginOptions): Promise<{ pluginId: string, name: string }> {
  return withMcpPluginSource(options.sourcePath, sourcePath => installPluginDirectory({ ...options, sourcePath }))
}

async function installPluginDirectory(options: InstallPluginOptions): Promise<{ pluginId: string, name: string }> {
  await fs.ensureDir(options.pluginsDir)
  const pluginsDir = await fs.realpath(options.pluginsDir)
  const source = await fs.realpath(path.resolve(options.sourcePath))
  if (!(await fs.stat(source)).isDirectory())
    throw new Error('请选择插件目录（含 manifest.json）')

  const validated = await readPluginManifest(source)
  if (!validated.ok)
    throw new Error(validated.error)
  const { manifest } = validated
  if (manifest.runtime !== 'node-inprocess')
    throw new Error(`不支持的 runtime: ${manifest.runtime}`)

  const destination = path.join(pluginsDir, manifest.id)
  if (!isPathInside(pluginsDir, destination) || destination === pluginsDir)
    throw new Error('插件 id 导致路径逃逸')

  if (source === destination) {
    await options.reload()
    if (!options.isLoaded(manifest.id, destination))
      throw new Error('插件未能加载，请检查插件状态和日志')
    return { pluginId: manifest.id, name: manifest.name }
  }

  if (isPathInside(source, pluginsDir) || isPathInside(pluginsDir, source))
    throw new Error('源目录与插件安装目录不能相互包含')

  if (await fs.pathExists(destination)) {
    const stat = await fs.lstat(destination)
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error('安装目标必须为普通插件目录')
  }

  await validatePackageTree(source)
  const transaction = await fs.mkdtemp(path.join(pluginsDir, '.install-'))
  const staged = path.join(transaction, 'new')
  const backup = path.join(transaction, 'previous')
  const state: RollbackState = {
    pluginsDir,
    destination,
    backup,
    pluginId: manifest.id,
    wasLoaded: options.isLoaded(manifest.id, destination),
    stopped: false,
    backedUp: false,
    replaced: false,
    options,
  }
  let keepBackup = false

  try {
    await fs.copy(source, staged, {
      dereference: true,
      filter: file => !['.git', '.svn', '.hg'].includes(path.basename(file)),
    })
    const stagedManifest = await readPluginManifest(staged)
    if (!stagedManifest.ok || stagedManifest.manifest.id !== manifest.id)
      throw new Error('复制后的插件校验失败')

    state.stopped = true
    await options.unload()
    if (await fs.pathExists(destination)) {
      await fs.rename(destination, backup)
      state.backedUp = true
    }
    await fs.rename(staged, destination)
    state.replaced = true

    await options.reload()
    if (!options.isLoaded(manifest.id, destination))
      throw new Error('新插件加载失败或被配置禁用')
    return { pluginId: manifest.id, name: manifest.name }
  }
  catch (error) {
    try {
      await rollbackInstall(state)
    }
    catch (restoreError) {
      keepBackup = true
      const keptPath = await fs.pathExists(backup) ? transaction : destination
      throw new Error(`安装失败: ${String(error)}；恢复失败: ${String(restoreError)}。恢复数据保留于 ${keptPath}`)
    }
    throw new Error(`安装失败，${state.backedUp ? '已恢复原插件' : '未替换原插件'}: ${String(error)}`)
  }
  finally {
    if (!keepBackup && path.dirname(transaction) === pluginsDir && path.basename(transaction).startsWith('.install-'))
      await fs.remove(transaction)
  }
}
