import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const testRoots = ['src/main/__tests__', 'src/renderer/src/stores/__tests__', 'src/renderer/src/utils/audio/__tests__']
const filters = process.argv.slice(2)
const testFiles = []
for (const directory of testRoots) {
  const absoluteDirectory = path.join(projectRoot, directory)
  if (!existsSync(absoluteDirectory))
    continue
  for (const name of (await fs.readdir(absoluteDirectory)).sort()) {
    if (name.endsWith('.test.ts') && !name.startsWith('mcp-')
      && (!filters.length || filters.some(filter => name.includes(filter)))) {
      testFiles.push(path.join(absoluteDirectory, name))
    }
  }
}
if (!testFiles.length)
  throw new Error('No matching unit tests found')

const quietLogger = `export const getLogger = () => ({ debug() {}, info() {}, warn() {}, error() {} })`
const electronStub = `
  import os from 'node:os'
  import { EventEmitter } from 'node:events'
  export const powerMonitor = new EventEmitter()
  export const app = { getPath: () => os.tmpdir(), getName: () => 'xiaozhi-unit', isPackaged: false }
  export const BrowserWindow = { getAllWindows: () => [] }
  export const ipcMain = {
    handle: (name, handler) => globalThis.__ipcRuntime.handlers.set(name, handler),
    on: (name, handler) => globalThis.__ipcRuntime.listeners.set(name, handler),
    removeListener: (name, handler) => {
      if (globalThis.__ipcRuntime.listeners.get(name) === handler)
        globalThis.__ipcRuntime.listeners.delete(name)
    },
  }
  export const ipcRenderer = {
    invoke: (name, ...args) => globalThis.__ipcRuntime.handlers.get(name)({}, ...args),
    send: (name, ...args) => globalThis.__ipcRuntime.listeners.get(name)?.({}, ...args),
  }
`

function desktopBoundaries(testFile) {
  const stubs = {
    'electron': electronStub,
    'utils/logger': quietLogger,
    'core/ServiceContainer': `export const getServiceContainer = () => { throw new Error('ServiceContainer not initialized in unit test') }`,
  }
  if (path.basename(testFile) === 'conversation-session.test.ts') {
    stubs['services/audioSettings'] = `export const getAudioSettings = () => ({ conversationMode: 'auto' })`
  }
  if (path.basename(testFile) === 'ipc-contracts.test.ts') {
    Object.assign(stubs, {
      'services/database': `export const getDatabase = () => globalThis.__ipcRuntime.database`,
      'windows/windowManager': `export const getBackgroundAudioWindow = () => null`,
      'wake-word/keywordsFile': `export const ensureWakeWordKeywordsFile = () => {}; export const resolveWakeWordKeyword = (_, keyword) => keyword`,
    })
  }
  if (path.basename(testFile) === 'audio-power-lifecycle.test.ts') {
    stubs['audio/codecService'] = `
      export const initOpusCodec = () => {}
      export const disposeOpusCodec = () => {}
      export const getOpusCodec = () => ({
        encode: data => data,
        decode: () => new Int16Array([100]),
      })
    `
  }
  return {
    name: 'unit-desktop-boundaries',
    setup(builder) {
      builder.onResolve({ filter: /./ }, (args) => {
        const normalized = args.path.replaceAll('\\', '/').replace(/\.ts$/, '')
        const resolved = args.path.startsWith('.')
          ? path.resolve(args.resolveDir, args.path).replaceAll('\\', '/').replace(/\.ts$/, '')
          : normalized
        const name = Object.keys(stubs).find(key => normalized === key || normalized.endsWith(`/${key}`) || resolved.endsWith(`/${key}`))
        if (name)
          return { path: name, namespace: 'unit-stub' }
      })
      builder.onLoad({ filter: /.*/, namespace: 'unit-stub' }, args => ({ contents: stubs[args.path] }))
    },
  }
}

const tempPrefix = 'xiaozhi-unit-tests-'
async function removeTestOutput(directory) {
  const resolved = path.resolve(directory)
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith(tempPrefix))
    throw new Error(`Unexpected unit-test output directory: ${resolved}`)
  await fs.rm(resolved, { recursive: true, force: true })
}

const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), tempPrefix))
try {
  const outputs = []
  for (const testFile of testFiles) {
    const outfile = path.join(outputDirectory, path.basename(testFile).replace(/\.ts$/, '.cjs'))
    await build({
      entryPoints: [testFile],
      outfile,
      absWorkingDir: projectRoot,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
      tsconfig: path.join(projectRoot, 'tsconfig.node.json'),
      alias: { '@shared': path.join(projectRoot, 'src/shared') },
      define: {
        '__dirname': JSON.stringify(path.dirname(testFile)),
        'import.meta.url': JSON.stringify(pathToFileURL(testFile).href),
      },
      plugins: [desktopBoundaries(testFile)],
      logLevel: 'warning',
    })
    outputs.push(outfile)
  }
  const result = spawnSync(process.execPath, ['--test', ...outputs], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_PATH: [path.join(projectRoot, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    },
  })
  if (result.error)
    throw result.error
  process.exitCode = result.status ?? 1
}
finally {
  // 只清理本次创建、已经核实位置的临时测试产物。
  await removeTestOutput(outputDirectory)
}
