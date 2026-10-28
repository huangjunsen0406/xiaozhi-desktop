import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { build } from 'esbuild'

// Run production MCP code in Node, replacing only desktop/native boundaries.
// Plugin loading, host permissions, manifests, registry and IPC handlers remain real.
const stubs = {
  '/utils/logger': 'export const getLogger = () => ({ info() {}, warn() {}, error() {}, debug() {} })',
  '/services/configManagerDB': 'export const getConfigManager = () => ({ getAll: () => ({}) })',
  '/services/database': 'export const getDatabase = () => globalThis.__mcpRuntime.database',
  '/core/ServiceContainer': 'export const getServiceContainer = () => globalThis.__mcpRuntime.container',
  '/windows/windowManager': 'export const ensureBubbleWindow = () => {}; export const hideBubbleWindow = () => {}',
  '/tools/camera': 'export const getCameraInstance = () => ({})',
  '/tools/screenshot/ScreenshotTool': 'export class ScreenshotTool { static create() { return {} } }',
  '/tools/timer/TimerService': 'export class TimerService { static create() { return {} } }',
  '/tools/SystemToolsManager': 'export class SystemToolsManager { async init() {} }',
  'electron': `export const app = { getPath: () => process.env.TMPDIR || '/tmp' };
    export const BrowserWindow = { getAllWindows: () => [] };
    export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) };
    export const shell = { openPath: async () => '' };
    export const ipcMain = { handle: (name, handler) => globalThis.__mcpRuntime.handlers.set(name, handler) };`,
}
const directory = 'src/main/__tests__'
const tests = (await readdir(directory)).filter(name => name.startsWith('mcp-') && name.endsWith('.test.ts'))
const tempRoot = path.resolve(os.tmpdir())
const outputDir = await mkdtemp(path.join(tempRoot, 'xiaozhi-mcp-tests-'))
try {
  const outputFiles = []
  for (const test of tests) {
    const outfile = path.join(outputDir, test.replace(/\.ts$/, '.cjs'))
    await build({
      entryPoints: [path.join(directory, test)],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      plugins: [{
        name: 'desktop-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            const key = Object.keys(stubs).find(key => key === args.path || args.path.endsWith(key))
            return key ? { path: key, namespace: 'desktop-boundary' } : undefined
          })
          builder.onLoad({ filter: /.*/, namespace: 'desktop-boundary' }, args => ({ contents: stubs[args.path], loader: 'js' }))
        },
      }],
    })
    outputFiles.push(outfile)
  }
  const result = spawnSync(process.execPath, ['--test', ...outputFiles], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
}
finally {
  // Only remove the exact temporary directory created above.
  assert.equal(path.dirname(outputDir), tempRoot)
  assert.ok(path.basename(outputDir).startsWith('xiaozhi-mcp-tests-'))
  await rm(outputDir, { recursive: true, force: true })
}
