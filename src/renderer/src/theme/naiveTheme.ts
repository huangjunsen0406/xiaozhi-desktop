import type { GlobalThemeOverrides } from 'naive-ui'

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1677ff',
    primaryColorHover: '#4096ff',
    primaryColorPressed: '#0958d9',
    primaryColorSuppl: '#69b1ff',
    infoColor: '#1677ff',
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, \'Noto Sans\', \'Apple Color Emoji\', \'Segoe UI Emoji\', \'Segoe UI Symbol\', \'Noto Color Emoji\', sans-serif',
    borderRadius: '10px',
  },
  Button: {
    ripple: false,
  },
  Card: {
    borderRadius: '12px',
  },
  Dialog: {
    borderRadius: '12px',
  },
  Input: {
    borderRadius: '10px',
  },
}

export default themeOverrides
