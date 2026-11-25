import type { McpInstalledPlugin } from '../../../shared/types/mcp'
import path from 'node:path'
import fs from 'fs-extra'
import { isPathInside } from '../../utils/paths'
import { validateManifest } from './manifest'

/** Installation inventory is independent of successful tool registration. */
export async function scanInstalledMcpPlugins(pluginsDir: string): Promise<McpInstalledPlugin[]> {
  await fs.ensureDir(pluginsDir)
  const root = await fs.realpath(pluginsDir)
  const items: McpInstalledPlugin[] = []
  for (const directoryName of (await fs.readdir(root)).sort()) {
    if (directoryName.startsWith('.'))
      continue
    const directory = path.join(root, directoryName)
    const stat = await fs.lstat(directory)
    if (!stat.isDirectory() && !stat.isSymbolicLink())
      continue
    const item: McpInstalledPlugin = { directoryName, name: directoryName, status: 'failed', toolCount: 0 }
    try {
      if (stat.isSymbolicLink() || !isPathInside(root, await fs.realpath(directory)))
        throw new Error('插件目录不能为符号链接')
      const manifestPath = path.join(directory, 'manifest.json')
      if (!isPathInside(await fs.realpath(directory), await fs.realpath(manifestPath)))
        throw new Error('清单指向插件目录外')
      const validated = validateManifest(await fs.readJson(manifestPath), directory)
      if (!validated.ok)
        throw new Error(validated.error)
      item.pluginId = validated.manifest.id
      item.name = validated.manifest.name
      item.version = validated.manifest.version
      item.status = 'skipped'
      item.reason = '尚未加载'
    }
    catch (error) { item.reason = error instanceof Error ? error.message : String(error) }
    items.push(item)
  }
  return items
}

export async function resolveInstalledPluginDirectory(pluginsDir: string, directoryName: string): Promise<string> {
  if (!directoryName || directoryName.startsWith('.') || directoryName === '..' || directoryName.includes('/') || directoryName.includes('\\'))
    throw new Error('插件目录名称非法')
  const root = await fs.realpath(pluginsDir)
  const target = path.resolve(root, directoryName)
  if (path.dirname(target) !== root)
    throw new Error('插件目录路径非法')
  const stat = await fs.lstat(target)
  if (!stat.isDirectory() && !stat.isSymbolicLink())
    throw new Error('目标不是插件目录')
  return target
}

/** Validate links before dereferencing them into a self-contained installed package. */
export async function validatePackageTree(
  root: string,
  directory = root,
  ancestors = new Set<string>(),
): Promise<void> {
  const real = await fs.realpath(directory)
  if (!isPathInside(root, real))
    throw new Error(`插件符号链接指向目录外: ${directory}`)
  if (ancestors.has(real))
    throw new Error(`插件包含循环符号链接: ${directory}`)

  const next = new Set([...ancestors, real])
  for (const name of await fs.readdir(directory)) {
    if (['.git', '.svn', '.hg'].includes(name))
      continue
    const file = path.join(directory, name)
    const target = await fs.realpath(file)
    if (!isPathInside(root, target))
      throw new Error(`插件符号链接指向目录外: ${file}`)
    if ((await fs.stat(file)).isDirectory())
      await validatePackageTree(root, file, next)
  }
}
