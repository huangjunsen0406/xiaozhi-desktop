import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    'no-console': 'off',
  },
}, {
  // 项目未接入 vitest；main 下最小 node:test 单测允许 node:test
  files: ['src/main/__tests__/**'],
  rules: {
    'test/no-import-node-test': 'off',
  },
})
