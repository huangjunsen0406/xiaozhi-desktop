import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { McpServer } from '../mcp/McpServer'
import { loadMcpPluginsFromConfig } from '../mcp/plugins/loader'
import { PropertyList } from '../mcp/types'

it('isolates builtin/tool/id collisions and rolls back only newly registered tools', async () => {
  const tempRoot = path.resolve(os.tmpdir())
  const root = await fs.mkdtemp(path.join(tempRoot, 'xiaozhi-mcp-conflicts-'))
  const server = McpServer.create()
  const builtin = { name: 'self.test', description: 'builtin', properties: new PropertyList(), callback: () => 'builtin' }
  server.addTool(builtin)
  assert.throws(() => server.addTool(builtin), /冲突/)
  async function plugin(folder: string, id: string, source: string) {
    const directory = path.join(root, folder)
    await fs.mkdir(directory)
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ id, name: id, version: '1', api_version: 1, runtime: 'node-inprocess', entry: './register.cjs' }))
    await fs.writeFile(path.join(directory, 'register.cjs'), source)
  }
  try {
    await plugin('a', 'first', 'exports.register = host => host.tool(\'shared\', \'original\')(() => \'first\')')
    await plugin('b', 'builtin-collision', 'exports.register = host => { host.tool(\'partial\', \'partial\')(() => \'partial\'); host.tool(\'self.test\', \'bad\')(() => \'bad\') }')
    await plugin('c', 'external-collision', 'exports.register = host => host.tool(\'shared\', \'bad\')(() => \'bad\')')
    await plugin('d', 'first', 'exports.register = host => { throw new Error(\'must not execute duplicate id\') }')
    await plugin('e', 'throws', 'exports.register = host => { host.tool(\'failed.partial\', \'partial\')(() => \'x\'); throw new Error(\'register failed\') }')
    const result = await loadMcpPluginsFromConfig({ registry: server.getPluginRegistry(), pluginsDir: root, addTool: tool => server.addTool(tool), removeToolsByNames: names => server.removeToolsByNames(names) })
    assert.equal(result.loaded.length, 1)
    assert.equal(result.errors.length, 4)
    assert.equal(await server.findTool('self.test')!.callback({}), 'builtin')
    assert.equal(await server.findTool('shared')!.callback({}), 'first')
    assert.equal(server.getPluginRegistry().getPluginIdForTool('self.test'), undefined)
    assert.equal(server.getPluginRegistry().getPluginIdForTool('shared'), 'first')
    assert.equal(server.findTool('partial'), undefined)
    assert.equal(server.findTool('failed.partial'), undefined)
    await server.unloadPlugin('first')
    assert.deepEqual(server.getAllRegisteredTools().map(tool => tool.name), ['self.test'])
  }
  finally {
    await server.detach()
    assert.equal(path.dirname(root), tempRoot)
    assert.ok(path.basename(root).startsWith('xiaozhi-mcp-conflicts-'))
    await fs.rm(root, { recursive: true, force: true })
  }
})
