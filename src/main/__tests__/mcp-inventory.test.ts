import type { McpPluginsHostConfig } from '../../shared/types/mcp'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it } from 'node:test'
import { McpServer } from '../mcp/McpServer'

it('lists and deletes broken, disabled, zero-tool and duplicate-id packages by directory identity', async () => {
  const tempRoot = await fs.realpath(os.tmpdir())
  const root = await fs.mkdtemp(path.join(tempRoot, 'xiaozhi-mcp-inventory-'))
  const previousDir = process.env.XIAOZHI_MCP_PLUGINS_DIR
  const runtimeGlobal = globalThis as typeof globalThis & { __mcpRuntime?: unknown }
  const config: McpPluginsHostConfig = { enabled: true, enabledIds: [], disabledIds: ['disabled'], allowHostGet: [], enforcePrefix: false }
  runtimeGlobal.__mcpRuntime = { database: { getMcpPluginsConfig: () => config, getMcpDisabledTools: () => [], setMcpDisabledTools: () => {} } }
  const server = McpServer.create()
  async function plugin(directoryName: string, id: string, code: string) {
    const directory = path.join(root, directoryName)
    await fs.mkdir(directory)
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ id, name: id, version: '1', api_version: 1, runtime: 'node-inprocess', entry: './register.cjs' }))
    await fs.writeFile(path.join(directory, 'register.cjs'), code)
  }
  try {
    process.env.XIAOZHI_MCP_PLUGINS_DIR = root
    await plugin('a-empty', 'empty', 'exports.register = () => {}')
    await plugin('b-duplicate', 'empty', 'exports.register = () => {}')
    await plugin('c-broken', 'broken', 'exports.register = () => { throw new Error(\'broken plugin\') }')
    await plugin('d-disabled', 'disabled', 'exports.register = () => {}')
    await fs.mkdir(path.join(root, 'invalid'))
    await server.loadExternalPlugins()
    const items = await server.getInstalledPlugins()
    assert.deepEqual(items.map(item => [item.directoryName, item.status, item.toolCount]), [
      ['a-empty', 'loaded', 0],
      ['b-duplicate', 'failed', 0],
      ['c-broken', 'failed', 0],
      ['d-disabled', 'skipped', 0],
      ['invalid', 'failed', 0],
    ])
    assert.match(items[2].reason!, /broken plugin/)
    await server.deleteInstalledPlugin('b-duplicate')
    assert.ok(server.getPluginRegistry().getPlugin('empty'))
    await server.deleteInstalledPlugin('c-broken')
    await server.deleteInstalledPlugin('invalid')
    await assert.rejects(server.deleteInstalledPlugin('../outside'), /非法/)
    assert.deepEqual((await server.getInstalledPlugins()).map(item => item.directoryName), ['a-empty', 'd-disabled'])
  }
  finally {
    await server.detach()
    if (previousDir === undefined)
      delete process.env.XIAOZHI_MCP_PLUGINS_DIR
    else
      process.env.XIAOZHI_MCP_PLUGINS_DIR = previousDir
    delete runtimeGlobal.__mcpRuntime
    assert.equal(path.dirname(root), tempRoot)
    assert.ok(path.basename(root).startsWith('xiaozhi-mcp-inventory-'))
    await fs.rm(root, { recursive: true, force: true })
  }
})
