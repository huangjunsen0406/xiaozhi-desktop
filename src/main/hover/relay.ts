import type { Rectangle } from 'electron'
import { screen } from 'electron'

function pointInRect(pt: { x: number, y: number }, r: Rectangle): boolean {
  return pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.height
}

function expandRect(r: Rectangle, m: number): Rectangle {
  return { x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m }
}

/**
 * 悬浮窗中继控制器：鼠标离开锚点/悬浮窗后延迟隐藏，若回到容错区内则取消。
 */
export class HoverRelay {
  private checkInterval: NodeJS.Timeout | null = null
  private hideTimeout: NodeJS.Timeout | null = null
  private readonly margin = 16

  start(anchorBounds: Rectangle, hoverBounds: Rectangle, onHide: () => void): void {
    this.stop()
    this.hideTimeout = setTimeout(() => {
      onHide()
      this.stop()
    }, 350)
    this.checkInterval = setInterval(() => {
      const pt = screen.getCursorScreenPoint()
      if (pointInRect(pt, expandRect(hoverBounds, this.margin)) || pointInRect(pt, expandRect(anchorBounds, 4)))
        this.stop()
    }, 16)
  }

  stop(): void {
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
