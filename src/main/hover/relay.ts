import type { Rectangle } from 'electron'
import { screen } from 'electron'

function pointInRect(pt: { x: number, y: number }, r: Rectangle) {
  return pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.height
}

function expandRect(r: Rectangle, m: number): Rectangle {
  return { x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m }
}

export class HoverRelay {
  private checkInterval: NodeJS.Timeout | null = null
  private hideTimeout: NodeJS.Timeout | null = null
  private readonly margin = 16

  start(miniBounds: Rectangle, hoverBounds: Rectangle, onKeep: () => void, onHide: () => void) {
    this.stop()
    this.hideTimeout = setTimeout(() => {
      onHide()
      this.stop()
    }, 350)
    this.checkInterval = setInterval(() => {
      const pt = screen.getCursorScreenPoint()
      if (pointInRect(pt, expandRect(hoverBounds, this.margin)) || pointInRect(pt, expandRect(miniBounds, 4))) {
        onKeep()
        this.stop()
      }
    }, 16)
  }

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
