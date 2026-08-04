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
  PetSpriteVersion,
} from '@shared/types'
import type { Dirent } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {
  clampPetDisplayWidth,
  PET_DISPLAY_WIDTH_DEFAULT,
  PET_SPRITE_FRAME_H,
  PET_SPRITE_FRAME_W,
} from '@shared/types'
import { app } from 'electron'
import fs from 'fs-extra'
import sharp from 'sharp'
import { getLogger } from '../utils/logger'
import {
  getPetsConfigFile,
  isPathInside,
  getPetsDir as resolvePetsDir,
} from '../utils/paths'

const logger = getLogger('PetsManager')

/** 精灵图参数（Codex 兼容） */
const FRAME_WIDTH = PET_SPRITE_FRAME_W
const FRAME_HEIGHT = PET_SPRITE_FRAME_H
/** v1 atlas 高 1872（8×9）；v2 高 2288（8×11） */
const V1_ATLAS_HEIGHT = FRAME_HEIGHT * 9
const V2_ATLAS_HEIGHT = FRAME_HEIGHT * 11

/** 预览图缩放尺寸 */
const PREVIEW_WIDTH = 96
const PREVIEW_HEIGHT = 104

const CODEX_DELETE_ERROR = 'Codex 来源宠物不可删除，请在本地导入副本或到 ~/.codex/pets 管理'

/**
 * 内置宠物种子完成标记（隐藏文件，位于 userData/pets/ 根下）。
 *
 * 为什么选标记文件而非 pets-config.json 字段：
 * - pets-config.json 是 shared DTO，加字段要同步 shared 类型与读写，侵入面大；
 * - 标记与 pets 目录本身绑定：用户切换 XIAOZHI_PETS_DIR / PATHS.petsDir 时新目录
 *   自然无标记、重新种子，语义一致；
 * - 安全：scanPetsFromDir 只读目录项（文件天然跳过）；deletePet 只删真实宠物子目录，
 *   不会触碰该文件。
 */
const BUILTIN_SEEDED_MARKER = '.builtin-seeded'

function getBuiltinSeededMarkerPath(): string {
  return path.join(getPetsDir(), BUILTIN_SEEDED_MARKER)
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
 * 将 pet.json 中的版本字段规范为 1 | 2
 */
function normalizeSpriteVersion(value: unknown): PetSpriteVersion | undefined {
  if (value === 1 || value === 2)
    return value
  if (value === '1')
    return 1
  if (value === '2')
    return 2
  return undefined
}

/**
 * 按 atlas 像素高度推断版本（Codex：1872→v1，2288→v2）
 */
function inferSpriteVersionFromHeight(height: number): PetSpriteVersion {
  if (height >= V2_ATLAS_HEIGHT - FRAME_HEIGHT / 2)
    return 2
  if (height >= V1_ATLAS_HEIGHT - FRAME_HEIGHT / 2)
    return 1
  // 非标准高度：按行数估算
  const rows = Math.max(1, Math.round(height / FRAME_HEIGHT))
  return rows >= 11 ? 2 : 1
}

/**
 * 解析最终 sprite 版本：显式 manifest > 高度推断 > 默认 1
 */
function resolveSpriteVersion(
  manifestVersion: unknown,
  imageHeight?: number,
): PetSpriteVersion {
  const fromManifest = normalizeSpriteVersion(manifestVersion)
  if (fromManifest)
    return fromManifest
  if (typeof imageHeight === 'number' && imageHeight > 0)
    return inferSpriteVersionFromHeight(imageHeight)
  return 1
}

/**
 * 获取本地可写宠物存储目录
 */
function getPetsDir(): string {
  return resolvePetsDir()
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
 * 确保内置宠物（月薪喵/usagi/sensen）已种子到本地可写目录。
 *
 * 策略：
 * 1. 只种子一次：首次完整成功后写标记文件 `userData/pets/.builtin-seeded`，
 *    之后直接 no-op（用户删除的内置宠物保持删除，不复活）。
 * 2. Codex 已有同 id 宠物（含 pet.json）则跳过，用户 Codex 版本优先。
 * 3. 幂等：仅复制缺失目录（或缺失 pet.json 的残缺目录），
 *    不覆盖已存在 pet.json 的用户版本（可导入/可删除的普通本地宠物）。
 *
 * 标记只在整轮成功（或全部跳过）后写入；中途异常不写，下次启动重试。
 * @returns 本次复制的宠物数量
 */
export async function ensureBuiltinPetsCopied(): Promise<number> {
  const petsDir = getPetsDir()
  const markerPath = getBuiltinSeededMarkerPath()

  // 已完成首次种子：直接跳过（含用户删除内置宠物后的场景）
  if (await fs.pathExists(markerPath)) {
    return 0
  }

  const bundledDir = getBundledPetsDir()
  if (!(await fs.pathExists(bundledDir))) {
    logger.warn(`内置宠物目录不存在: ${bundledDir}`)
    return 0
  }

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

      // Codex 已有同 id 宠物（文件夹名或 pet.json.id 命中）：不复制，Codex 版本优先
      if (await findPetDirInRoot(codexDir, petId)) {
        logger.info(`Codex 已有同 id 宠物，跳过种子: ${petId}`)
        continue
      }

      // 已有有效本地版本（含 pet.json）视为用户版本，不覆盖
      if (await fs.pathExists(path.join(targetPath, 'pet.json'))) {
        logger.info(`内置宠物已存在，跳过: ${petId}`)
        continue
      }

      // 残缺目标目录（无 pet.json，非有效宠物）：清除后整体复制，避免残留
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
    // 部分失败：不写标记，下次启动重试（幂等，已复制的不重复）
    logger.error('复制内置宠物失败', error)
    return copiedCount
  }

  // 整轮成功（含全部跳过）：写一次性标记；失败则下次启动重试（无害，幂等）
  try {
    await fs.writeFile(markerPath, new Date().toISOString())
  }
  catch (error) {
    logger.error('写入内置宠物种子标记失败，下次启动将重试', error)
  }

  logger.info(`内置宠物种子完成，共复制 ${copiedCount} 个`)
  return copiedCount
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
async function findPetDirInRoot(root: string, petId: string): Promise<string | null> {
  if (!petId || !(await fs.pathExists(root)))
    return null

  // 快路径：文件夹名与 id 相同
  const directDir = path.join(root, petId)
  if (await fs.pathExists(path.join(directDir, 'pet.json')))
    return directDir

  // 慢路径：扫描子目录，按 pet.json.id 匹配（文件夹名快路径已处理）
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
    // 快路径已覆盖 entry.name === petId 且有 pet.json 的情况
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
 * 读取 pet.json + 精灵图元数据
 */
async function readPetManifest(petDir: string): Promise<{
  petJson: PetJsonManifest
  spritesheetFullPath: string
  width: number
  height: number
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

  const meta = await sharp(spritesheetFullPath).metadata()
  const width = meta.width || 0
  const height = meta.height || 0

  return { petJson, spritesheetFullPath, width, height }
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
    const loaded = await readPetManifest(petDir)
    if (!loaded)
      return null

    const { petJson, spritesheetFullPath, height } = loaded
    const spriteVersionNumber = resolveSpriteVersion(petJson.spriteVersionNumber, height)
    const previewBase64 = await extractPreview(spritesheetFullPath)

    return {
      id: petJson.id || petId,
      displayName: petJson.displayName || petId,
      description: petJson.description || '',
      spritesheetPath: spritesheetFullPath,
      spriteVersionNumber,
      previewBase64,
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

    const loaded = await readPetManifest(petDir)
    if (!loaded) {
      return null
    }

    const { petJson, spritesheetFullPath, width, height } = loaded
    const buffer = await fs.readFile(spritesheetFullPath)
    const ext = path.extname(spritesheetFullPath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : 'image/webp'
    const spriteVersionNumber = resolveSpriteVersion(petJson.spriteVersionNumber, height)

    return {
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      spriteVersionNumber,
      width,
      height,
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

    // 0) 内置宠物种子：有标记文件时为一次 pathExists 的廉价 no-op，
    //    保证全新安装的 UI 首次列出前宠物已就位
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
