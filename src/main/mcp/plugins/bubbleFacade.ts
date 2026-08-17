/**
 * 外挂字幕/消息条展示 SDK（Host capability: bubble / subtitle）
 *
 * 复用关怀气泡通道（bubble:show-local → preload → BubbleView），
 * 只做展示、不进聊天历史。依赖 pets / live2d 桌宠 surface。
 * 与 media_player 配合可实现「说书/电台」类插件：播放 + 同步字幕。
 */

import type { BubbleLocalShowPayload } from '@shared/types'
import type { BubbleFacade, BubbleResult, BubbleShowOptions } from './types'
import { BrowserWindow } from 'electron'
import { getLogger } from '../../utils/logger'
import { ensureBubbleWindow, hideBubbleWindow } from '../../windows/windowManager'

const logger = getLogger('BubbleFacade')

const DEFAULT_DURATION_MS = 5000
const MAX_DURATION_MS = 60 * 60 * 1000

function ok(message?: string): BubbleResult {
  return { success: true, message }
}

function fail(message: string): BubbleResult {
  return { success: false, message }
}

/** 校验展示文本：非空字符串，控制长度（防止插件塞超大 payload 刷屏） */
function validateText(text: unknown): { ok: true, text: string } | { ok: false, error: string } {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'text 必须为非空字符串' }
  }
  const trimmed = text.trim()
  if (trimmed.length > 500) {
    return { ok: false, error: 'text 过长（上限 500 字符）' }
  }
  return { ok: true, text: trimmed }
}

function broadcastShow(payload: BubbleLocalShowPayload): boolean {
  // 保证 bubble 窗存在（与关怀 sendLocalReminder 同逻辑；无 surface 时仍兜底广播）
  try {
    ensureBubbleWindow()
  }
  catch (error) {
    logger.warn('ensureBubbleWindow 失败，仍尝试广播', error)
  }

  let sent = false
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed())
      continue
    win.webContents.send('bubble:show-local', payload)
    sent = true
  }
  return sent
}

/**
 * 创建外挂字幕 SDK。
 * 无参数依赖：全部能力由广播通道完成。
 */
export function createBubbleFacade(): BubbleFacade {
  const facade: BubbleFacade = {
    async show(text: unknown, opts?: BubbleShowOptions): Promise<BubbleResult> {
      const checked = validateText(text)
      if (!checked.ok) {
        logger.warn('bubble.show 拒绝', { error: checked.error })
        return fail(checked.error)
      }

      let durationMs = DEFAULT_DURATION_MS
      if (typeof opts?.durationMs === 'number' && Number.isFinite(opts.durationMs)) {
        durationMs = Math.max(1000, Math.min(MAX_DURATION_MS, Math.floor(opts.durationMs)))
      }

      const sent = broadcastShow({
        text: checked.text,
        durationMs,
        source: 'plugin',
      })

      if (sent) {
        logger.info('bubble.show 已广播', { length: checked.text.length, durationMs })
        return ok()
      }
      // 无窗口可广播（桌宠 surface 未就绪等）
      return fail('无可用气泡窗口：请先切换到桌宠（Pets / Live2D）模式')
    },

    async hide(): Promise<BubbleResult> {
      try {
        hideBubbleWindow()
        logger.info('bubble.hide 已执行')
        return ok()
      }
      catch (error) {
        logger.warn('bubble.hide 失败', error)
        return fail(error instanceof Error ? error.message : '隐藏气泡失败')
      }
    },
  }

  return facade
}
