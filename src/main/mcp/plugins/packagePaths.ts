import path from 'node:path'
import fs from 'fs-extra'
import { isPathInside } from '../../utils/paths'

/** Validate links before dereferencing them into a self-contained installed package. */
export async function validatePackageTree(root: string, directory = root, ancestors = new Set<string>()): Promise<void> {
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
