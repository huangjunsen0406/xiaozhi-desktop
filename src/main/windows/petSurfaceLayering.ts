/**
 * 桌宠 surface（pets / live2d / bubble）的 macOS 层级与全屏可见策略。
 *
 * 对齐 Codex Pet Surface：
 * - panel + transparent + alwaysOnTop('floating')
 * - setVisibleOnAllWorkspaces(..., skipTransformProcessType: true)  — darwin 关键差异
 * - show 时 reassert alwaysOnTop + moveTop，避免被 IDE 盖住
 *
 * 层级选择：优先 Codex 同款 `floating`；本仓库 mini/hover 用 `status`。
 * 若 Trae/VS Code 等仍盖住桌宠，再考虑升到 `status` / `pop-up-menu`。
 */
import type { BrowserWindow } from 'electron'
import process from 'node:process'

/** macOS 桌宠 surface 使用的 alwaysOnTop level（与 Codex avatar overlay 一致） */
export const PET_SURFACE_ALWAYS_ON_TOP_LEVEL: 'floating' | 'normal'
  = process.platform === 'darwin' ? 'floating' : 'normal'

/**
 * 创建后应用 Codex 风格全工作区可见 + 置顶。
 * darwin 必须带 skipTransformProcessType，否则 panel 在全屏/Stage Manager 下易掉层。
 */
export function applyPetSurfaceWorkspaceAndTop(
  win: BrowserWindow,
  options?: { moveTop?: boolean },
): void {
  if (win.isDestroyed())
    return

  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    })
  }
  else {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  reassertPetSurfaceTop(win, options)
}

/**
 * 显示 / 拖动开始时重新声明置顶，防止 IDE 把桌宠压到侧栏下面。
 */
export function reassertPetSurfaceTop(
  win: BrowserWindow,
  options?: { moveTop?: boolean },
): void {
  if (win.isDestroyed())
    return

  win.setAlwaysOnTop(true, PET_SURFACE_ALWAYS_ON_TOP_LEVEL)
  if (options?.moveTop !== false)
    win.moveTop()
}
