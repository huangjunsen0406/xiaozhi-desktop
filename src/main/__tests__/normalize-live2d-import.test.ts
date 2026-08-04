/**
 * Live2D 导入规范化纯函数单测
 *
 * 运行：npx tsx --test src/main/__tests__/normalize-live2d-import.test.ts
 */

import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  allocateUniqueStableId,
  discoverLive2dModelRoots,
  ensureModelJson,
  ensureWritableTree,
  importNormalizedLive2dModel,
  isModel3ConfigFileName,
  model3Stem,
  pickBestLive2dModelRoot,
  pickPrimaryModel3FileName,
  resolveDisplayName,
  slugifyLive2dStableId,
  validateLive2dModelFolder,
} from '../utils/normalizeLive2dImport'

const tempRoots: string[] = []

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

/** 测试可能把目录 chmod 成 555，清理前先尽量恢复 u+w */
function forceRemoveTree(dir: string): void {
  try {
    const walk = (current: string): void => {
      try {
        chmodSync(current, 0o755)
      }
      catch {
        // ignore
      }
      let names: string[] = []
      try {
        names = readdirSync(current)
      }
      catch {
        return
      }
      for (const name of names) {
        const full = path.join(current, name)
        let st
        try {
          st = statSync(full)
        }
        catch {
          continue
        }
        if (st.isDirectory()) {
          walk(full)
        }
        else {
          try {
            chmodSync(full, 0o644)
          }
          catch {
            // ignore
          }
        }
      }
    }
    walk(dir)
  }
  catch {
    // ignore
  }
  rmSync(dir, { recursive: true, force: true })
}

after(() => {
  for (const dir of tempRoots) {
    try {
      forceRemoveTree(dir)
    }
    catch {
      // ignore
    }
  }
})

describe('model3 file helpers', () => {
  it('isModel3ConfigFileName', () => {
    assert.equal(isModel3ConfigFileName('model.json'), true)
    assert.equal(isModel3ConfigFileName('xinchen.model3.json'), true)
    assert.equal(isModel3ConfigFileName('Foo.MODEL3.JSON'), true)
    assert.equal(isModel3ConfigFileName('xinchen.moc3'), false)
    assert.equal(isModel3ConfigFileName('physics3.json'), false)
  })

  it('model3Stem', () => {
    assert.equal(model3Stem('xinchen.model3.json'), 'xinchen')
    assert.equal(model3Stem('model.json'), 'model')
    assert.equal(model3Stem('信酱.model3.json'), '信酱')
  })

  it('pickPrimaryModel3FileName prefers model.json', () => {
    assert.equal(
      pickPrimaryModel3FileName(['b.model3.json', 'model.json', 'a.model3.json']),
      'model.json',
    )
    assert.equal(
      pickPrimaryModel3FileName(['b.model3.json', 'a.model3.json']),
      'a.model3.json',
    )
    assert.equal(pickPrimaryModel3FileName(['foo.moc3']), null)
  })
})

describe('slugifyLive2dStableId', () => {
  it('keeps ascii stems lowercase', () => {
    assert.equal(slugifyLive2dStableId('xinchen'), 'xinchen')
    assert.equal(slugifyLive2dStableId('Model251A'), 'model251a')
    assert.equal(slugifyLive2dStableId('Foo Bar'), 'foo-bar')
  })

  it('romanizes chinese names via pinyin', () => {
    const id = slugifyLive2dStableId('信酱')
    assert.match(id, /^[a-z0-9_]+(?:-[a-z0-9_]+)*$/)
    assert.ok(id.length > 0)
    assert.ok(!id.endsWith('-'))
    // 信酱 → xinjiang；有拼音时不应退回 live2d-hash
    assert.ok(id.includes('xin'))
    assert.ok(!id.startsWith('live2d-'))
  })

  it('falls back to live2d-hash for empty', () => {
    assert.match(slugifyLive2dStableId(''), /^live2d-[a-f0-9]{8}$/)
    assert.match(slugifyLive2dStableId('   '), /^live2d-[a-f0-9]{8}$/)
  })
})

describe('allocateUniqueStableId', () => {
  it('returns base when free', () => {
    assert.equal(allocateUniqueStableId('xinchen', new Set()), 'xinchen')
  })

  it('appends -2 -3 on conflict', () => {
    const occupied = new Set(['xinchen', 'xinchen-2'])
    assert.equal(allocateUniqueStableId('xinchen', occupied), 'xinchen-3')
  })
})

describe('resolveDisplayName', () => {
  it('prefers outer selection folder name', () => {
    assert.equal(
      resolveDisplayName({
        selectionPath: '/tmp/编号502狼耳男新',
        modelRoot: '/tmp/编号502狼耳男新/狼耳男新',
        model3FileName: 'xinchen.model3.json',
      }),
      '编号502狼耳男新',
    )
  })
})

describe('pickBestLive2dModelRoot', () => {
  it('prefers larger moc3 then shallower depth', () => {
    const best = pickBestLive2dModelRoot([
      {
        rootDir: '/a/deep/model',
        depth: 3,
        model3FileName: 'a.model3.json',
        moc3FileName: 'a.moc3',
        moc3Size: 100,
      },
      {
        rootDir: '/a/model',
        depth: 1,
        model3FileName: 'b.model3.json',
        moc3FileName: 'b.moc3',
        moc3Size: 500,
      },
    ])
    assert.equal(best?.rootDir, '/a/model')
    assert.equal(best?.moc3Size, 500)
  })

  it('returns null for empty', () => {
    assert.equal(pickBestLive2dModelRoot([]), null)
  })
})

describe('discoverLive2dModelRoots (fs)', () => {
  it('finds nested model root with model3 + moc3', async () => {
    const root = makeTempDir('l2d-disc-')
    const pack = path.join(root, '礼包外层')
    const modelRoot = path.join(pack, 'ui-skip', '角色')
    mkdirSync(modelRoot, { recursive: true })
    // noise
    mkdirSync(path.join(pack, '稿图'), { recursive: true })
    writeFileSync(path.join(pack, '稿图', 'preview.png'), 'x')

    writeFileSync(
      path.join(modelRoot, 'hero.model3.json'),
      JSON.stringify({
        Version: 3,
        FileReferences: {
          Moc: 'hero.moc3',
          Textures: ['hero.2048/texture_00.png'],
        },
      }),
    )
    writeFileSync(path.join(modelRoot, 'hero.moc3'), new Uint8Array(2048).fill(1))
    mkdirSync(path.join(modelRoot, 'hero.2048'), { recursive: true })
    writeFileSync(path.join(modelRoot, 'hero.2048', 'texture_00.png'), 'tex')

    const found = await discoverLive2dModelRoots(pack)
    assert.equal(found.length, 1)
    assert.equal(found[0].model3FileName, 'hero.model3.json')
    assert.equal(found[0].moc3FileName, 'hero.moc3')
    assert.ok(found[0].rootDir.endsWith(path.join('ui-skip', '角色')) || found[0].rootDir.includes('角色'))
  })

  it('rejects pack without moc3', async () => {
    const root = makeTempDir('l2d-nomoc-')
    const pack = path.join(root, 'broken')
    mkdirSync(pack, { recursive: true })
    writeFileSync(
      path.join(pack, 'only.model3.json'),
      JSON.stringify({ Version: 3, FileReferences: { Moc: 'missing.moc3' } }),
    )

    const result = await validateLive2dModelFolder(pack)
    assert.equal(result.valid, false)
    assert.match(result.error || '', /未找到有效的 Live2D 模型/)
  })

  it('validate accepts outer gift folder', async () => {
    const root = makeTempDir('l2d-ok-')
    const outer = path.join(root, 's358')
    const nested = path.join(outer, '日网白毛', 'model251a')
    mkdirSync(nested, { recursive: true })
    writeFileSync(
      path.join(nested, 'model251a.model3.json'),
      JSON.stringify({
        Version: 3,
        FileReferences: { Moc: 'model251a.moc3' },
      }),
    )
    writeFileSync(path.join(nested, 'model251a.moc3'), new Uint8Array(4096).fill(2))

    const result = await validateLive2dModelFolder(outer)
    assert.equal(result.valid, true)
    assert.ok(result.candidate)
    assert.equal(result.candidate?.model3FileName, 'model251a.model3.json')
    assert.ok(existsSync(path.join(result.candidate!.rootDir, 'model251a.moc3')))
  })
})

describe('ensureWritableTree + import with mode 555 source', () => {
  /**
   * 市面包（如 Custom_Suiika）目录常为 dr-xr-xr-x。
   * fs.copy 保留 mode 后必须 chmod 目标树，否则写 model.json 会 EACCES。
   */
  it('ensureWritableTree makes 555 dir writable and ensureModelJson can write', async () => {
    const root = makeTempDir('l2d-ro-')
    const modelRoot = path.join(root, 'suiika')
    mkdirSync(modelRoot, { recursive: true })
    writeFileSync(
      path.join(modelRoot, 'suiika.model3.json'),
      JSON.stringify({
        Version: 3,
        FileReferences: { Moc: 'suiika.moc3' },
      }),
    )
    writeFileSync(path.join(modelRoot, 'suiika.moc3'), new Uint8Array(512).fill(3))

    // 模拟源包只读目录
    chmodSync(modelRoot, 0o555)
    assert.equal(statSync(modelRoot).mode & 0o222, 0)

    await ensureWritableTree(modelRoot)
    assert.notEqual(statSync(modelRoot).mode & 0o200, 0)

    const primary = await ensureModelJson(modelRoot)
    assert.equal(primary, 'suiika.model3.json')
    assert.ok(existsSync(path.join(modelRoot, 'model.json')))
    const written = readFileSync(path.join(modelRoot, 'model.json'), 'utf8')
    assert.ok(written.includes('suiika.moc3'))
  })

  it('importNormalizedLive2dModel succeeds when source tree is 555', async () => {
    const root = makeTempDir('l2d-import-ro-')
    const source = path.join(root, 'Custom_Suiika')
    const modelRoot = path.join(source, 'Custom_Suiika_v1_03_2k')
    const modelsDir = path.join(root, 'models')
    mkdirSync(modelRoot, { recursive: true })
    mkdirSync(modelsDir, { recursive: true })

    writeFileSync(
      path.join(modelRoot, 'Custom_Suiika_v1_03_2k.model3.json'),
      JSON.stringify({
        Version: 3,
        FileReferences: { Moc: 'Custom_Suiika_v1_03_2k.moc3' },
      }),
    )
    writeFileSync(
      path.join(modelRoot, 'Custom_Suiika_v1_03_2k.moc3'),
      new Uint8Array(1024).fill(4),
    )

    // 源目录只读（含子目录场景的根）
    chmodSync(modelRoot, 0o555)

    const result = await importNormalizedLive2dModel({
      sourcePath: source,
      modelsDir,
    })

    assert.equal(result.success, true)
    if (!result.success)
      return

    const target = result.data.targetPath
    assert.ok(existsSync(path.join(target, 'model.json')))
    assert.ok(existsSync(path.join(target, 'model.meta.json')))
    // 目标目录应可写
    assert.notEqual(statSync(target).mode & 0o200, 0)
    // 源 555 不应阻止导入，且 modelsDir 只应有成功目录
    const ids = readdirSync(modelsDir)
    assert.equal(ids.length, 1)
    assert.equal(ids[0], result.data.stableId)
  })
})
