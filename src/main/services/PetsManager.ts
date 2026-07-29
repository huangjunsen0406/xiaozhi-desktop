/**
 * 精灵宠物管理器
 *
 * 宠物统一存储在 userData/pets/ 目录
 * 支持扫描、导入、删除宠物，以及管理当前选中的宠物
 */
import type { PetInfo } from '@shared/types'
import path from 'node:path'
import fs from 'fs-extra'
import sharp from 'sharp'
import { getLogger } from '../utils/logger'
import {
  getPetsConfigFile,
  getPetsDir as resolvePetsDir,
} from '../utils/paths'

const logger = getLogger('PetsManager')

/** 精灵图参数 */
const FRAME_WIDTH = 192
const FRAME_HEIGHT = 208

/** 预览图缩放尺寸 */
const PREVIEW_WIDTH = 96
const PREVIEW_HEIGHT = 104

interface PetsConfig {
  currentPet: string
}

/**
 * 获取宠物存储目录
 */
function getPetsDir(): string {
  return resolvePetsDir()
}

/**
 * 获取宠物配置文件路径
 */
function getConfigFilePath(): string {
  return getPetsConfigFile()
}

/**
 * 确保宠物目录存在
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
 * 解析单个宠物信息
 */
async function parsePetInfo(petDir: string, petId: string): Promise<PetInfo | null> {
  try {
    const petJsonPath = path.join(petDir, 'pet.json')

    if (!(await fs.pathExists(petJsonPath))) {
      logger.warn(`宠物缺少 pet.json: ${petDir}`)
      return null
    }

    const petJson = await fs.readJson(petJsonPath) as {
      id?: string
      displayName?: string
      description?: string
      spritesheetPath?: string
    }

    const spritesheetFileName = petJson.spritesheetPath || 'spritesheet.webp'
    const spritesheetFullPath = path.join(petDir, spritesheetFileName)

    // 检查精灵图是否存在
    if (!(await fs.pathExists(spritesheetFullPath))) {
      logger.warn(`宠物精灵图不存在: ${spritesheetFullPath}`)
      return null
    }

    // 提取预览图
    const previewBase64 = await extractPreview(spritesheetFullPath)

    return {
      id: petJson.id || petId,
      displayName: petJson.displayName || petId,
      description: petJson.description || '',
      spritesheetPath: spritesheetFullPath,
      previewBase64,
    }
  }
  catch (error) {
    logger.error(`解析宠物信息失败: ${petDir}`, error)
    return null
  }
}

/**
 * 扫描所有宠物
 */
export async function scanPets(): Promise<PetInfo[]> {
  const pets: PetInfo[] = []
  const petsDir = getPetsDir()

  try {
    await ensurePetsDir()

    if (await fs.pathExists(petsDir)) {
      const entries = await fs.readdir(petsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const petDir = path.join(petsDir, entry.name)
          const info = await parsePetInfo(petDir, entry.name)
          if (info) {
            pets.push(info)
          }
        }
      }
    }
  }
  catch (error) {
    logger.error('扫描宠物列表失败', error)
  }

  return pets
}

/**
 * 导入宠物（从源文件夹复制 pet.json + spritesheet）
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
    const petJson = await fs.readJson(petJsonPath) as {
      id?: string
      spritesheetPath?: string
    }
    const petId = petJson.id || path.basename(sourcePath)

    // 检查精灵图是否存在
    const spritesheetFileName = petJson.spritesheetPath || 'spritesheet.webp'
    const spritesheetPath = path.join(sourcePath, spritesheetFileName)
    if (!(await fs.pathExists(spritesheetPath))) {
      return { success: false, error: `缺少精灵图文件: ${spritesheetFileName}` }
    }

    // 检查目标是否已存在
    const targetPath = path.join(petsDir, petId)
    if (await fs.pathExists(targetPath)) {
      return { success: false, error: `宠物 "${petId}" 已存在` }
    }

    // 复制宠物文件夹
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
 * 删除宠物
 */
export async function deletePet(petId: string): Promise<{ success: boolean, error?: string }> {
  try {
    const petsDir = getPetsDir()
    const petPath = path.join(petsDir, petId)

    if (!(await fs.pathExists(petPath))) {
      return { success: false, error: '宠物不存在' }
    }

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
 * 设置当前宠物
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
 * 获取宠物存储目录路径
 */
export function getPetsFolderPath(): string {
  return getPetsDir()
}
