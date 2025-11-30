import type { Buffer } from 'node:buffer'
import type { Application } from '../services/Application'
import { BrowserWindow } from 'electron'
import { getLogger } from '../utils/logger'

import { Plugin } from './Plugin'

const logger = getLogger('Live2DPlugin')

/**
 * Live2D 插件
 * 负责 Live2D 口型同步
 *
 * 职责：
 * - 接收服务端返回的 Opus 音频数据
 * - 解码 Opus → PCM
 * - 计算音频音量 (RMS)
 * - 发送音量数据到 Live2D 窗口，控制口型同步
 */
export class Live2DPlugin extends Plugin {
  readonly name = 'Live2DPlugin'
  readonly priority = 15 // 在 AudioPlugin (10) 之后，MCP (20) 之前

  readonly metadata = {
    name: 'Live2DPlugin',
    version: '1.0.0',
    description: 'Live2D 口型同步插件',
    author: 'Junsen',
  }

  private live2dWindow: BrowserWindow | null = null

  /**
   * 插件初始化
   */
  async setup(app: Application): Promise<void> {
    await super.setup(app)
    logger.info('初始化...')
  }

  /**
   * 插件启动
   */
  async start(): Promise<void> {
    await super.start()
    logger.info('启动完成')
  }

  /**
   * 接收已解码的 PCM 音频数据
   * @param pcmBuffer 已解码的 PCM 数据
   */
  onDecodedAudio(pcmBuffer: Buffer): void {
    try {
      // 1. 获取 Live2D 窗口
      if (!this.live2dWindow || this.live2dWindow.isDestroyed()) {
        this.live2dWindow = this.findLive2DWindow()
        if (!this.live2dWindow) {
          // Live2D 窗口未打开，跳过
          return
        }
      }

      // 2. 计算音量 (RMS - Root Mean Square)
      const volume = this.calculateVolume(pcmBuffer)

      // 3. 发送音量到 Live2D 窗口
      if (!this.live2dWindow.isDestroyed()) {
        this.live2dWindow.webContents.send('live2d:audio-volume', volume)
      }
    }
    catch (error) {
      // 静默处理错误，不影响主流程
      logger.error('处理音频数据失败', error)
    }
  }

  /**
   * 查找 Live2D 窗口
   */
  private findLive2DWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows()
    return windows.find(win =>
      !win.isDestroyed() && win.webContents.getURL().includes('live2d'),
    ) || null
  }

  /**
   * 计算音频音量 (RMS)
   * @param pcmBuffer PCM 数据 (Int16)
   * @returns 音量值 (0-1)
   */
  private calculateVolume(pcmBuffer: Buffer): number {
    try {
      // Buffer → Int16Array
      const int16Array = new Int16Array(
        pcmBuffer.buffer,
        pcmBuffer.byteOffset,
        pcmBuffer.byteLength / 2,
      )

      if (int16Array.length === 0) {
        return 0
      }

      // 计算 RMS (Root Mean Square)
      let sumSquares = 0
      for (let i = 0; i < int16Array.length; i++) {
        // 归一化到 [-1, 1]
        const normalized = int16Array[i] / 32768
        sumSquares += normalized * normalized
      }

      const rms = Math.sqrt(sumSquares / int16Array.length)

      // 放大并限制到 [0, 1] 范围
      // 乘以 3 是为了让音量更明显
      const volume = Math.min(1, rms * 3)

      return volume
    }
    catch (error) {
      logger.error('计算音量失败', error)
      return 0
    }
  }

  /**
   * 插件停止
   */
  async stop(): Promise<void> {
    await super.stop()
    this.live2dWindow = null
    logger.info('已停止')
  }
}
