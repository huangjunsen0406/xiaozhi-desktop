/**
 * 最小单测：PATHS migrate / containment 纯逻辑
 *
 * 不调用 app.getPath；migrateDirectory / isPathInside 不依赖 Electron runtime。
 * 运行：npx tsx --test src/main/__tests__/paths-resolve.test.ts
 */

import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { isPathInside, migrateDirectory } from '../utils/paths'

describe('migrateDirectory', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'xiaozhi-paths-'))
  after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('copies files and skips existing dest', () => {
    const src = path.join(root, 'src-a')
    const dst = path.join(root, 'dst-a')
    mkdirSync(path.join(src, 'sub'), { recursive: true })
    writeFileSync(path.join(src, 'a.txt'), 'A')
    writeFileSync(path.join(src, 'sub', 'b.txt'), 'B')
    mkdirSync(dst, { recursive: true })
    writeFileSync(path.join(dst, 'a.txt'), 'EXISTING')

    const r1 = migrateDirectory(src, dst)
    assert.equal(r1.ok, true)
    assert.equal(r1.filesCopied, 1) // only b.txt
    assert.equal(readFileSync(path.join(dst, 'a.txt'), 'utf-8'), 'EXISTING')
    assert.equal(readFileSync(path.join(dst, 'sub', 'b.txt'), 'utf-8'), 'B')

    // second run: nothing new
    const r2 = migrateDirectory(src, dst)
    assert.equal(r2.ok, true)
    assert.equal(r2.filesCopied, 0)
  })

  it('skips top-level dir names', () => {
    const src = path.join(root, 'src-b')
    const dst = path.join(root, 'dst-b')
    mkdirSync(path.join(src, 'music'), { recursive: true })
    mkdirSync(path.join(src, 'other'), { recursive: true })
    writeFileSync(path.join(src, 'music', 'm.mp3'), 'M')
    writeFileSync(path.join(src, 'other', 'o.bin'), 'O')

    const r = migrateDirectory(src, dst, { skipDirNames: new Set(['music']) })
    assert.equal(r.ok, true)
    assert.equal(existsSync(path.join(dst, 'music', 'm.mp3')), false)
    assert.equal(existsSync(path.join(dst, 'other', 'o.bin')), true)
  })

  it('same path / missing src are no-ops', () => {
    const p = path.join(root, 'same')
    mkdirSync(p, { recursive: true })
    const same = migrateDirectory(p, p)
    assert.equal(same.skipped, 'same_path')
    const missing = migrateDirectory(path.join(root, 'nope'), path.join(root, 'out'))
    assert.equal(missing.skipped, 'src_missing')
  })
})

describe('isPathInside', () => {
  it('accepts nested paths and rejects prefix siblings', () => {
    const parent = path.join('/tmp', 'xiaozhi-models')
    const nested = path.join(parent, 'foo', 'bar.json')
    const sibling = path.join('/tmp', 'xiaozhi-models-evil', 'x')
    assert.equal(isPathInside(parent, nested), true)
    assert.equal(isPathInside(parent, parent), true)
    assert.equal(isPathInside(parent, sibling), false)
  })
})
