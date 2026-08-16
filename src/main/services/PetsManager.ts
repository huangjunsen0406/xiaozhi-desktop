/**
 * 精灵宠物管理器
 *
 * 主目录：userData/pets/（可写，导入/删除）
 * 额外只读来源：~/.codex/pets 或 $CODEX_HOME/pets（扫描引用，不复制）
 * 同 id 时 local 优先
 */
import type {
  PetInfo,
  PetsConfigFile,
  PetSource,
  PetSpritesheetPayload,
} from '@shared/types'
import path from 'node:path'
import { shouldCopyBuiltinPet } from '@shared/petsSeed'
import {
  clampPetDisplayWidth,
  PET_DISPLAY_WIDTH_DEFAULT,
  PET_SPRITE_FRAME_H,
  PET_SPRITE_FRAME_W,
  resolveSpriteVersion,
} from '@shared/types'
import fs from 'fs-extra'
import { getLogger } from '../utils/logger'
import {
  getPetsConfigFile,
  isPathInside,
  getPetsDir as resolvePetsDir,
} from '../utils/paths'
import { getSharp } from '../utils/sharp'
import {
  findPetDirInRoot,
  getBundledPetsDir,
  getCodexPetsDir,
  resolvePetDir,
} from './petPaths'

export { getBundledPetsDir, getCodexPetsDir, resolvePetDir } from './petPaths'

const logger = getLogger('PetsManager')

/** 精灵图参数（Codex 兼容） */
const FRAME_WIDTH = PET_SPRITE_FRAME_W
const FRAME_HEIGHT = PET_SPRITE_FRAME_H

/** 预览图缩放尺寸 */
const PREVIEW_WIDTH = 96
const PREVIEW_HEIGHT = 104

const CODEX_DELETE_ERROR = 'Codex 来源宠物不可删除，请在本地导入副本或到 ~/.codex/pets 管理'

/**
 * 用户主动删除过的内置宠物 id（隐藏文件，位于 userData/pets/ 根下）。
 * 只记录 bundled 目录里的 id；scanPets 跳过文件，deletePet 不会删它。
 */
const BUILTIN_REMOVED_FILE = '.builtin-removed.json'

function getBuiltinRemovedFilePath(): string {
  return path.join(getPetsDir(), BUILTIN_REMOVED_FILE)
}

async function readRemovedBuiltinIds(): Promise<Set<string>> {
  const file = getBuiltinRemovedFilePath()
  try {
    if (!(await fs.pathExists(file)))
      return new Set()
    const raw = await fs.readJson(file)
    if (!Array.isArray(raw))
      return new Set()
    return new Set(raw.filter((id): id is string => typeof id === 'string' && id.length > 0))
  }
  catch (error) {
    logger.warn('读取内置宠物删除记录失败', error)
    return new Set()
  }
}

async function markBuiltinRemoved(petId: string): Promise<void> {
  const bundledDir = getBundledPetsDir()
  if (!(await fs.pathExists(path.join(bundledDir, petId, 'pet.json'))))
    return
  const ids = await readRemovedBuiltinIds()
  if (ids.has(petId))
    return
  ids.add(petId)
  await fs.writeJson(getBuiltinRemovedFilePath(), [...ids], { spaces: 2 })
}

type PetsConfig = PetsConfigFile

interface PetJsonManifest {
  id?: string
  displayName?: string
  description?: string
  spritesheetPath?: string
  spriteVersionNumber?: unknown
}

/**
 * 获取本地可写宠物存储目录
 */
function getPetsDir(): string {
  return resolvePetsDir()
}

/**
 * 确保内置宠物（月薪喵/usagi/sensen）已种子到本地可写目录。
 *
 * 按 id 补洞，不靠全局一次性标记：
 * - 本地已有 pet.json：不覆盖
 * - Codex 仍有同 id：不复制（Codex 优先）
 * - 用户在设置里删过该内置 id：不复活
 * - 以上都没有：从安装包拷到本地
 *
 * 覆盖「首次种子时 Codex 占坑、后来 Codex 被删」——月薪喵/usagi 会补回来。
 *
 * @returns 本次复制的宠物数量
 */
export async function ensureBuiltinPetsCopied(): Promise<number> {
  const petsDir = getPetsDir()
  const bundledDir = getBundledPetsDir()
  if (!(await fs.pathExists(bundledDir))) {
    logger.warn(`内置宠物目录不存在: ${bundledDir}`)
    return 0
  }

  const removed = await readRemovedBuiltinIds()
  const codexDir = getCodexPetsDir()
  let copiedCount = 0
  try {
    const entries = await fs.readdir(bundledDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory())
        continue

      const petId = entry.name
      const sourcePath = path.join(bundledDir, petId)
      const targetPath = path.join(petsDir, petId)
      const localExists = await fs.pathExists(path.join(targetPath, 'pet.json'))
      const codexExists = Boolean(await findPetDirInRoot(codexDir, petId))

      if (!shouldCopyBuiltinPet({
        localExists,
        codexExists,
        userRemoved: removed.has(petId),
      })) {
        if (localExists)
          logger.info(`内置宠物已存在，跳过: ${petId}`)
        else if (codexExists)
          logger.info(`Codex 已有同 id 宠物，跳过种子: ${petId}`)
        else if (removed.has(petId))
          logger.info(`用户已删除内置宠物，跳过种子: ${petId}`)
        continue
      }

      if (await fs.pathExists(targetPath)) {
        logger.warn(`内置宠物目标目录不完整（缺 pet.json），重新复制: ${targetPath}`)
        await fs.remove(targetPath)
      }

      await fs.copy(sourcePath, targetPath)
      logger.info(`复制内置宠物: ${petId} → ${targetPath}`)
      copiedCount++
    }
  }
  catch (error) {
    logger.error('复制内置宠物失败', error)
    return copiedCount
  }

  if (copiedCount > 0)
    logger.info(`内置宠物种子完成，共复制 ${copiedCount} 个`)
  return copiedCount
}

/**
 * 获取宠物配置文件路径
 */
function getConfigFilePath(): string {
  return getPetsConfigFile()
}

/**
 * 确保本地宠物目录存在
 */
async function ensurePetsDir(): Promise<void> {
  await fs.ensureDir(getPetsDir())
}

/**
 * 规范化配置：补齐 currentPet，夹取 displayWidthPx
 */
function normalizeConfig(raw: unknown): PetsConfig {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const currentPet = typeof obj.currentPet === 'string' ? obj.currentPet : ''
  const hasWidth = typeof obj.displayWidthPx === 'number' && Number.isFinite(obj.displayWidthPx)
  return {
    currentPet,
    displayWidthPx: hasWidth
      ? clampPetDisplayWidth(obj.displayWidthPx as number)
      : PET_DISPLAY_WIDTH_DEFAULT,
  }
}

/**
 * 读取宠物配置
 */
async function getConfig(): Promise<PetsConfig> {
  try {
    const configFile = getConfigFilePath()
    if (await fs.pathExists(configFile)) {
      return normalizeConfig(await fs.readJson(configFile))
    }
  }
  catch (error) {
    logger.error('读取宠物配置失败', error)
  }
  return { currentPet: '', displayWidthPx: PET_DISPLAY_WIDTH_DEFAULT }
}

/**
 * 保存宠物配置
 */
async function saveConfig(config: PetsConfig): Promise<void> {
  const configFile = getConfigFilePath()
  const normalized = normalizeConfig(config)
  await fs.writeJson(configFile, normalized, { spaces: 2 })
}

/**
 * 从精灵图中提取第一帧作为预览图
 */
async function extractPreview(spritesheetPath: string): Promise<string | undefined> {
  try {
    if (!(await fs.pathExists(spritesheetPath))) {
      return undefined
    }

    const sharp = await getSharp()
    const preview = await sharp(spritesheetPath)
      .extract({ left: 0, top: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT })
      .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT)
      .png()
      .toBuffer()

    return `data:image/png;base64,${preview.toString('base64')}`
  }
  catch (error) {
    logger.error(`提取预览图失败: ${spritesheetPath}`, error)
    return undefined
  }
}

/**
 * 读取 pet.json + 精灵图路径。不碰 sharp：缺原生包时设置页仍能列出宠物。
 */
async function readPetFiles(petDir: string): Promise<{
  petJson: PetJsonManifest
  spritesheetFullPath: string
} | null> {
  const petJsonPath = path.join(petDir, 'pet.json')
  if (!(await fs.pathExists(petJsonPath))) {
    logger.warn(`宠物缺少 pet.json: ${petDir}`)
    return null
  }

  const petJson = await fs.readJson(petJsonPath) as PetJsonManifest
  const spritesheetFileName = petJson.spritesheetPath || 'spritesheet.webp'
  const spritesheetFullPath = path.join(petDir, spritesheetFileName)

  if (!(await fs.pathExists(spritesheetFullPath))) {
    logger.warn(`宠物精灵图不存在: ${spritesheetFullPath}`)
    return null
  }

  return { petJson, spritesheetFullPath }
}

/**
 * 用 sharp 读精灵图像素尺寸。原生包缺失或解码失败时返回 null，调用方回退。
 */
async function readSpritesheetSize(
  spritesheetFullPath: string,
): Promise<{ width: number, height: number } | null> {
  try {
    const sharp = await getSharp()
    const meta = await sharp(spritesheetFullPath).metadata()
    return {
      width: meta.width || 0,
      height: meta.height || 0,
    }
  }
  catch (error) {
    logger.warn(`读取精灵图尺寸失败（将跳过预览/按 manifest 推断版本）: ${spritesheetFullPath}`, error)
    return null
  }
}

/**
 * 解析单个宠物信息
 */
async function parsePetInfo(
  petDir: string,
  petId: string,
  source: PetSource,
): Promise<PetInfo | null> {
  try {
    const loaded = await readPetFiles(petDir)
    if (!loaded)
      return null

    const { petJson, spritesheetFullPath } = loaded
    const size = await readSpritesheetSize(spritesheetFullPath)
    const spriteVersionNumber = resolveSpriteVersion(petJson.spriteVersionNumber, size?.height)
    const previewBase64 = await extractPreview(spritesheetFullPath)
    const id = petJson.id || petId

    return {
      id,
      displayName: petJson.displayName || petId,
      description: petJson.description || '',
      spritesheetPath: spritesheetFullPath,
      spriteVersionNumber,
      previewBase64,
      previewUrl: `sprite-pet://${encodeURIComponent(id)}/${path.basename(spritesheetFullPath)}`,
      source,
    }
  }
  catch (error) {
    logger.error(`解析宠物信息失败: ${petDir}`, error)
    return null
  }
}

/**
 * 扫描单个来源目录下的宠物子目录
 */
async function scanPetsFromDir(
  petsDir: string,
  source: PetSource,
): Promise<PetInfo[]> {
  const pets: PetInfo[] = []

  if (!(await fs.pathExists(petsDir)))
    return pets

  const entries = await fs.readdir(petsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue
    const petDir = path.join(petsDir, entry.name)
    const info = await parsePetInfo(petDir, entry.name, source)
    if (info)
      pets.push(info)
  }

  return pets
}

/**
 * 读取精灵图 dataUrl + 版本（供渲染进程动画引擎）
 * 解析顺序：local → codex，不复制
 */
export async function getPetSpritesheet(petId: string): Promise<PetSpritesheetPayload | null> {
  try {
    if (!petId) {
      return null
    }

    const petDir = await resolvePetDir(petId)
    if (!petDir) {
      return null
    }

    const loaded = await readPetFiles(petDir)
    if (!loaded) {
      return null
    }

    const { petJson, spritesheetFullPath } = loaded
    const buffer = await fs.readFile(spritesheetFullPath)
    const ext = path.extname(spritesheetFullPath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : 'image/webp'
    const size = await readSpritesheetSize(spritesheetFullPath)
    const spriteVersionNumber = resolveSpriteVersion(petJson.spriteVersionNumber, size?.height)

    return {
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      spriteVersionNumber,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
    }
  }
  catch (error) {
    logger.error(`读取精灵图失败: ${petId}`, error)
    return null
  }
}

/**
 * 扫描所有宠物：local + codex（只读），同 id 时 local 优先
 */
export async function scanPets(): Promise<PetInfo[]> {
  const byId = new Map<string, PetInfo>()

  try {
    await ensurePetsDir()

    // 0) 内置宠物按 id 补洞（Codex 占坑后消失的会补拷；用户删过的不复活）
    await ensureBuiltinPetsCopied()

    // 1) 本地可写目录（优先）
    const localPets = await scanPetsFromDir(getPetsDir(), 'local')
    for (const pet of localPets)
      byId.set(pet.id, pet)

    // 2) Codex 只读目录：不存在则跳过，不创建
    const codexDir = getCodexPetsDir()
    if (await fs.pathExists(codexDir)) {
      const codexPets = await scanPetsFromDir(codexDir, 'codex')
      let added = 0
      for (const pet of codexPets) {
        if (byId.has(pet.id))
          continue
        byId.set(pet.id, pet)
        added += 1
      }
      logger.info(`已扫描 Codex 宠物目录: ${codexDir}，发现 ${codexPets.length} 个，新增 ${added} 个（同 id 本地优先）`)
    }
    else {
      logger.info(`Codex 宠物目录不存在，跳过: ${codexDir}`)
    }
  }
  catch (error) {
    logger.error('扫描宠物列表失败', error)
  }

  return Array.from(byId.values())
}

/**
 * 导入宠物（从源文件夹复制 pet.json + spritesheet 到本地目录）
 */
export async function importPet(sourcePath: string): Promise<{ success: boolean, error?: string, petId?: string }> {
  try {
    const petsDir = getPetsDir()
    await ensurePetsDir()

    logger.info(`导入宠物: ${sourcePath}`)

    // 检查源路径是否存在
    if (!(await fs.pathExists(sourcePath))) {
      return { success: false, error: '源文件夹不存在' }
    }

    // 检查是否是目录
    const stat = await fs.stat(sourcePath)
    if (!stat.isDirectory()) {
      return { success: false, error: '选择的不是文件夹' }
    }

    // 检查 pet.json 是否存在
    const petJsonPath = path.join(sourcePath, 'pet.json')
    if (!(await fs.pathExists(petJsonPath))) {
      return { success: false, error: '缺少 pet.json 配置文件' }
    }

    // 读取 pet.json 获取宠物 ID
    const petJson = await fs.readJson(petJsonPath) as PetJsonManifest
    const petId = petJson.id || path.basename(sourcePath)

    // 检查精灵图是否存在
    const spritesheetFileName = petJson.spritesheetPath || 'spritesheet.webp'
    const spritesheetPath = path.join(sourcePath, spritesheetFileName)
    if (!(await fs.pathExists(spritesheetPath))) {
      return { success: false, error: `缺少精灵图文件: ${spritesheetFileName}` }
    }

    // 检查目标是否已存在（仅本地）
    const targetPath = path.join(petsDir, petId)
    if (await fs.pathExists(targetPath)) {
      return { success: false, error: `宠物 "${petId}" 已存在` }
    }

    // 复制宠物文件夹到本地
    await fs.copy(sourcePath, targetPath)
    logger.info(`宠物已导入: ${targetPath}`)

    return { success: true, petId }
  }
  catch (error) {
    logger.error('导入宠物失败', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 删除宠物（仅本地目录）。Codex 来源不可删。
 * 通过 findPetDirInRoot 解析真实文件夹（支持 id ≠ 目录名）。
 */
export async function deletePet(petId: string): Promise<{ success: boolean, error?: string }> {
  try {
    if (!petId)
      return { success: false, error: '宠物不存在' }

    const petsDir = getPetsDir()
    const petPath = await findPetDirInRoot(petsDir, petId)
    const resolvedPetsDir = path.resolve(petsDir)
    const resolvedPetPath = petPath ? path.resolve(petPath) : null

    // 仅允许删除本地 root 下的真实子目录，禁止误删 root 本身
    if (
      resolvedPetPath
      && resolvedPetPath !== resolvedPetsDir
      && isPathInside(resolvedPetsDir, resolvedPetPath)
    ) {
      await fs.remove(resolvedPetPath)
      logger.info(`已删除宠物: ${petId} (${resolvedPetPath})`)
      await markBuiltinRemoved(petId)

      // 如果删除的是当前宠物，清空选择
      const config = await getConfig()
      if (config.currentPet === petId) {
        config.currentPet = ''
        await saveConfig(config)
      }

      return { success: true }
    }

    // 本地没有：若 Codex 有同 id，明确拒绝删除 Codex 文件
    const codexDir = await findPetDirInRoot(getCodexPetsDir(), petId)
    if (codexDir) {
      return { success: false, error: CODEX_DELETE_ERROR }
    }

    return { success: false, error: '宠物不存在' }
  }
  catch (error) {
    logger.error('删除宠物失败', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 获取当前选中的宠物 ID
 */
export async function getCurrentPet(): Promise<string> {
  const config = await getConfig()
  return config.currentPet
}

/**
 * 设置当前宠物（允许 codex 来源 id，仅存字符串）
 */
export async function setCurrentPet(petId: string): Promise<{ success: boolean, error?: string }> {
  try {
    const config = await getConfig()
    config.currentPet = petId
    await saveConfig(config)
    logger.info(`切换宠物: ${petId}`)
    return { success: true }
  }
  catch (error) {
    logger.error('设置当前宠物失败', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 获取全局桌宠显示宽度（CSS px，80–224，默认 112）
 */
export async function getDisplayWidth(): Promise<number> {
  const config = await getConfig()
  return clampPetDisplayWidth(config.displayWidthPx ?? PET_DISPLAY_WIDTH_DEFAULT)
}

/**
 * 设置全局桌宠显示宽度并持久化。返回夹取后的值。
 */
export async function setDisplayWidth(widthPx: number): Promise<{ success: boolean, width: number, error?: string }> {
  try {
    const width = clampPetDisplayWidth(widthPx)
    const config = await getConfig()
    config.displayWidthPx = width
    await saveConfig(config)
    logger.info(`桌宠显示宽度: ${width}px`)
    return { success: true, width }
  }
  catch (error) {
    logger.error('设置桌宠显示宽度失败', error)
    return {
      success: false,
      width: clampPetDisplayWidth(widthPx),
      error: String(error),
    }
  }
}

/**
 * 获取本地可写宠物存储目录路径（打开目录 / 导入目标）
 */
export function getPetsFolderPath(): string {
  return getPetsDir()
}
