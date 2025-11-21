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
    this.broadcastToRenderer(message)
  }

  /**
   * 广播消息到渲染进程
   */
  private broadcastToRenderer(message: JsonMessage): void {
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
        wc.send('server:message', message)
      }
      catch (error) {
        console.error(`[UIPlugin] 向窗口 ${wc.id} 广播消息失败:`, error)
      }
    })
  }
}
