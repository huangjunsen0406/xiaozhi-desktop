/** Application presentation modes shared by main, preload and renderer. */
export const DISPLAY_MODES = ['main', 'mini', 'chat', 'live2d', 'pets'] as const

export type DisplayMode = (typeof DISPLAY_MODES)[number]

export function isDisplayMode(value: unknown): value is DisplayMode {
  return typeof value === 'string' && (DISPLAY_MODES as readonly string[]).includes(value)
}
