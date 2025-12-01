import type { Rectangle } from 'electron'

/**
 * 悬浮窗显示位置模式
 * - right: 在主窗口右侧显示
 * - left: 在主窗口左侧显示
 * - down: 在主窗口下方显示
 * - up: 在主窗口上方显示
 */
export type HoverMode = 'right' | 'left' | 'down' | 'up'

/**
 * 位置计算结果
 */
export interface PositionResult {
  /** 悬浮窗 X 坐标 */
  x: number
  /** 悬浮窗 Y 坐标 */
  y: number
  /** 悬浮窗显示模式（方向） */
  mode: HoverMode
}

/**
 * 计算悬浮窗的最佳显示位置
 *
 * 算法逻辑：
 * 1. 优先级：右侧 > 左侧 > 下方 > 上方
 * 2. 计算主窗口四个方向的可用空间
 * 3. 根据可用空间选择最佳显示方向
 * 4. 计算具体坐标，确保悬浮窗不会超出工作区边界
 * 5. 对于左右模式，悬浮窗垂直居中对齐主窗口
 * 6. 对于上下模式，悬浮窗水平居中对齐主窗口
 *
 * @param   miniBounds - 主窗口的位置和尺寸信息
 * @param   hoverSize - 悬浮窗的尺寸 { width, height }
 * @param   hoverSize.width - 悬浮窗宽度
 * @param   hoverSize.height - 悬浮窗高度
 * @param   workArea - 屏幕工作区域（排除任务栏等）
 * @param   offset - 悬浮窗与主窗口之间的间距，默认 8 像素
 * @returns PositionResult 包含坐标和显示模式的结果对象
 */
export function computeHoverPosition(
  miniBounds: Rectangle,
  hoverSize: { width: number, height: number },
  workArea: Rectangle,
  offset = 8,
): PositionResult {
  // 悬浮窗尺寸
  const hw = hoverSize.width
  const hh = hoverSize.height

  // 工作区边界
  const workLeft = workArea.x
  const workRight = workArea.x + workArea.width
  const workTop = workArea.y
  const workBottom = workArea.y + workArea.height

  // 主窗口边界和中心点
  const miniRight = miniBounds.x + miniBounds.width
  const miniBottom = miniBounds.y + miniBounds.height
  const miniCenterX = miniBounds.x + Math.floor(miniBounds.width / 2)
  const miniCenterY = miniBounds.y + Math.floor(miniBounds.height / 2)

  // 计算各方向的可用空间
  const spaceRight = workRight - miniRight
  const spaceLeft = miniBounds.x - workLeft
  const spaceBelow = workBottom - miniBottom
  const spaceAbove = miniBounds.y - workTop

  // 悬浮窗所需空间（包括间距）
  const needWidth = hw + offset
  const needHeight = hh + offset

  // 根据可用空间确定显示模式
  let mode: HoverMode
  if (spaceRight >= needWidth || (spaceRight >= spaceLeft && spaceRight > 0))
    mode = 'right' // 优先右侧
  else if (spaceLeft >= needWidth)
    mode = 'left' // 其次左侧
  else if (spaceBelow >= needHeight || (spaceBelow >= spaceAbove && spaceBelow > 0))
    mode = 'down' // 再次下方
  else
    mode = 'up' // 最后上方

  // 根据显示模式计算具体坐标
  let x: number
  let y: number
  if (mode === 'right') {
    x = miniRight + offset
    // 垂直居中对齐，同时确保不超出工作区
    y = Math.min(Math.max(miniCenterY - Math.floor(hh / 2), workTop), workBottom - hh)
  }
  else if (mode === 'left') {
    x = miniBounds.x - hw - offset
    // 垂直居中对齐，同时确保不超出工作区
    y = Math.min(Math.max(miniCenterY - Math.floor(hh / 2), workTop), workBottom - hh)
  }
  else if (mode === 'down') {
    y = miniBottom + offset
    // 水平居中对齐，同时确保不超出工作区
    x = Math.min(Math.max(miniCenterX - Math.floor(hw / 2), workLeft), workRight - hw)
  }
  else { // up
    y = miniBounds.y - hh - offset
    // 水平居中对齐，同时确保不超出工作区
    x = Math.min(Math.max(miniCenterX - Math.floor(hw / 2), workLeft), workRight - hw)
  }

  return { x, y, mode }
}
