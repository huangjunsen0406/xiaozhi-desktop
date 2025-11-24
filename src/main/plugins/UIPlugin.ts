import type { JsonMessage } from '../types/protocol'
import { webContents } from 'electron'
import { Plugin } from './Plugin'

/**
 * UI 插件
 * 负责将服务器消息广播到渲染进程，用于 UI 更新（表情、对话内容等）
 */
export class UIPlugin extends Plugin {
  readonly name = 'ui'
  readonly priority = 60 // UI 插件在其他插件之后初始化

  readonly metadata = {
    name: 'UIPlugin',
    version: '1.0.0',
    description: '视图处理插件，负责文本、表情、图片渲染',
    author: 'Junsen',
  }

  /**
   * 处理收到的 JSON 消息
   */
  async onIncomingJson(message: JsonMessage): Promise<void> {
    // 广播服务器消息到所有渲染进程（排除后台音频窗口）
    this.broadcastToRenderer('server:message', message)
  }

  /**
   * 广播图片到渲染进程（供其他插件调用）
   * @param imageBase64 - base64 编码的图片数据
   * @param sourceType - 图片来源类型：screenshot 或 camera
   */
  broadcastImage(imageBase64: string, sourceType: 'screenshot' | 'camera'): void {
    const payload = {
      type: sourceType,
      imageBase64,
      timestamp: Date.now(),
    }

    this.broadcastToRenderer('chat:image-captured', payload)
    console.log(`[UIPlugin] 已广播 ${sourceType} 图片`)
  }

  /**
   * 广播主题变更到渲染进程（供其他插件调用）
   * @param theme - 主题模式：light, dark, 或 auto
   */
  broadcastTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.broadcastToRenderer('theme:set', theme)
    console.log(`[UIPlugin] 已广播主题变更: ${theme}`)
  }

  /**
   * 广播表情变更到渲染进程（供其他插件调用）
   * @param emotionType - 表情类型
   */
  broadcastEmotion(emotionType: string): void {
    this.broadcastToRenderer('emotion:changed', emotionType)
    console.log(`[UIPlugin] 已广播表情变更: ${emotionType}`)
  }

  /**
   * 广播消息到渲染进程
   * @param channel - IPC 通道名称
   * @param data - 要发送的数据
   */
  private broadcastToRenderer(channel: string, data: unknown): void {
    const audioPlugin = this.app?.getAudioPlugin()
    const backgroundAudioWindow = audioPlugin?.getBackgroundAudioWindow()

    // 获取所有 webContents
    const allWebContents = webContents.getAllWebContents()

    allWebContents.forEach((wc) => {
      // 跳过后台音频窗口
      if (backgroundAudioWindow && wc.id === backgroundAudioWindow.webContents.id) {
        return
      }

      // 跳过已销毁的窗口
      if (wc.isDestroyed()) {
        return
      }

      try {
        wc.send(channel, data)
      }
      catch (error) {
        console.error(`[UIPlugin] 向窗口 ${wc.id} 广播消息失败:`, error)
      }
    })
  }
}
