/**
 * MCP 外挂 manifest / 路径校验单测
 *
 * 运行：npx tsx --test src/main/__tests__/mcp-plugin-manifest.test.ts
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { isPlatformAllowed, validateManifest } from '../mcp/plugins/manifest'
import {
  deriveBuiltinToolGroup,
  deriveCatalogGroupKey,
  getGroupLabel,
  getToolLabel,
} from '../mcp/plugins/toolLabels'

describe('validateManifest', () => {
  const root = path.resolve('/tmp/mcp_plugins/com.example.hello')

  it('accepts valid manifest and resolves entry inside root', () => {
    const r = validateManifest({
      id: 'com.example.hello',
      name: 'Hello',
      version: '1.0.0',
      api_version: 1,
      runtime: 'node-inprocess',
      entry: './dist/register.js',
      tool_name_prefix: 'example.',
      enabled_by_default: true,
      call_timeout_ms: 10000,
      platforms: ['darwin', 'win32', 'linux'],
    }, root)

    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.manifest.id, 'com.example.hello')
      assert.equal(r.manifest.runtime, 'node-inprocess')
      assert.equal(r.entryPath, path.resolve(root, './dist/register.js'))
      assert.ok(r.entryPath.startsWith(root) || r.entryPath.includes('com.example.hello'))
    }
  })

  it('rejects entry path escape', () => {
    const r = validateManifest({
      id: 'evil',
      name: 'Evil',
      version: '1.0.0',
      api_version: 1,
      runtime: 'node-inprocess',
      entry: '../../../etc/passwd.js',
    }, root)

    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.match(r.error, /逃逸|escape|路径/i)
    }
  })

  it('rejects wrong api_version', () => {
    const r = validateManifest({
      id: 'x',
      name: 'X',
      version: '1',
      api_version: 99,
      runtime: 'node-inprocess',
      entry: './register.js',
    }, root)
    assert.equal(r.ok, false)
  })

  it('rejects missing id', () => {
    const r = validateManifest({
      name: 'X',
      version: '1',
      api_version: 1,
      runtime: 'node-inprocess',
      entry: './register.js',
    }, root)
    assert.equal(r.ok, false)
  })
})

describe('isPlatformAllowed', () => {
  it('allows all when platforms empty', () => {
    assert.equal(isPlatformAllowed(undefined, 'darwin'), true)
    assert.equal(isPlatformAllowed([], 'win32'), true)
  })

  it('filters by list', () => {
    assert.equal(isPlatformAllowed(['darwin'], 'darwin'), true)
    assert.equal(isPlatformAllowed(['darwin'], 'win32'), false)
  })
})

describe('tool labels / groups', () => {
  it('maps builtin labels and groups', () => {
    assert.equal(getToolLabel('self.music.pause'), '暂停')
    assert.equal(deriveBuiltinToolGroup('self.music.pause'), 'music')
    assert.equal(getGroupLabel('music'), '音乐')
  })

  it('groups external tools by pluginId not name prefix', () => {
    // 两个插件都可用 example.* 前缀，但分组必须分开
    assert.equal(
      deriveCatalogGroupKey('example.hello', 'com.example.hello'),
      'com.example.hello',
    )
    assert.equal(
      deriveCatalogGroupKey('example.now', 'com.example.dayjs-bundle'),
      'com.example.dayjs-bundle',
    )
    assert.equal(
      getGroupLabel('com.example.hello', 'Hello Demo'),
      'Hello Demo',
    )
    assert.equal(
      getGroupLabel('com.example.dayjs-bundle', 'Dayjs Bundle Demo'),
      'Dayjs Bundle Demo',
    )
    // 无 pluginId 时不把 example 写死成 Hello Demo
    assert.notEqual(getGroupLabel('example'), 'Hello Demo')
  })

  it('maps example tool Chinese labels', () => {
    assert.equal(getToolLabel('example.hello'), '打招呼')
    assert.equal(getToolLabel('example.now'), '当前时间')
    assert.equal(getToolLabel('example.add_days'), '日期加减')
  })
})

describe('disabled filter helpers', () => {
  it('filters tool names by disabled set', () => {
    const tools = [
      { name: 'self.music.pause' },
      { name: 'self.music.play' },
      { name: 'example.hello' },
    ]
    const disabled = new Set(['self.music.pause'])
    const enabled = tools.filter(t => !disabled.has(t.name))
    assert.deepEqual(enabled.map(t => t.name), ['self.music.play', 'example.hello'])
  })
})
