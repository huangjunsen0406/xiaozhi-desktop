/**
 * 宠物路径解析（无 sharp / 图像依赖）
 *
 * 给启动协议、PetsManager 共用。不要把 sharp 拉进 app ready 前的 import 图。
 */
import type { Dirent } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import fs from 'fs-extra'
import { getLogger } from '../utils/logger'
import { getPetsDir } from '../utils/paths'

const logger = getLogger('PetPaths')

interface PetJsonManifest {
  id?: string
}

/**
 * Codex 桌宠目录（只读来源）。
 * `$CODEX_HOME/pets` 或 `~/.codex/pets`。
 * 仅返回路径字符串，不 ensureDir、不创建。
 */
export function getCodexPetsDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  const root = codexHome && codexHome.length > 0
    ? codexHome
    : path.join(os.homedir(), '.codex')
  return path.join(root, 'pets')
}

/**
 * 内置宠物源目录（只读，随应用分发）
 * - 生产：{process.resourcesPath}/pets（extraResources，app.asar 外部）
 * - 开发：out/main → 项目根 resources/pets
 *
 * 仅用于首次启动种子复制，不写入。
 */
export function getBundledPetsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'pets')
  }
  return path.join(__dirname, '../../resources/pets')
}

/**
 * 在单个 root 下按 petId 查找宠物目录。
 *
 * 匹配规则（与 scanPets 一致）：
 * 1. 快路径：`root/petId/pet.json` 存在（文件夹名 === id）
 * 2. 扫描子目录：`pet.json.id === petId` 或 `entry.name === petId`
 *
 * 用于 id 与文件夹名不一致的情况（如 codex `gugugaga-2` / id `gugugaga小企鹅`）。
 */
export async function findPetDirInRoot(root: string, petId: string): Promise<string | null> {
  if (!petId || !(await fs.pathExists(root)))
    return null

  const directDir = path.join(root, petId)
  if (await fs.pathExists(path.join(directDir, 'pet.json')))
    return directDir

  let entries: Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  }
  catch (error) {
    logger.warn(`读取宠物目录失败: ${root}`, error)
    return null
  }

  for (const entry of entries) {
    if (!entry.isDirectory())
      continue
    if (entry.name === petId)
      continue

    const petDir = path.join(root, entry.name)
    const petJsonPath = path.join(petDir, 'pet.json')
    if (!(await fs.pathExists(petJsonPath)))
      continue

    try {
      const petJson = await fs.readJson(petJsonPath) as PetJsonManifest
      if (petJson.id === petId)
        return petDir
    }
    catch (error) {
      logger.warn(`读取 pet.json 失败: ${petJsonPath}`, error)
    }
  }

  return null
}

/**
 * 解析宠物目录：local 优先，否则 codex。不复制。
 * 支持 pet.json.id 与文件夹名不一致。
 */
export async function resolvePetDir(petId: string): Promise<string | null> {
  if (!petId)
    return null

  const localDir = await findPetDirInRoot(getPetsDir(), petId)
  if (localDir)
    return localDir

  return findPetDirInRoot(getCodexPetsDir(), petId)
}
