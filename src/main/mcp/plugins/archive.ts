import type { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import type { Entry, ZipFile } from 'yauzl'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32 } from 'node:zlib'
import fs from 'fs-extra'
import { open } from 'yauzl'

export const MCP_ZIP_LIMITS = {
  archiveBytes: 100 * 1024 * 1024,
  extractedBytes: 500 * 1024 * 1024,
  entries: 10_000,
}

type ZipLimits = typeof MCP_ZIP_LIMITS

function openArchive(filePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    open(
      filePath,
      { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true },
      (error, archive) => {
        if (error)
          reject(error)
        else resolve(archive)
      },
    )
  })
}

function nextEntry(archive: ZipFile): Promise<Entry | undefined> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      archive.off('entry', entry)
      archive.off('end', end)
      archive.off('error', error)
    }
    function entry(value: Entry) {
      cleanup()
      resolve(value)
    }
    function end() {
      cleanup()
      resolve(undefined)
    }
    function error(cause: Error) {
      cleanup()
      reject(cause)
    }
    archive.once('entry', entry)
    archive.once('end', end)
    archive.once('error', error)
    archive.readEntry()
  })
}

function entryStream(archive: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    archive.openReadStream(entry, (error, stream) => {
      if (error)
        reject(error)
      else resolve(stream)
    })
  })
}

function entryPath(entry: Entry): { relative: string, directory: boolean } {
  const name = entry.fileName
  const unixType = (entry.externalFileAttributes >>> 16) & 0o170000
  const directory
    = name.endsWith('/') || unixType === 0o040000 || !!(entry.externalFileAttributes & 0x10)
  if (unixType && unixType !== 0o100000 && unixType !== 0o040000)
    throw new Error(`ZIP 不支持符号链接或特殊文件：${name}`)
  if (directory && (unixType === 0o100000 || entry.uncompressedSize !== 0))
    throw new Error(`ZIP 目录条目无效：${name}`)
  if (entry.generalPurposeBitFlag & 0x41)
    throw new Error('不支持加密 ZIP，请先移除密码')
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
    throw new Error(`不支持的 ZIP 压缩方式：${entry.compressionMethod}`)
  const relative = name.endsWith('/') ? name.slice(0, -1) : name
  const parts = relative.split('/')
  if (
    !relative
    || relative.length > 1024
    || parts.length > 64
    || name.includes('\\')
    || parts.some(
      part =>
        !part
        || part === '.'
        || part === '..'
        || /[<>:"|?*]/.test(part)
        || Array.from(part).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
        || /[. ]$/.test(part)
        || /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(part),
    )
  ) {
    throw new Error(`ZIP 包含不安全的文件路径：${name}`)
  }
  return { relative, directory }
}

/** Extract sequentially into a newly created private directory; never execute archive content. */
export async function extractMcpPluginZip(
  archivePath: string,
  destination: string,
  limits: ZipLimits = MCP_ZIP_LIMITS,
): Promise<string> {
  const stat = await fs.stat(archivePath)
  if (!stat.isFile() || stat.size > limits.archiveBytes) {
    throw new Error(
      `ZIP 文件过大或不是普通文件（上限 ${Math.floor(limits.archiveBytes / 1024 / 1024)} MiB）`,
    )
  }
  const root = await fs.realpath(destination)
  const archive = await openArchive(archivePath)
  const paths = new Map<string, { name: string, directory: boolean, explicit: boolean }>()
  let count = 0
  let declaredBytes = 0
  let actualBytes = 0
  let archiveError: Error | undefined
  let activeStream: Readable | undefined
  archive.on('error', (error: Error) => {
    archiveError = error
    activeStream?.destroy(error)
  })
  try {
    if (archive.entryCount > limits.entries)
      throw new Error(`ZIP 文件条目过多（上限 ${limits.entries}）`)
    while (true) {
      if (archiveError)
        throw archiveError
      const entry = await nextEntry(archive)
      if (!entry)
        break
      count++
      declaredBytes += entry.uncompressedSize
      if (
        count > limits.entries
        || !Number.isSafeInteger(declaredBytes)
        || declaredBytes > limits.extractedBytes
      ) {
        throw new Error('ZIP 解压大小或文件数量超过限制')
      }
      const { relative, directory } = entryPath(entry)
      // Finder adds these metadata entries when creating ZIPs on macOS.
      if (relative.split('/').some(part => part === '__MACOSX' || part === '.DS_Store'))
        continue
      const parts = relative.split('/')
      for (let index = 0; index < parts.length; index++) {
        const name = parts.slice(0, index + 1).join('/')
        const key = name.normalize('NFC').toLowerCase()
        const explicit = index === parts.length - 1
        const isDirectory = !explicit || directory
        const previous = paths.get(key)
        if (!previous && paths.size >= limits.entries)
          throw new Error(`ZIP 文件及目录数量过多（含隐式目录，上限 ${limits.entries}）`)
        if (
          previous
          && (previous.name !== name
            || previous.directory !== isDirectory
            || (explicit && previous.explicit))
        ) {
          throw new Error(`ZIP 存在重复或冲突路径：${relative}`)
        }
        paths.set(key, { name, directory: isDirectory, explicit: explicit || !!previous?.explicit })
      }
      const target = path.resolve(root, ...parts)
      if (!target.startsWith(`${root}${path.sep}`))
        throw new Error(`ZIP 路径越界：${relative}`)
      if (directory) {
        await fs.ensureDir(target)
        continue
      }
      await fs.ensureDir(path.dirname(target))
      let written = 0
      let checksum = 0
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          written += chunk.length
          actualBytes += chunk.length
          if (written > entry.uncompressedSize || actualBytes > limits.extractedBytes)
            return callback(new Error('ZIP 实际解压大小超过限制'))
          checksum = crc32(chunk, checksum)
          callback(null, chunk)
        },
      })
      activeStream = await entryStream(archive, entry)
      if (archiveError) {
        activeStream.destroy()
        throw archiveError
      }
      // Preserve executable bits for legitimate bundled helpers, never setuid/setgid.
      const executable = (entry.externalFileAttributes >>> 16) & 0o111
      await pipeline(
        activeStream,
        meter,
        fs.createWriteStream(target, { flags: 'wx', mode: 0o644 | executable }),
      )
      activeStream = undefined
      if (written !== entry.uncompressedSize || checksum !== entry.crc32)
        throw new Error(`ZIP 文件校验失败：${relative}`)
    }
  }
  finally {
    activeStream?.destroy()
    archive.close()
  }
  const entries = await fs.readdir(root)
  const manifests: string[] = []
  if (await fs.pathExists(path.join(root, 'manifest.json')))
    manifests.push(root)
  for (const name of entries) {
    const child = path.join(root, name)
    if (
      (await fs.stat(child)).isDirectory()
      && (await fs.pathExists(path.join(child, 'manifest.json')))
    ) {
      manifests.push(child)
    }
  }
  if (manifests.length !== 1) {
    throw new Error(
      manifests.length
        ? 'ZIP 包含多个插件，请分别导入'
        : 'ZIP 中缺少 manifest.json，请放在根目录或一层插件文件夹内',
    )
  }
  return manifests[0]
}

/** The temporary extraction is always removed after installation or rollback. */
export async function withMcpPluginSource<T>(
  sourcePath: string,
  install: (directory: string) => Promise<T>,
): Promise<T> {
  const source = await fs.realpath(path.resolve(sourcePath))
  const stat = await fs.stat(source)
  if (stat.isDirectory())
    return install(source)
  if (!stat.isFile() || path.extname(sourcePath).toLowerCase() !== '.zip')
    throw new Error('请选择插件文件夹或 ZIP 文件')
  const tempRoot = await fs.realpath(os.tmpdir())
  const directory = await fs.mkdtemp(path.join(tempRoot, 'xiaozhi-mcp-zip-'))
  try {
    const pluginRoot = await extractMcpPluginZip(source, directory)
    return await install(pluginRoot)
  }
  catch (error) {
    throw new Error(`ZIP 导入失败：${error instanceof Error ? error.message : String(error)}`)
  }
  finally {
    assert.equal(path.dirname(directory), tempRoot)
    assert.ok(path.basename(directory).startsWith('xiaozhi-mcp-zip-'))
    await fs.remove(directory)
  }
}
