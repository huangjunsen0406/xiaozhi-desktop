import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { crc32, deflateRawSync } from 'node:zlib'
import { McpServer } from '../mcp/McpServer'
import { extractMcpPluginZip, MCP_ZIP_LIMITS, withMcpPluginSource } from '../mcp/plugins/archive'
import { installMcpPlugin } from '../mcp/plugins/installer'
import { loadMcpPluginsFromConfig } from '../mcp/plugins/loader'

interface ZipEntry {
  name: string
  contents?: string | Buffer
  method?: number
  flags?: number
  mode?: number
  checksum?: number
  size?: number
}

/** Small ZIP writer: exercise the production parser without another ZIP dependency. */
function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const contents = Buffer.from(entry.contents ?? '')
    const method = entry.method ?? 0
    const compressed = method === 8 ? deflateRawSync(contents) : contents
    const checksum = entry.checksum ?? crc32(contents)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034B50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(entry.flags ?? 0x800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.size ?? contents.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, compressed)
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014B50, 0)
    record.writeUInt16LE(0x0314, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(entry.flags ?? 0x800, 8)
    record.writeUInt16LE(method, 10)
    record.writeUInt32LE(checksum, 16)
    record.writeUInt32LE(compressed.length, 20)
    record.writeUInt32LE(entry.size ?? contents.length, 24)
    record.writeUInt16LE(name.length, 28)
    const mode = entry.mode ?? (entry.name.endsWith('/') ? 0o040755 : 0o100644)
    record.writeUInt32LE((mode * 0x10000) >>> 0, 38)
    record.writeUInt32LE(offset, 42)
    central.push(record, name)
    offset += local.length + name.length + compressed.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

const manifest = JSON.stringify({ id: 'test.archive', name: '归档测试', version: '1.0.0', api_version: 1, runtime: 'node-inprocess', entry: './register.cjs' })
function pluginEntries(prefix = '', value = 'old', broken = false): ZipEntry[] {
  return [
    { name: `${prefix}manifest.json`, contents: manifest, method: 8 },
    { name: `${prefix}register.cjs`, contents: broken ? 'exports.register = () => { throw new Error(\'broken archive update\') }' : 'const value = require(\'./dependency.cjs\'); exports.register = host => host.tool(\'test.archive\', \'zip\')(() => value)', method: 8 },
    { name: `${prefix}dependency.cjs`, contents: `module.exports = ${JSON.stringify(value)}` },
  ]
}

async function inTemp(work: (root: string) => Promise<void>): Promise<void> {
  const tempRoot = await fs.realpath(os.tmpdir())
  const root = await fs.mkdtemp(path.join(tempRoot, 'xiaozhi-mcp-archive-test-'))
  try {
    await work(root)
  }
  finally {
    assert.equal(path.dirname(root), tempRoot)
    assert.ok(path.basename(root).startsWith('xiaozhi-mcp-archive-test-'))
    await fs.rm(root, { recursive: true, force: true })
  }
}

async function archive(root: string, name: string, bytes: Buffer): Promise<string> {
  const file = path.join(root, `${name}.zip`)
  await fs.writeFile(file, bytes)
  return file
}

async function rejectsArchive(t: TestContext, name: string, entries: ZipEntry[], pattern?: RegExp): Promise<void> {
  await t.test(name, () => inTemp(async (root) => {
    const bytes = zip(entries)
    const file = await archive(root, 'invalid', bytes)
    const destination = path.join(root, 'extracted')
    await fs.mkdir(destination)
    if (pattern)
      await assert.rejects(extractMcpPluginZip(file, destination), pattern)
    else
      await assert.rejects(extractMcpPluginZip(file, destination))
    assert.deepEqual(await fs.readFile(file), bytes)
    assert.equal(await fs.stat(path.join(root, 'escape')).catch(() => undefined), undefined)
  }))
}

it('extracts root and single-folder ZIPs, Unicode, store/deflate and late explicit directories', async (t) => {
  for (const prefix of ['', '插件目录/']) {
    await t.test(prefix || 'root', () => inTemp(async (root) => {
      const bytes = zip([
        ...pluginEntries(prefix),
        { name: `${prefix}assets/问候.txt`, contents: '你好，世界', method: 8 },
        { name: `${prefix}assets/plain.txt`, contents: 'stored' },
        { name: `${prefix}assets/` },
        ...(prefix ? [{ name: prefix }] : []),
        { name: '__MACOSX/._plugin', contents: 'finder metadata' },
        { name: `${prefix}.DS_Store`, contents: 'finder metadata' },
      ])
      const file = await archive(root, 'valid', bytes)
      const destination = path.join(root, 'extracted')
      await fs.mkdir(destination)
      const source = await extractMcpPluginZip(file, destination)
      assert.equal(source, prefix ? path.join(destination, '插件目录') : destination)
      assert.equal(await fs.readFile(path.join(source, 'assets/问候.txt'), 'utf8'), '你好，世界')
      assert.equal(await fs.readFile(path.join(source, 'assets/plain.txt'), 'utf8'), 'stored')
      assert.equal(await fs.stat(path.join(destination, '__MACOSX')).catch(() => undefined), undefined)
      assert.equal(await fs.stat(path.join(source, '.DS_Store')).catch(() => undefined), undefined)
      assert.deepEqual(await fs.readFile(file), bytes)
    }))
  }
})

it('rejects unsafe paths, duplicate names, conflicts, symlinks and encrypted ZIPs', async (t) => {
  for (const name of ['../escape', '/escape', 'nested/../../escape', 'nested\\escape', 'C:/escape', 'C:\\escape', '//server/share', 'con.txt', 'trailing./file'])
    await rejectsArchive(t, name, [...pluginEntries(), { name, contents: 'unsafe' }])
  await rejectsArchive(t, 'case-insensitive duplicates', [...pluginEntries(), { name: 'Asset.txt' }, { name: 'asset.txt' }], /重复|冲突/)
  await rejectsArchive(t, 'Unicode normalization duplicates', [...pluginEntries(), { name: 'café.txt' }, { name: 'cafe\u0301.txt' }], /重复|冲突/)
  await rejectsArchive(t, 'identical duplicates', [...pluginEntries(), { name: 'same.txt' }, { name: 'same.txt' }], /重复|冲突/)
  await rejectsArchive(t, 'file before child', [...pluginEntries(), { name: 'assets', contents: 'file' }, { name: 'assets/file.txt' }], /重复|冲突/)
  await rejectsArchive(t, 'child before file', [...pluginEntries(), { name: 'assets/file.txt' }, { name: 'assets', contents: 'file' }], /重复|冲突/)
  await rejectsArchive(t, 'explicit file-directory conflict', [...pluginEntries(), { name: 'assets/' }, { name: 'assets' }], /重复|冲突/)
  await rejectsArchive(t, 'symbolic link', [...pluginEntries(), { name: 'link', contents: '../escape', mode: 0o120777 }], /符号链接|特殊文件/)
  await rejectsArchive(t, 'encrypted entry', [...pluginEntries(), { name: 'secret', flags: 0x801, method: 8, contents: 'secret' }], /加密|encrypt/i)
  await rejectsArchive(t, 'unsupported compression', [...pluginEntries(), { name: 'unsupported', method: 12 }], /压缩|compression/i)
})

it('rejects corrupt, truncated and over-limit ZIPs without large fixtures', async (t) => {
  await rejectsArchive(t, 'bad CRC', [...pluginEntries(), { name: 'bad.txt', contents: 'crc mismatch', checksum: 0 }], /校验/)
  await rejectsArchive(t, 'false extracted size', [...pluginEntries(), { name: 'bomb', contents: 'x'.repeat(1024), method: 8, size: 1 }])
  for (const [name, bytes] of [
    ['not a ZIP', Buffer.from('not a ZIP')],
    ['truncated ZIP', zip(pluginEntries()).subarray(0, -12)],
    ['damaged central directory', (() => {
      const bytes = zip(pluginEntries())
      const centralOffset = bytes.readUInt32LE(bytes.length - 6)
      bytes.writeUInt32LE(0, centralOffset)
      return bytes
    })()],
    ['damaged local header', (() => {
      const bytes = zip(pluginEntries())
      bytes.writeUInt32LE(0, 0)
      return bytes
    })()],
  ] as const) {
    await t.test(name, () => inTemp(async (root) => {
      const file = await archive(root, 'corrupt', bytes)
      const destination = path.join(root, 'extracted')
      await fs.mkdir(destination)
      await assert.rejects(extractMcpPluginZip(file, destination))
    }))
  }
  for (const [name, limits] of [
    ['archive bytes', { ...MCP_ZIP_LIMITS, archiveBytes: 16 }],
    ['extracted bytes', { ...MCP_ZIP_LIMITS, extractedBytes: 16 }],
    ['entry count', { ...MCP_ZIP_LIMITS, entries: 1 }],
  ] as const) {
    await t.test(name, () => inTemp(async (root) => {
      const file = await archive(root, 'limited', zip(pluginEntries()))
      const destination = path.join(root, 'extracted')
      await fs.mkdir(destination)
      await assert.rejects(extractMcpPluginZip(file, destination, limits), /上限|限制|过多|过大/)
    }))
  }
})

it('counts implicit parent directories and rejects excessive path depth', async () => {
  await inTemp(async (root) => {
    const destination = path.join(root, 'extracted')
    await fs.mkdir(destination)
    const file = await archive(root, 'implicit', zip([
      ...pluginEntries(),
      { name: 'a/b/c/d/e/file.txt', contents: '' },
    ]))
    await assert.rejects(extractMcpPluginZip(file, destination, { ...MCP_ZIP_LIMITS, entries: 5 }), /含隐式目录/)
    assert.equal(await fs.stat(path.join(destination, 'a')).catch(() => undefined), undefined)
    const deepFile = await archive(root, 'deep', zip([{ name: `${'dir/'.repeat(65)}file.txt` }]))
    await assert.rejects(extractMcpPluginZip(deepFile, destination), /不安全的文件路径/)
    assert.equal(await fs.stat(path.join(destination, 'dir')).catch(() => undefined), undefined)
  })
})

it('requires exactly one root or single-folder plugin manifest', async (t) => {
  await rejectsArchive(t, 'missing manifest', [{ name: 'register.cjs', contents: 'exports.register = () => {}' }], /缺少 manifest/)
  await rejectsArchive(t, 'two plugins', [...pluginEntries('first/'), ...pluginEntries('second/')], /多个插件/)
  await rejectsArchive(t, 'root and nested plugin', [...pluginEntries(), ...pluginEntries('second/')], /多个插件/)
  await rejectsArchive(t, 'two directory levels', pluginEntries('outer/inner/'), /缺少 manifest/)
})

it('cleans temporary ZIP sources after successful or failed callbacks and preserves the archive', () => inTemp(async (root) => {
  const bytes = zip(pluginEntries('插件/'))
  const file = await archive(root, 'source', bytes)
  const tempRoot = await fs.realpath(os.tmpdir())
  const directories: string[] = []
  const callback = async (directory: string) => {
    const extraction = path.dirname(directory)
    assert.equal(path.dirname(extraction), tempRoot)
    assert.ok(path.basename(extraction).startsWith('xiaozhi-mcp-zip-'))
    directories.push(extraction)
    assert.equal(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'), manifest)
    return directory
  }
  const source = await withMcpPluginSource(file, callback)
  assert.equal(await fs.stat(source).catch(() => undefined), undefined)
  await assert.rejects(withMcpPluginSource(file, async (directory) => {
    await callback(directory)
    throw new Error('callback failed')
  }), /callback failed/)
  for (const directory of directories)
    assert.equal(await fs.stat(directory).catch(() => undefined), undefined)
  assert.deepEqual(await fs.readFile(file), bytes)
  assert.equal(await withMcpPluginSource(root, async directory => directory), await fs.realpath(root))
  const other = path.join(root, 'source.txt')
  await fs.writeFile(other, bytes)
  await assert.rejects(withMcpPluginSource(other, callback), /文件夹或 ZIP/)
}))

it('installs ZIPs through the real loader, refreshes dependencies and rolls back broken upgrades', () => inTemp(async (root) => {
  const pluginsDir = path.join(root, 'installed')
  const server = McpServer.create()
  const reload = async () => {
    await server.unloadAllExternalPlugins()
    return loadMcpPluginsFromConfig({ registry: server.getPluginRegistry(), pluginsDir, addTool: tool => server.addTool(tool), removeToolsByNames: names => server.removeToolsByNames(names) })
  }
  const install = (sourcePath: string) => installMcpPlugin({ sourcePath, pluginsDir, unload: () => server.unloadAllExternalPlugins(), reload, isLoaded: (id, directory) => server.getPluginRegistry().getPlugin(id)?.rootDir === directory })
  const originals = new Map<string, Buffer>()
  const source = async (name: string, entries: ZipEntry[]) => {
    const bytes = zip(entries)
    const file = await archive(root, name, bytes)
    originals.set(file, bytes)
    return file
  }
  try {
    await assert.rejects(install(await source('fresh-broken', pluginEntries('', 'broken', true))), /未替换原插件/)
    assert.equal(server.findTool('test.archive'), undefined)
    assert.deepEqual(await fs.readdir(pluginsDir), [])
    await install(await source('first', pluginEntries('', 'old')))
    assert.equal(await server.findTool('test.archive')!.callback({}), 'old')
    await install(await source('upgrade', pluginEntries('更新包/', 'new')))
    assert.equal(await server.findTool('test.archive')!.callback({}), 'new')
    const broken = await source('broken', pluginEntries('', 'broken', true))
    await assert.rejects(install(broken), /已恢复原插件/)
    assert.equal(await server.findTool('test.archive')!.callback({}), 'new')
    assert.equal(await fs.readFile(path.join(pluginsDir, 'test.archive/dependency.cjs'), 'utf8'), 'module.exports = "new"')
    assert.deepEqual((await fs.readdir(pluginsDir)).filter(name => !name.startsWith('.runtime-')), ['test.archive'])
    for (const [file, bytes] of originals)
      assert.deepEqual(await fs.readFile(file), bytes)
    const invalid = await source('invalid', [{ name: 'missing.txt', contents: 'no plugin' }])
    await assert.rejects(install(invalid), /缺少 manifest/)
    assert.equal(await server.findTool('test.archive')!.callback({}), 'new')
  }
  finally {
    await server.detach()
  }
  assert.deepEqual(await fs.readdir(pluginsDir), ['test.archive'])
}))
