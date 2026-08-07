/**
 * 媒体播放 SDK / Host capabilities 单测
 *
 * 运行：npx tsx --test src/main/__tests__/mcp-media-player-facade.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMcpHost } from '../mcp/plugins/host'
import { validateMediaUrl } from '../mcp/plugins/mediaPlayerFacade'
import { PropertyList } from '../mcp/types'

describe('validateMediaUrl', () => {
  it('accepts https and http', () => {
    assert.equal(validateMediaUrl('https://cdn.example.com/a.m4a').ok, true)
    assert.equal(validateMediaUrl('http://example.com/a.mp3').ok, true)
  })

  it('accepts absolute local paths', () => {
    assert.equal(validateMediaUrl('/Users/me/Music/book.m4a').ok, true)
    assert.equal(validateMediaUrl('C:\\Music\\a.mp3').ok, true)
    assert.equal(validateMediaUrl('D:/audio/b.mp3').ok, true)
  })

  it('rejects empty, relative, and bad schemes', () => {
    assert.equal(validateMediaUrl('').ok, false)
    assert.equal(validateMediaUrl('  ').ok, false)
    assert.equal(validateMediaUrl('relative/a.mp3').ok, false)
    assert.equal(validateMediaUrl('javascript:alert(1)').ok, false)
    assert.equal(validateMediaUrl('file:///tmp/a.mp3').ok, false)
  })
})

describe('createMcpHost capabilities', () => {
  const noopAdd = () => {}

  it('returns logger and config_readonly when allowed', () => {
    const host = createMcpHost({
      pluginId: 'test',
      allowHostGet: ['logger', 'config_readonly'],
      enforcePrefix: false,
      callTimeoutMs: 1000,
      onAddTool: noopAdd,
    })
    assert.ok(host.get('logger'))
    // config may be empty object if DB not ready
    assert.equal(typeof host.get('config_readonly'), 'object')
  })

  it('denies media_player when not in allowHostGet', () => {
    const facade = { playUrl: async () => ({ success: true }) }
    const host = createMcpHost({
      pluginId: 'test',
      allowHostGet: ['logger', 'config_readonly'],
      enforcePrefix: false,
      callTimeoutMs: 1000,
      onAddTool: noopAdd,
      capabilities: { media_player: facade, music_player: facade },
    })
    assert.equal(host.get('media_player'), undefined)
    assert.equal(host.get('music_player'), undefined)
  })

  it('returns media_player facade when allowed and injected', () => {
    const facade = {
      playUrl: async () => ({ success: true, message: 'ok' }),
      pause: async () => ({ success: true }),
    }
    const host = createMcpHost({
      pluginId: 'test',
      allowHostGet: ['logger', 'config_readonly', 'media_player', 'music_player'],
      enforcePrefix: false,
      callTimeoutMs: 1000,
      onAddTool: noopAdd,
      capabilities: { media_player: facade, music_player: facade },
    })
    assert.equal(host.get('media_player'), facade)
    assert.equal(host.get('music_player'), facade)
  })

  it('returns undefined for allowed key without capability', () => {
    const host = createMcpHost({
      pluginId: 'test',
      allowHostGet: ['media_player'],
      enforcePrefix: false,
      callTimeoutMs: 1000,
      onAddTool: noopAdd,
      capabilities: {},
    })
    assert.equal(host.get('media_player'), undefined)
  })

  it('still registers tools via host.tool', () => {
    const names: string[] = []
    const host = createMcpHost({
      pluginId: 'test',
      allowHostGet: ['logger'],
      enforcePrefix: false,
      callTimeoutMs: 5000,
      onAddTool: (t) => {
        names.push(t.name)
      },
    })
    host.tool('example.x', 'desc', [])(async () => 'ok')
    assert.deepEqual(names, ['example.x'])
    assert.ok(PropertyList) // type module loads
  })
})
