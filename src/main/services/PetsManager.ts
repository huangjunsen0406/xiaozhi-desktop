/**
 * 精灵宠物管理器
 *
 * 主目录：userData/pets/（可写，导入/删除）
 * 额外只读来源：~/.codex/pets 或 $CODEX_HOME/pets（扫描引用，不复制）
 * 同 id 时 local 优先
 */
import type { PetInfo, PetSource, PetSpritesheetPayload, PetSpriteVersion } from '@shared/types'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'
import sharp from 'sharp'
import { getLogger } from '../utils/logger'
import {
  getPetsConfigFile,
  getPetsDir as resolvePetsDir,
} from '../utils/paths'

const logger = getLogger('PetsManager')

/** 精灵图参数（Codex 兼容） */
const FRAME_WIDTH = 192
const FRAME_HEIGHT = 208
/** v1 atlas 高 1872（8×9）；v2 高 2288（8×11） */
const V1_ATLAS_HEIGHT = FRAME_HEIGHT * 9
const V2_ATLAS_HEIGHT = FRAME_HEIGHT * 11

/** 预览图缩放尺寸 */
const PREVIEW_WIDTH = 96
const PREVIEW_HEIGHT = 104

const CODEX_DELETE_ERROR = 'Codex 来源宠物不可删除，请在本地导入副本或到 ~/.codex/pets 管理'

interface PetsConfig {
  currentPet: string
}

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
 * 解析宠物目录：local 优先，否则 codex。不复制。
 */
export async function resolvePetDir(petId: string): Promise<string | null> {
  if (!petId)
    return null

  const localDir = path.join(getPetsDir(), petId)
  if (await fs.pathExists(path.join(localDir, 'pet.json')))
    return localDir

  const codexRoot = getCodexPetsDir()
  const codexDir = path.join(codexRoot, petId)
  if (await fs.pathExists(path.join(codexDir, 'pet.json')))
    return codexDir

  return null
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
 * 读取宠物配置
 */
async function getConfig(): Promise<PetsConfig> {
  try {
    const configFile = getConfigFilePath()
    if (await fs.pathExists(configFile)) {
      return await fs.readJson(configFile)
    }
  }
  catch (error) {
    logger.error('读取宠物配置失败', error)
  }
  return { currentPet: '' }
}

/**
 * 保存宠物配置
 */
async function saveConfig(config: PetsConfig): Promise<void> {
  const configFile = getConfigFilePath()
  await fs.writeJson(configFile, config, { spaces: 2 })
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
 */
export async function deletePet(petId: string): Promise<{ success: boolean, error?: string }> {
  try {
    const petsDir = getPetsDir()
    const petPath = path.join(petsDir, petId)

    if (await fs.pathExists(petPath)) {
      await fs.remove(petPath)
      logger.info(`已删除宠物: ${petId}`)

      // 如果删除的是当前宠物，清空选择
      const config = await getConfig()
      if (config.currentPet === petId) {
        config.currentPet = ''
        await saveConfig(config)
      }

      return { success: true }
    }

    // 本地没有：若 Codex 有同 id，明确拒绝删除 Codex 文件
    const codexDir = path.join(getCodexPetsDir(), petId)
    if (await fs.pathExists(codexDir)) {
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
 * 获取本地可写宠物存储目录路径（打开目录 / 导入目标）
 */
export function getPetsFolderPath(): string {
  return getPetsDir()
}
