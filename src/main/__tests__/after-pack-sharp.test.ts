/**
 * afterPack 查找路径：sharp 的 .node 在 lib/ 下，不是包根。
 *
 * 运行：npx tsx --test src/main/__tests__/after-pack-sharp.test.ts
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

const require = createRequire(import.meta.url)
const {
  candidateSharpNodes,
  findProjectSharpDir,
  runtimePlatforms,
} = require('../../../scripts/afterPack.js') as {
  candidateSharpNodes: (resourcesRoot: string, runtime: string) => string[]
  findProjectSharpDir: (projectDir: string, pkgName: string) => string | null
  runtimePlatforms: (electronPlatformName: string, arch: number) => string[]
}

describe('afterPack sharp lookup', () => {
  it('maps electron-builder arch ids to one runtime per platform', () => {
    assert.deepEqual(runtimePlatforms('darwin', 3), ['darwin-arm64'])
    assert.deepEqual(runtimePlatforms('darwin', 1), ['darwin-x64'])
    assert.deepEqual(runtimePlatforms('win32', 1), ['win32-x64'])
    assert.deepEqual(runtimePlatforms('linux', 3), ['linux-arm64'])
    assert.deepEqual(runtimePlatforms('darwin', 4), ['darwin-x64', 'darwin-arm64'])
  })

  it('looks for lib/sharp-<runtime>.node first', () => {
    const files = candidateSharpNodes('/res', 'darwin-x64')
    assert.equal(
      files[0],
      path.join('/res', 'app.asar.unpacked', 'node_modules', '@img/sharp-darwin-x64', 'lib', 'sharp-darwin-x64.node'),
    )
    assert.ok(files.some((file: string) => file.endsWith(`${path.sep}sharp.node`)))
  })

  it('finds the hoisted @img/sharp-* dir in this repo when present', () => {
    const root = path.resolve(__dirname, '../../..')
    const found = findProjectSharpDir(root, `sharp-${process.platform}-${process.arch}`)
    if (process.platform === 'darwin' || process.platform === 'linux' || process.platform === 'win32') {
      assert.ok(found, `expected local sharp for ${process.platform}-${process.arch}`)
      assert.ok(found.includes(`sharp-${process.platform}-${process.arch}`))
    }
  })
})
