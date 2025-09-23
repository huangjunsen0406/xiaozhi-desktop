import type { Rectangle } from 'electron'

export type HoverMode = 'right' | 'left' | 'down' | 'up'

export interface PositionResult {
  x: number
  y: number
  mode: HoverMode
}

export function computeHoverPosition(
  miniBounds: Rectangle,
  hoverSize: { width: number, height: number },
  workArea: Rectangle,
  offset = 8,
): PositionResult {
  const hw = hoverSize.width
  const hh = hoverSize.height
  const workLeft = workArea.x
  const workRight = workArea.x + workArea.width
  const workTop = workArea.y
  const workBottom = workArea.y + workArea.height
  const miniRight = miniBounds.x + miniBounds.width
  const miniBottom = miniBounds.y + miniBounds.height
  const miniCenterX = miniBounds.x + Math.floor(miniBounds.width / 2)
  const miniCenterY = miniBounds.y + Math.floor(miniBounds.height / 2)
  const spaceRight = workRight - miniRight
  const spaceLeft = miniBounds.x - workLeft
  const spaceBelow = workBottom - miniBottom
  const spaceAbove = miniBounds.y - workTop
  const needWidth = hw + offset
  const needHeight = hh + offset

  let mode: HoverMode
  if (spaceRight >= needWidth || (spaceRight >= spaceLeft && spaceRight > 0))
    mode = 'right'
  else if (spaceLeft >= needWidth)
    mode = 'left'
  else if (spaceBelow >= needHeight || (spaceBelow >= spaceAbove && spaceBelow > 0))
    mode = 'down'
  else
    mode = 'up'

  let x: number
  let y: number
  if (mode === 'right') {
    x = miniRight + offset
    y = Math.min(Math.max(miniCenterY - Math.floor(hh / 2), workTop), workBottom - hh)
  }
  else if (mode === 'left') {
    x = miniBounds.x - hw - offset
    y = Math.min(Math.max(miniCenterY - Math.floor(hh / 2), workTop), workBottom - hh)
  }
  else if (mode === 'down') {
    y = miniBottom + offset
    x = Math.min(Math.max(miniCenterX - Math.floor(hw / 2), workLeft), workRight - hw)
  }
  else { // up
    y = miniBounds.y - hh - offset
    x = Math.min(Math.max(miniCenterX - Math.floor(hw / 2), workLeft), workRight - hw)
  }

  return { x, y, mode }
}
