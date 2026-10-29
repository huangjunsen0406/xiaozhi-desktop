import type { DisplayMode } from '@shared/types'
import type { MenuItemConstructorOptions } from 'electron'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { after, before, describe, it } from 'node:test'

class WindowFixture extends EventEmitter {
  destroyed = false
  minimized = false
  visible = false
  calls: string[] = []
  position: [number, number] = [100, 200]
  webContents = { send: (..._args: unknown[]) => {} }

  isDestroyed() { return this.destroyed }
  isMinimized() { return this.minimized }
  isVisible() { return this.visible }
  restore() {
    this.calls.push('restore')
    this.minimized = false
  }

  show() {
    this.calls.push('show')
    this.visible = true
  }

  showInactive() {
    this.calls.push('showInactive')
    this.visible = true
  }

  focus() { this.calls.push('focus') }
  moveTop() { this.calls.push('moveTop') }
  setAlwaysOnTop() { this.calls.push('setAlwaysOnTop') }
  hide() { this.visible = false }
  getPosition() { return this.position }
  getSize() { return [150, 180] }
  getBounds() { return { x: this.position[0], y: this.position[1], width: 150, height: 180 } }
  setPosition(x: number, y: number) { this.position = [x, y] }

  close() {
    this.destroyed = true
    this.emit('closed')
  }
}

class TrayFixture extends EventEmitter {
  menu: { items: MenuItemConstructorOptions[] } | undefined
  menuPopups = 0
  setToolTip(_tooltip: string) {}
  setContextMenu(menu: { items: MenuItemConstructorOptions[] }) { this.menu = menu }
  popUpContextMenu() { this.menuPopups++ }
  setImage(_image: unknown) {}
}

const windows = new Map<string, WindowFixture[]>()
const trayInstances: TrayFixture[] = []
const ipc = new EventEmitter()
const image = { isEmpty: () => false, setTemplateImage: (_template: boolean) => {} }
const platformUnderTest = process.env.XIAOZHI_TRAY_TEST_PLATFORM
let outputDirectory: string
let manager: typeof import('../windows/windowManager')
let menuBuilder: typeof import('../utils/menuBuilder')

before(async () => {
  if (platformUnderTest)
    Object.defineProperty(process, 'platform', { value: platformUnderTest })
  outputDirectory = await mkdtemp(path.join(tmpdir(), 'xiaozhi-tray-window-test-'))
  const runtime = {
    modeFile: path.join(outputDirectory, 'display-mode.json'),
    database: { getWindowPosition: () => null, setWindowPosition: (..._args: unknown[]) => {} },
    buildWindow: (name: string) => {
      const win = new WindowFixture()
      const list = windows.get(name) ?? []
      list.push(win)
      windows.set(name, list)
      return win
    },
    electron: {
      app: { isPackaged: false, getAppPath: () => outputDirectory, quit: () => {} },
      BrowserWindow: { getAllWindows: () => [...windows.values()].flat().filter(win => !win.destroyed) },
      Menu: { buildFromTemplate: (items: MenuItemConstructorOptions[]) => ({ items }) },
      Tray: class extends TrayFixture {
        constructor(_image: unknown) {
          super()
          trayInstances.push(this)
        }
      },
      nativeImage: { createFromPath: () => image },
      nativeTheme: new EventEmitter(),
      screen: Object.assign(new EventEmitter(), {
        getPrimaryDisplay: () => ({ scaleFactor: 1 }),
        getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
      }),
      ipcMain: ipc,
    },
  }
  Object.assign(globalThis, { __trayRuntime: runtime })
  manager = await import('../windows/windowManager')
  menuBuilder = await import('../utils/menuBuilder')
})

after(async () => {
  for (const list of windows.values()) {
    for (const win of list)
      win.close()
  }
  if (outputDirectory) {
    const target = path.resolve(outputDirectory)
    assert.equal(path.dirname(target), path.resolve(tmpdir()))
    assert.ok(path.basename(target).startsWith('xiaozhi-tray-window-test-'))
    await rm(target, { recursive: true, force: true })
  }
})

function latest(name: string): WindowFixture {
  const win = windows.get(name)?.at(-1)
  assert.ok(win, `${name} window was created`)
  return win
}

function selectMode(mode: DisplayMode) {
  const select = {
    main: manager.toggleToMain,
    mini: manager.toggleToMini,
    chat: manager.toggleToChat,
    pets: manager.toggleToPets,
    live2d: manager.toggleToLive2d,
  }[mode]
  select()
}

if (platformUnderTest) {
  it(`binds tray activation for ${platformUnderTest} without changing display mode`, async () => {
    selectMode('pets')
    const pet = latest('pets')
    pet.hide()
    pet.calls = []
    const { registerTray } = await import('../tray')
    registerTray()
    registerTray()
    assert.equal(trayInstances.length, 1)
    const tray = trayInstances[0]
    assert.equal(tray.menu?.items[0].label, '显示窗口')
    if (platformUnderTest === 'win32') {
      assert.equal(tray.listenerCount('click'), 0)
      tray.emit('double-click')
      assert.equal(pet.isVisible(), true)
      tray.emit('right-click')
      assert.equal(tray.menuPopups, 1)
    }
    else if (platformUnderTest === 'linux') {
      assert.equal(tray.listenerCount('double-click'), 0)
      assert.equal(tray.listenerCount('right-click'), 0)
      tray.emit('click')
      assert.equal(pet.isVisible(), true)
    }
    else {
      assert.equal(tray.listenerCount('double-click'), 0)
      tray.emit('click')
      assert.equal(tray.menuPopups, 1)
      assert.equal(pet.isVisible(), false)
    }
    assert.equal(manager.getCurrentDisplayMode(), 'pets')
    assert.equal(pet.calls.includes('focus'), false)
  })
}
else {
  describe('restore current mode from tray/menu', () => {
    for (const mode of ['main', 'mini', 'chat'] as const) {
      it(`restores hidden and minimized ${mode} without switching modes`, () => {
        selectMode(mode)
        const win = latest(mode)
        win.hide()
        win.minimized = true
        win.calls = []
        manager.restoreCurrentModeWindow()
        assert.deepEqual(win.calls, ['restore', 'show', 'focus', 'moveTop'])
        assert.equal(manager.getCurrentDisplayMode(), mode)
        assert.equal(manager.getCurrentModeWindow(), win)
      })
    }

    for (const mode of ['pets', 'live2d'] as const) {
      it(`restores ${mode} and visible bubble without focusing or changing mode`, () => {
        selectMode(mode)
        const pet = latest(mode)
        const bubble = latest('bubble')
        ipc.emit('bubble:show')
        pet.hide()
        pet.minimized = true
        pet.calls = []
        bubble.calls = []
        const mainCount = windows.get('main')?.length
        manager.restoreCurrentModeWindow()
        assert.deepEqual(pet.calls, ['restore', 'setAlwaysOnTop', 'moveTop', 'showInactive'])
        assert.deepEqual(bubble.calls, ['setAlwaysOnTop', 'moveTop'])
        assert.equal(manager.getCurrentDisplayMode(), mode)
        assert.equal(windows.get('main')?.length, mainCount)
        const listeners = pet.listenerCount('move')
        pet.position = [400, 300]
        manager.restoreCurrentModeWindow()
        assert.equal(pet.listenerCount('move'), listeners)
        assert.notDeepEqual(bubble.position, [100, 200])
        bubble.hide()
        manager.restoreCurrentModeWindow()
        assert.equal(bubble.isVisible(), false)
      })
    }

    it('recreates absent windows in every current mode and ignores stale closed callbacks', () => {
      for (const mode of ['main', 'mini', 'chat', 'pets', 'live2d'] as const) {
        selectMode(mode)
        const old = latest(mode)
        old.destroyed = true
        const count = windows.get(mode)!.length
        manager.restoreCurrentModeWindow()
        const replacement = latest(mode)
        assert.notEqual(replacement, old)
        assert.equal(windows.get(mode)!.length, count + 1)
        assert.equal(manager.getCurrentDisplayMode(), mode)
        old.emit('closed')
        assert.equal(manager.getCurrentModeWindow(), replacement)
        replacement.close()
        manager.restoreCurrentModeWindow()
        assert.notEqual(manager.getCurrentModeWindow(), replacement)
        assert.equal(manager.getCurrentDisplayMode(), mode)
      }
    })

    it('puts display-window action above mode selection in tray and Dock menus', () => {
      selectMode('chat')
      for (const includeQuit of [true, false]) {
        const menu = menuBuilder.buildDisplayModeMenu(includeQuit)
        assert.equal(menu.items[0].label, '显示窗口')
        assert.equal(menu.items[2].label, '显示模式')
        const chat = latest('chat')
        chat.hide()
        menu.items[0].click?.(menu.items[0], null, {} as Electron.KeyboardEvent)
        assert.equal(chat.isVisible(), true)
        assert.equal(manager.getCurrentDisplayMode(), 'chat')
        assert.equal(menu.items.some(item => item.label === '退出'), includeQuit)
      }
    })

    for (const platform of ['win32', 'linux', 'darwin']) {
      it(`uses the ${platform} tray activation convention`, () => {
        const result = spawnSync(process.execPath, ['--test', __filename], {
          env: { ...process.env, XIAOZHI_TRAY_TEST_PLATFORM: platform },
          encoding: 'utf8',
        })
        assert.equal(result.status, 0, result.stdout + result.stderr)
      })
    }
  })
}
