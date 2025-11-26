const isMac = navigator.platform.toUpperCase().includes('MAC')
const isWin = navigator.platform.toUpperCase().includes('WIN')

/**
 * 将 Electron accelerator 转换为显示格式
 */
export function formatShortcutDisplay(accelerator: string | null): string {
  if (!accelerator)
    return '未设置'

  if (isMac) {
    return accelerator
      .replace('CommandOrControl', '⌘')
      .replace('Command', '⌘')
      .replace('Cmd', '⌘')
      .replace('Shift', '⇧')
      .replace('Alt', '⌥')
      .replace('Option', '⌥')
      .replace('Control', '⌃')
      .replace('Ctrl', '⌃')
      .replace('Backspace', '⌫')
      .replace('Delete', '⌦')
      .replace('Enter', '↩')
      .replace('Return', '↩')
      .replace('Esc', '⎋')
      .replace('Escape', '⎋')
      .replace('Tab', '⇥')
      .replace('Up', '↑')
      .replace('Down', '↓')
      .replace('Left', '←')
      .replace('Right', '→')
      .replace(/\+/g, ' + ') // macOS 也显示 + 间隔
  }
  else if (isWin) {
    return accelerator
      .replace('CommandOrControl', 'Ctrl')
      .replace('Command', 'Ctrl')
      .replace('Alt', 'Alt')
      .replace('Shift', 'Shift')
      .replace('Control', 'Ctrl')
      .replace('Plus', '+')
      .replace(/\+/g, ' + ') // Windows 习惯加空格
  }
  else {
    // Linux
    return accelerator
      .replace('CommandOrControl', 'Ctrl')
      .replace('Command', 'Ctrl')
      .replace('Super', 'Super')
      .replace(/\+/g, ' + ')
  }
}

/**
 * 将按键事件转换为 Electron accelerator
 */
export function convertEventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []

  // 修饰键
  if (e.ctrlKey || e.metaKey) {
    parts.push('CommandOrControl')
  }
  if (e.shiftKey) {
    parts.push('Shift')
  }
  if (e.altKey) {
    parts.push('Alt')
  }

  // 普通键
  if (!['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) {
    const keyMap: Record<string, string> = {
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
      ' ': 'Space',
      ',': 'Comma',
      '.': 'Period',
      '/': 'Slash',
      '\\': 'Backslash',
      '[': 'BracketLeft',
      ']': 'BracketRight',
      '=': 'Equal',
      '-': 'Minus',
      '`': 'Backquote',
      ';': 'Semicolon',
      '\'': 'Quote',
    }

    const key = keyMap[e.key] || e.key.toUpperCase()
    parts.push(key)
  }

  // 至少要有修饰键 + 普通键
  if (parts.length < 2) {
    return null
  }

  return parts.join('+')
}
