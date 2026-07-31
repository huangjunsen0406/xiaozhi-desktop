import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    'examples/mcp_plugins/**',
  ],
  rules: {
    'no-console': 'off',
  },
}, {
  files: ['src/renderer/src/**/*.{ts,tsx,vue}'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        {
          name: 'electron',
          message: 'Renderer must use window.api exposed by preload; do not import electron directly.',
        },
      ],
      patterns: [
        {
          group: ['node:*'],
          message: 'Renderer must not import Node built-ins; put Node/Electron access behind preload.',
        },
      ],
    }],
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[object.name="window"][property.name="electron"]',
        message: 'Renderer must use window.api; window.electron is not exposed.',
      },
      {
        selector: 'MemberExpression[object.name="window"][property.name="api"][optional=true]',
        message: 'window.api is a required preload contract; do not hide preload failures with optional chaining.',
      },
      {
        selector: 'Identifier[name="ipcRenderer"]',
        message: 'Renderer must not access ipcRenderer directly; add a preload API method instead.',
      },
    ],
  },
}, {
  // 项目未接入 vitest；main 下最小 node:test 单测允许 node:test
  files: ['src/main/__tests__/**'],
  rules: {
    'test/no-import-node-test': 'off',
  },
})
