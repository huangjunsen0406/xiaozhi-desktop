/** Codex 精灵图版本：v1=8×9，v2=8×11（含 look） */
export type PetSpriteVersion = 1 | 2

/** 宠物来源：本地可写目录 vs Codex 只读目录 */
export type PetSource = 'local' | 'codex'

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
  /** 预览图（base64，第一帧） */
  previewBase64?: string
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
