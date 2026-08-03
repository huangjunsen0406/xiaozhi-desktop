/**
 * 桌宠本地关怀提醒（无语音、不写对话、仅气泡展示）
 */

/** 可开关的提醒类型（meal 本任务不出现在 UI） */
export type CareReminderTypeId = 'water' | 'walk' | 'eyes' | 'sleep'

/** 持久化配置（userData/care-reminders.json） */
export interface CareReminderConfig {
  /** 总开关，默认 true */
  enabled: boolean
  /** 喝水 */
  water: boolean
  /** 起来活动（含伸展文案池） */
  walk: boolean
  /** 用眼休息 */
  eyes: boolean
  /** 休息睡觉（夜间） */
  sleep: boolean
}

/** 默认全部开启 */
export const DEFAULT_CARE_REMINDER_CONFIG: CareReminderConfig = {
  enabled: true,
  water: true,
  walk: true,
  eyes: true,
  sleep: true,
}

/**
 * 气泡本地展示 payload（非服务端消息）
 * source 固定 'reminder'，便于 BubbleView 与会话气泡区分优先级
 */
export interface BubbleLocalShowPayload {
  text: string
  /** 展示时长，默认约 5000ms */
  durationMs?: number
  source: 'reminder'
}

export type CareReminderConfigUpdate = Partial<CareReminderConfig>

/**
 * 临时演示一轮提醒的结果（绕过间隔/静默/总开关，仅预览）
 */
export interface CareReminderDemoResult {
  /** 是否已启动演示 */
  started: boolean
  /** 给人看的说明（成功或失败原因） */
  message: string
}
