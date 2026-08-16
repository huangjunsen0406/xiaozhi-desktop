/** Codex 精灵图版本：v1=8×9，v2=8×11（含 look） */
export type PetSpriteVersion = 1 | 2

/** 宠物来源：本地可写目录 vs Codex 只读目录 */
export type PetSource = 'local' | 'codex'

/**
 * 桌宠显示宽度（CSS px），对齐 Codex `avatar-overlay-mascot-width-px`。
 * 全局一份，同时作用于 Sprite Pets 与 Live2D。
 */
export const PET_DISPLAY_WIDTH_MIN = 80
export const PET_DISPLAY_WIDTH_MAX = 224
export const PET_DISPLAY_WIDTH_DEFAULT = 112

/** 精灵图单元格宽高（Codex atlas cell） */
export const PET_SPRITE_FRAME_W = 192
export const PET_SPRITE_FRAME_H = 208
/** v1 atlas 高 1872（8×9）；v2 高 2288（8×11） */
export const PET_SPRITE_V1_ATLAS_HEIGHT = PET_SPRITE_FRAME_H * 9
export const PET_SPRITE_V2_ATLAS_HEIGHT = PET_SPRITE_FRAME_H * 11

/**
 * 将 pet.json 中的版本字段规范为 1 | 2
 */
export function normalizeSpriteVersion(value: unknown): PetSpriteVersion | undefined {
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
export function inferSpriteVersionFromHeight(height: number): PetSpriteVersion {
  if (height >= PET_SPRITE_V2_ATLAS_HEIGHT - PET_SPRITE_FRAME_H / 2)
    return 2
  if (height >= PET_SPRITE_V1_ATLAS_HEIGHT - PET_SPRITE_FRAME_H / 2)
    return 1
  const rows = Math.max(1, Math.round(height / PET_SPRITE_FRAME_H))
  return rows >= 11 ? 2 : 1
}

/**
 * 解析最终 sprite 版本：显式 manifest > 高度推断 > 默认 1。
 * 高度未知（sharp 不可用）时回退 1，不阻断列表扫描。
 */
export function resolveSpriteVersion(
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

/** Live2D 在默认 displayWidth=112 时的经典视口 */
export const LIVE2D_BASE_VIEWPORT_W = 200
export const LIVE2D_BASE_VIEWPORT_H = 400

/**
 * 将用户/配置中的显示宽度夹到 Codex 合法区间。
 */
export function clampPetDisplayWidth(width: number): number {
  if (!Number.isFinite(width))
    return PET_DISPLAY_WIDTH_DEFAULT
  return Math.round(
    Math.min(PET_DISPLAY_WIDTH_MAX, Math.max(PET_DISPLAY_WIDTH_MIN, width)),
  )
}

/**
 * 精灵显示高度：ceil(width * 208/192)，与 Codex mascot 纵横比一致。
 */
export function petDisplayHeightFromWidth(widthPx: number): number {
  const w = clampPetDisplayWidth(widthPx)
  return Math.ceil(w * PET_SPRITE_FRAME_H / PET_SPRITE_FRAME_W)
}

/**
 * Live2D 视口：按 displayWidth / 112 相对默认 200×400 缩放。
 */
export function live2dViewportFromDisplayWidth(widthPx: number): { width: number, height: number } {
  const w = clampPetDisplayWidth(widthPx)
  return {
    width: Math.round(LIVE2D_BASE_VIEWPORT_W * w / PET_DISPLAY_WIDTH_DEFAULT),
    height: Math.round(LIVE2D_BASE_VIEWPORT_H * w / PET_DISPLAY_WIDTH_DEFAULT),
  }
}

/** pets-config.json 持久化结构 */
export interface PetsConfigFile {
  currentPet: string
  /** 显示宽度 CSS px；缺省 112 */
  displayWidthPx?: number
}

/** 精灵宠物信息 */
export interface PetInfo {
  /** 宠物唯一标识 */
  id: string
  /** 显示名称 */
  displayName: string
  /** 描述 */
  description: string
  /** 精灵图路径 */
  spritesheetPath: string
  /**
   * 精灵图协议版本。
   * 1：标准 9 行动画；2：11 行（rows 9–10 为 16 向 look）。
   * 缺省时由主进程按 atlas 高度推断，再回退 1。
   */
  spriteVersionNumber: PetSpriteVersion
  /** 预览图（base64，第一帧）。sharp 可用时才有 */
  previewBase64?: string
  /**
   * 精灵图自定义协议，设置页在无 previewBase64 时裁第一帧当缩略图。
   * 例：sprite-pet://usagi/spritesheet.webp
   */
  previewUrl?: string
  /**
   * 资源来源。
   * - local：userData/pets（可导入/删除）
   * - codex：~/.codex/pets 或 $CODEX_HOME/pets（只读扫描，不复制）
   * 同 id 并存时 local 优先。
   */
  source?: PetSource
}

/**
 * `pets:get-spritesheet` 结构化返回：dataUrl + 版本 + 像素尺寸。
 * 渲染进程据此选择动画行与 look 能力。
 */
export interface PetSpritesheetPayload {
  dataUrl: string
  spriteVersionNumber: PetSpriteVersion
  width: number
  height: number
}

/** Codex 标准动画状态名（rows 0–8；look 为静态格） */
export type PetAnimationState
  = | 'idle'
    | 'running-right'
    | 'running-left'
    | 'waving'
    | 'jumping'
    | 'failed'
    | 'waiting'
    | 'running'
    | 'review'

/** 桌宠壳 surface（多窗贴内容） */
export type PetSurfaceId = 'pets' | 'live2d' | 'bubble'

/**
 * 渲染进程测量的可见内容尺寸（CSS px）。
 * 主进程据此 setBounds，使窗紧贴内容、空隙可点穿。
 */
export interface PetSurfaceContentSize {
  width: number
  height: number
  /**
   * 角色头顶相对窗口顶边的偏移（CSS px）。
   * 仅 pets / live2d 有意义；用于气泡 anchor。
   */
  anchorOffsetY?: number
}
