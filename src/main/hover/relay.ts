import type { Rectangle } from 'electron'
import { screen } from 'electron'

/**
 * 判断点是否在矩形区域内
 * @param pt 点坐标 { x, y }
 * @param pt.x 点的 x 坐标
 * @param pt.y 点的 y 坐标
 * @param r 矩形区域
 * @returns boolean 点是否在矩形内
 */
function pointInRect(pt: { x: number, y: number }, r: Rectangle) {
  return pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.height
}

/**
 * 扩展矩形区域
 * 在原矩形的四周增加指定边距，返回新的矩形
 * @param r 原始矩形
 * @param m 扩展边距（像素）
 * @returns Rectangle 扩展后的矩形
 */
function expandRect(r: Rectangle, m: number): Rectangle {
  return { x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m }
}

/**
 * 悬浮窗中继控制器
 *
 * 用于管理悬浮窗的显示/隐藏逻辑：
 * - 当鼠标离开主窗口和悬浮窗时，启动延迟隐藏定时器
 * - 定期检测鼠标位置，如果鼠标回到扩展区域内则取消隐藏
 * - 提供启动和停止监听的方法
 */
export class HoverRelay {
  /** 鼠标位置检测定时器 */
  private checkInterval: NodeJS.Timeout | null = null
  /** 延迟隐藏定时器 */
  private hideTimeout: NodeJS.Timeout | null = null
  /** 悬浮窗扩展边距（像素），用于容错 */
  private readonly margin = 16

  /**
   * 启动中继监听
   *
   * 工作流程：
   * 1. 先停止之前的监听（如果有）
   * 2. 启动 350ms 延迟隐藏定时器
   * 3. 每 16ms 检测一次鼠标位置（约 60fps）
   * 4. 如果鼠标进入主窗口或悬浮窗的扩展区域，则调用 onKeep 并停止监听
   * 5. 如果 350ms 内鼠标未回到区域内，则调用 onHide 并停止监听
   *
   * @param miniBounds 主窗口的位置和尺寸
   * @param hoverBounds 悬浮窗的位置和尺寸
   * @param onKeep 鼠标回到区域内时的回调函数
   * @param onHide 延迟隐藏时的回调函数
   */
  start(miniBounds: Rectangle, hoverBounds: Rectangle, onKeep: () => void, onHide: () => void) {
    this.stop()
    // 350ms 后自动隐藏
    this.hideTimeout = setTimeout(() => {
      onHide()
      this.stop()
    }, 350)
    // 每 16ms 检测一次鼠标位置
    this.checkInterval = setInterval(() => {
      const pt = screen.getCursorScreenPoint()
      // 检查鼠标是否在扩展区域内（悬浮窗扩展 16px，主窗口扩展 4px）
      if (pointInRect(pt, expandRect(hoverBounds, this.margin)) || pointInRect(pt, expandRect(miniBounds, 4))) {
        onKeep()
        this.stop()
      }
    }, 16)
  }

  /**
   * 停止中继监听
   * 清除所有定时器和检测任务
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
  }
}
