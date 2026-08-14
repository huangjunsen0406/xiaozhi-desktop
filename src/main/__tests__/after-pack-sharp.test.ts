/**
 * afterPack 查找路径：sharp 的 .node 在 lib/ 下，不是包根。
 *
 * 运行：npx tsx --test src/main/__tests__/after-pack-sharp.test.ts
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { describe, it } = require('node:test')
const { candidateSharpNodes, runtimePlatforms } = require('../../../scripts/afterPack.js')

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
    assert.ok(files.some(file => file.endsWith(`${path.sep}sharp.node`)))
  })
})
