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
  /** 预览图（base64，第一帧） */
  previewBase64?: string
}

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
