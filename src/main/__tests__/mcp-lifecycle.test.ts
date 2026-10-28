import type { McpTool } from '../mcp/types'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { createMcpHost } from '../mcp/plugins/host'
import { McpPluginLifecycle } from '../mcp/plugins/lifecycle'
import { loadMcpPluginsFromConfig } from '../mcp/plugins/loader'
import { McpPluginRegistry } from '../mcp/plugins/registry'

it('aborts active calls, revokes cached capabilities and disposes exactly once', async () => {
  const lifecycle = new McpPluginLifecycle()
  const tools: McpTool[] = []
  let cleaned = 0
  const host = createMcpHost({
    pluginId: 'test',
    lifecycle,
    allowHostGet: ['subtitle'],
    enforcePrefix: false,
    callTimeoutMs: 1000,
    onAddTool: t => tools.push(t),
    capabilities: { subtitle: { show: () => 'shown' } },
  })
  const subtitle = host.get('subtitle') as { show: () => string }
  host.onDispose(() => {
    cleaned++
  })
  host.tool(
    'wait',
    'wait',
  )(
    (_args, signal) =>
      new Promise((_resolve, reject) =>
        signal!.addEventListener('abort', () => reject(signal!.reason)),
      ),
  )
  lifecycle.finishRegistration()
  assert.throws(() => host.tool('late', 'late')(() => 'x'), /注册阶段/)
  const work = tools[0].callback({})
  const rejected = assert.rejects(Promise.resolve(work), /卸载/)
  await lifecycle.dispose()
  await rejected
  await lifecycle.dispose()
  assert.equal(cleaned, 1)
  assert.equal(host.signal.aborted, true)
  assert.throws(() => subtitle.show(), /卸载/)
  assert.throws(() => host.get('subtitle'), /卸载/)
})

it('provides an aborted signal when a tool exceeds its deadline', async () => {
  const tools: McpTool[] = []
  let aborted = false
  const host = createMcpHost({
    pluginId: 'test',
    allowHostGet: [],
    enforcePrefix: false,
    callTimeoutMs: 10,
    onAddTool: t => tools.push(t),
  })
  host.tool(
    'slow',
    'slow',
  )(
    (_args, signal) =>
      new Promise(() => {
        signal!.addEventListener('abort', () => {
          aborted = true
        })
      }),
  )
  await assert.rejects(Promise.resolve(tools[0].callback({})), /超时/)
  assert.equal(aborted, true)
})

it('bounds registration, cleans partial loads and supports returned and exported disposers', async () => {
  const tempRoot = path.resolve(os.tmpdir())
  const root = await fs.mkdtemp(path.join(tempRoot, 'xiaozhi-mcp-lifecycle-'))
  const registry = new McpPluginRegistry()
  const tools = new Map<string, McpTool>()
  const events = globalThis as typeof globalThis & { __lifecycleEvents?: string[] }
  events.__lifecycleEvents = []
  async function plugin(id: string, source: string) {
    const directory = path.join(root, id)
    await fs.mkdir(directory)
    await fs.writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify({
        id,
        name: id,
        version: '1',
        api_version: 1,
        runtime: 'node-inprocess',
        entry: './register.cjs',
      }),
    )
    await fs.writeFile(path.join(directory, 'register.cjs'), source)
  }
  try {
    await plugin(
      'slow',
      `exports.register = async host => {
      host.onDispose(() => globalThis.__lifecycleEvents.push('slow cleaned'));
      host.tool('partial', 'partial')(() => 'x');
      await new Promise(resolve => setTimeout(resolve, 50));
      try { host.tool('late', 'late')(() => 'x') } catch { globalThis.__lifecycleEvents.push('late rejected') }
    }`,
    )
    await plugin(
      'good',
      `exports.register = host => () => { globalThis.__lifecycleEvents.push('returned') };
      exports.dispose = () => { globalThis.__lifecycleEvents.push('exported') }`,
    )
    const result = await loadMcpPluginsFromConfig({
      registry,
      pluginsDir: root,
      registerTimeoutMs: 10,
      addTool: tool => tools.set(tool.name, tool),
      removeToolsByNames: names => names.forEach(name => tools.delete(name)),
    })
    assert.equal(result.errors.length, 1)
    assert.match(result.errors[0].error, /注册超时/)
    assert.equal(registry.getPlugin('slow'), undefined)
    await registry.getPlugin('good')!.dispose!()
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(tools.size, 0)
    assert.deepEqual(events.__lifecycleEvents, [
      'slow cleaned',
      'returned',
      'exported',
      'late rejected',
    ])
  }
  finally {
    delete events.__lifecycleEvents
    assert.equal(path.dirname(root), tempRoot)
    assert.ok(path.basename(root).startsWith('xiaozhi-mcp-lifecycle-'))
    await fs.rm(root, { recursive: true, force: true })
  }
})
