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
