import type { McpPluginsHostConfig } from '../../shared/types/mcp'
import type { IpcResponse } from '../ipc/middleware'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { normalizeMcpHostCapabilities } from '../../shared/mcpCapabilities'
import { registerMcpToolsIpc } from '../ipc/mcpToolsIpc'
import { McpServer } from '../mcp/McpServer'

it('keeps only public capabilities and migrates persisted bubble permission', () => {
  assert.deepEqual(normalizeMcpHostCapabilities(['bubble', 'music_player', 'subtitle', 'subtitle']), ['logger', 'config_readonly', 'subtitle'])
  assert.deepEqual(normalizeMcpHostCapabilities(['bubble'], true), ['logger', 'config_readonly', 'subtitle'])
  assert.deepEqual(normalizeMcpHostCapabilities([]), ['logger', 'config_readonly'])
})

it('passes saved subtitle permission through real IPC, server loading and host access', async () => {
  const tempRoot = path.resolve(os.tmpdir())
  const root = await fs.mkdtemp(path.join(tempRoot, 'xiaozhi-mcp-permissions-'))
  const previousDir = process.env.XIAOZHI_MCP_PLUGINS_DIR
  const runtimeGlobal = globalThis as typeof globalThis & { __mcpRuntime?: unknown }
  const server = McpServer.create()
  let config: McpPluginsHostConfig = { enabled: true, enabledIds: [], disabledIds: [], allowHostGet: ['logger', 'config_readonly'], enforcePrefix: false }
  const handlers = new Map<string, (...args: unknown[]) => Promise<IpcResponse>>()
  runtimeGlobal.__mcpRuntime = {
    container: { mcpServer: server },
    handlers,
    database: {
      getMcpPluginsConfig: () => config,
      setMcpPluginsConfig: (partial: Partial<McpPluginsHostConfig>) => { config = { ...config, ...partial } },
      getMcpDisabledTools: () => [],
    },
  }
  try {
    process.env.XIAOZHI_MCP_PLUGINS_DIR = root
    const pluginRoot = path.join(root, 'test.subtitle')
    await fs.mkdir(pluginRoot)
    await fs.writeFile(path.join(pluginRoot, 'manifest.json'), JSON.stringify({ id: 'test.subtitle', name: 'Subtitle', version: '1', api_version: 1, runtime: 'node-inprocess', entry: './register.cjs' }))
    await fs.writeFile(path.join(pluginRoot, 'register.cjs'), `exports.register = host => {
      const subtitle = host.get('subtitle');
      const bubble = host.get('bubble');
      host.tool('test.permissions', 'inspect capabilities')(() => JSON.stringify({ subtitle: !!subtitle, bubble: !!bubble }));
    }`)
    registerMcpToolsIpc()
    const handler = handlers.get('mcp-tools:set-plugins-config')!
    const saved = await handler({}, { allowHostGet: ['subtitle', 'bubble'] })
    assert.equal(saved.success, true)
    assert.deepEqual(config.allowHostGet, ['logger', 'config_readonly', 'subtitle'])
    assert.deepEqual(JSON.parse(await server.findTool('test.permissions')!.callback({})), { subtitle: true, bubble: false })
    await handler({}, { allowHostGet: [] })
    assert.deepEqual(JSON.parse(await server.findTool('test.permissions')!.callback({})), { subtitle: false, bubble: false })
  }
  finally {
    server.detach()
    if (previousDir === undefined)
      delete process.env.XIAOZHI_MCP_PLUGINS_DIR
    else
      process.env.XIAOZHI_MCP_PLUGINS_DIR = previousDir
    delete runtimeGlobal.__mcpRuntime
    assert.equal(path.dirname(root), tempRoot)
    assert.ok(path.basename(root).startsWith('xiaozhi-mcp-permissions-'))
    await fs.rm(root, { recursive: true, force: true })
  }
})
