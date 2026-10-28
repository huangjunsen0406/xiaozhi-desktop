import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { McpServer } from '../mcp/McpServer'
import { installMcpPlugin } from '../mcp/plugins/installer'
import { loadMcpPluginsFromConfig, readPluginManifest } from '../mcp/plugins/loader'

it('updates complete packages, restores the previous plugin on load failure and rejects overlap or escaping links', async () => {
  const tempRoot = await fs.realpath(os.tmpdir())
  const root = await fs.mkdtemp(path.join(tempRoot, 'xiaozhi-mcp-installer-'))
  const source = path.join(root, 'source')
  const pluginsDir = path.join(root, 'installed')
  const server = McpServer.create()
  const reload = async () => {
    await server.unloadAllExternalPlugins()
    return loadMcpPluginsFromConfig({ registry: server.getPluginRegistry(), pluginsDir, addTool: tool => server.addTool(tool), removeToolsByNames: names => server.removeToolsByNames(names) })
  }
  const install = () => installMcpPlugin({ sourcePath: source, pluginsDir, reload, isLoaded: (id, directory) => server.getPluginRegistry().getPlugin(id)?.rootDir === directory })
  const destination = path.join(pluginsDir, 'test.install')
  try {
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'manifest.json'), JSON.stringify({ id: 'test.install', name: 'Install', version: '1', api_version: 1, runtime: 'node-inprocess', entry: './register.cjs' }))
    await fs.writeFile(path.join(source, 'dependency.cjs'), 'module.exports = \'old\'')
    await fs.writeFile(path.join(source, 'register.cjs'), 'const value = require(\'./dependency.cjs\'); exports.register = host => host.tool(\'test.install\', \'test\')(() => value)')
    await install()
    assert.equal(await server.findTool('test.install')!.callback({}), 'old')
    await fs.writeFile(path.join(source, 'dependency.cjs'), 'module.exports = \'new\'')
    await install()
    assert.equal(await server.findTool('test.install')!.callback({}), 'new')
    await fs.writeFile(path.join(source, 'register.cjs'), 'exports.register = () => { throw new Error(\'broken update\') }')
    await assert.rejects(install(), /已恢复原插件/)
    assert.equal(await server.findTool('test.install')!.callback({}), 'new')
    assert.equal(await fs.readFile(path.join(destination, 'dependency.cjs'), 'utf8'), 'module.exports = \'new\'')
    assert.deepEqual((await fs.readdir(pluginsDir)).filter(name => !name.startsWith('.')), ['test.install'])
    const alias = path.join(root, 'installed-alias')
    await fs.symlink(pluginsDir, alias)
    await fs.writeFile(path.join(source, 'manifest.json'), JSON.stringify({ id: 'test.install', name: 'Install', version: '2', api_version: 1, runtime: 'node-inprocess', entry: './register.mjs' }))
    await fs.writeFile(path.join(source, 'register.mjs'), 'import value from \'./dependency.mjs\'; export function register(host) { host.tool(\'test.install\', \'esm\')(() => value) }')
    await fs.writeFile(path.join(source, 'dependency.mjs'), 'export default \'esm old\'')
    const installAlias = () => installMcpPlugin({ sourcePath: source, pluginsDir: alias, unload: () => server.unloadAllExternalPlugins(), reload: async () => {
      await server.unloadAllExternalPlugins()
      return loadMcpPluginsFromConfig({ registry: server.getPluginRegistry(), pluginsDir: alias, addTool: tool => server.addTool(tool), removeToolsByNames: names => server.removeToolsByNames(names) })
    }, isLoaded: (id, directory) => server.getPluginRegistry().getPlugin(id)?.rootDir === directory })
    await installAlias()
    assert.equal(await server.findTool('test.install')!.callback({}), 'esm old')
    await fs.writeFile(path.join(source, 'dependency.mjs'), 'export default \'esm new\'')
    await installAlias()
    assert.equal(await server.findTool('test.install')!.callback({}), 'esm new')
    await fs.writeFile(path.join(source, 'register.mjs'), 'export function register() { throw new Error(\'broken esm\') }')
    await assert.rejects(installAlias(), /已恢复原插件/)
    assert.equal(await server.findTool('test.install')!.callback({}), 'esm new')
    await assert.rejects(installMcpPlugin({ sourcePath: root, pluginsDir, reload, isLoaded: () => false }), /manifest|清单/)
    const nested = path.join(destination, 'nested')
    await fs.mkdir(nested)
    await fs.writeFile(path.join(nested, 'manifest.json'), await fs.readFile(path.join(source, 'manifest.json')))
    await fs.writeFile(path.join(nested, 'register.mjs'), 'exports.register = () => {}')
    await assert.rejects(installMcpPlugin({ sourcePath: nested, pluginsDir, reload, isLoaded: () => false }), /相互包含/)
    await fs.symlink(path.join(destination, 'register.cjs'), path.join(source, 'escape.cjs'))
    await assert.rejects(install(), /符号链接/)
    const entryLink = path.join(root, 'entry-link')
    await fs.mkdir(entryLink)
    await fs.writeFile(path.join(entryLink, 'manifest.json'), await fs.readFile(path.join(source, 'manifest.json')))
    await fs.symlink(path.join(destination, 'register.cjs'), path.join(entryLink, 'register.cjs'))
    const manifest = await readPluginManifest(entryLink)
    assert.equal(manifest.ok, false)
  }
  finally {
    await server.detach()
    assert.equal(path.dirname(root), tempRoot)
    assert.ok(path.basename(root).startsWith('xiaozhi-mcp-installer-'))
    await fs.rm(root, { recursive: true, force: true })
  }
})
