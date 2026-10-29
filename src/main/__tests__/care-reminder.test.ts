import type { CareReminderConfig, DeviceState, DisplayMode } from '@shared/types'
import type { NotificationConstructorOptions } from 'electron'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, beforeEach, describe, it, mock } from 'node:test'
import { ipcMain, ipcRenderer, powerMonitor } from 'electron'
import { bubbleApi } from '../../preload/modules/bubble'
import { canPresentCareReminder, presentCareReminder } from '../services/careReminderNotification'
import { startCareReminderService, startDemoRound, stopCareReminderService, updateCareReminderConfig } from '../services/CareReminderService'

interface TestNotification extends EventEmitter {
  options: NotificationConstructorOptions
}

class Surface {
  visible = true
  minimized = false
  destroyed = false
  isDestroyed = () => this.destroyed
  isVisible = () => this.visible
  isMinimized = () => this.minimized
}

class Contents extends EventEmitter {
  mainFrame = {}
  loading = false
  sent: Array<{ channel: string, payload: unknown }> = []
  isDestroyed = () => false
  isLoadingMainFrame = () => this.loading
  getURL = () => this.loading ? '' : 'app://bubble'
  send = (channel: string, payload: unknown) => { this.sent.push({ channel, payload }) }
}

class Bubble extends Surface {
  webContents = new Contents()
}

interface CareReminderRuntime {
  supported: boolean
  notificationResult: 'show' | 'failed' | 'pending'
  notifications: TestNotification[]
  mode: DisplayMode
  pet: Surface | null
  bubble: Bubble
  deviceState: DeviceState
  configPath: string
  locked: boolean
}

declare global {
  // eslint-disable-next-line vars-on-top -- Declaration for the runner's desktop boundary fixture.
  var __careReminderRuntime: CareReminderRuntime
}

const directory = mkdtempSync(join(tmpdir(), 'xiaozhi-care-test-'))
const eyesOnly: CareReminderConfig = { enabled: true, eyes: true, water: false, walk: false, sleep: false }
let day = 0

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++)
    await Promise.resolve()
}

beforeEach(() => {
  mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: new Date(2027, 0, ++day * 2, 10).getTime() })
  globalThis.__careReminderRuntime = {
    supported: true,
    notificationResult: 'show',
    notifications: [],
    mode: 'main',
    pet: null,
    bubble: new Bubble(),
    deviceState: 'idle',
    configPath: join(directory, 'care.json'),
    locked: false,
  }
  bubbleApi.onShowLocal(() => {})
})

afterEach(() => {
  stopCareReminderService()
  ipcRenderer.removeAllListeners()
  mock.timers.reset()
})

after(() => {
  assert.ok(directory.startsWith(join(tmpdir(), 'xiaozhi-care-test-')))
  rmSync(directory, { recursive: true })
})

describe('care reminder presentation', () => {
  it('uses one silent branded notification for non-pet, hidden, or minimized surfaces', async () => {
    const fixture = globalThis.__careReminderRuntime
    fixture.pet = new Surface()
    for (const mode of ['main', 'mini', 'chat', 'pets', 'live2d'] as const) {
      fixture.mode = mode
      fixture.pet.visible = mode !== 'pets'
      fixture.pet.minimized = mode === 'live2d'
      assert.equal(await presentCareReminder('喝口水', 5000, new AbortController().signal, () => true), true)
    }
    assert.equal(fixture.notifications.length, 5)
    assert.equal(fixture.bubble.webContents.sent.length, 0)
    const options = fixture.notifications[0].options
    assert.equal(options.title, '小智 · 关怀提醒')
    assert.equal(options.body, '喝口水')
    assert.equal(options.silent, true)
    assert.equal(options.icon, 'care-test-icon.png')
  })

  it('waits for the first bubble load and sends only to its renderer', async () => {
    const fixture = globalThis.__careReminderRuntime
    fixture.mode = 'pets'
    fixture.pet = new Surface()
    fixture.bubble.webContents.loading = true
    fixture.bubble.webContents.emit('did-start-loading')
    const showing = presentCareReminder('歇歇眼睛', 5000, new AbortController().signal, () => true)
    assert.equal(fixture.bubble.webContents.sent.length, 0)
    fixture.bubble.webContents.loading = false
    fixture.bubble.webContents.emit('did-finish-load')
    await flush()
    assert.equal(fixture.bubble.webContents.sent.length, 0)
    let received = ''
    const unsubscribe = bubbleApi.onShowLocal(payload => received = payload.text)
    assert.equal(await showing, true)
    ipcRenderer.emit('bubble:show-local', {}, { text: '歇歇眼睛', durationMs: 5000, source: 'reminder' })
    assert.equal(received, '歇歇眼睛')
    unsubscribe()
    assert.deepEqual(fixture.bubble.webContents.sent, [{ channel: 'bubble:show-local', payload: { text: '歇歇眼睛', durationMs: 5000, source: 'reminder' } }])
    assert.equal(fixture.notifications.length, 0)
  })

  it('rechecks pet visibility after load and cancels pending delivery on stop', async () => {
    const fixture = globalThis.__careReminderRuntime
    fixture.mode = 'pets'
    fixture.pet = new Surface()
    fixture.bubble.webContents.loading = true
    fixture.bubble.webContents.emit('did-start-loading')
    const showing = presentCareReminder('提醒', 5000, new AbortController().signal, () => true)
    fixture.pet.visible = false
    bubbleApi.onShowLocal(() => {})
    assert.equal(await showing, true)
    assert.equal(fixture.notifications.length, 1)
    assert.equal(fixture.bubble.webContents.sent.length, 0)
    fixture.notificationResult = 'pending'
    const controller = new AbortController()
    const pending = presentCareReminder('第二次', 5000, controller.signal, () => true)
    controller.abort()
    assert.equal(await pending, false)
  })

  it('rejects other senders and child frames and cleans readiness waits on abort or timeout', async () => {
    const fixture = globalThis.__careReminderRuntime
    fixture.mode = 'pets'
    fixture.pet = new Surface()
    const contents = fixture.bubble.webContents
    contents.emit('did-start-loading')
    const baseListeners = ipcMain.listenerCount('bubble:local-ready')
    const controller = new AbortController()
    const pending = presentCareReminder('等待订阅', 5000, controller.signal, () => true)
    const other = new Contents()
    ipcMain.emit('bubble:local-ready', { sender: other, senderFrame: other.mainFrame })
    ipcMain.emit('bubble:local-ready', { sender: contents, senderFrame: {} })
    await flush()
    assert.equal(contents.sent.length, 0)
    assert.equal(ipcMain.listenerCount('bubble:local-ready'), baseListeners + 1)
    controller.abort()
    assert.equal(await pending, false)
    assert.equal(ipcMain.listenerCount('bubble:local-ready'), baseListeners)
    const timedOut = presentCareReminder('超时回退', 5000, new AbortController().signal, () => true)
    mock.timers.tick(10000)
    assert.equal(await timedOut, true)
    assert.equal(contents.sent.length, 0)
    assert.equal(fixture.notifications.length, 1)
    assert.equal(ipcMain.listenerCount('bubble:local-ready'), baseListeners)
    const destroyed = presentCareReminder('已销毁', 5000, new AbortController().signal, () => true)
    contents.emit('destroyed')
    assert.equal(await destroyed, true)
    assert.equal(ipcMain.listenerCount('bubble:local-ready'), baseListeners)
  })

  it('reports unsupported, failed, and unconfirmed notifications as unsuccessful', async () => {
    const fixture = globalThis.__careReminderRuntime
    fixture.supported = false
    assert.equal(canPresentCareReminder(), false)
    assert.equal(await presentCareReminder('提醒', 5000, new AbortController().signal, () => true), false)
    fixture.supported = true
    fixture.notificationResult = 'failed'
    assert.equal(await presentCareReminder('提醒', 5000, new AbortController().signal, () => true), false)
    fixture.notificationResult = 'pending'
    const pending = presentCareReminder('提醒', 5000, new AbortController().signal, () => true)
    mock.timers.tick(10000)
    assert.equal(await pending, false)
  })
})

describe('care reminder scheduling', () => {
  it('records cooldown only after successful display and preserves it across config reload', async () => {
    const fixture = globalThis.__careReminderRuntime
    fixture.notificationResult = 'failed'
    await updateCareReminderConfig(eyesOnly)
    await startCareReminderService()
    mock.timers.tick(120000)
    await flush()
    assert.equal(fixture.notifications.length, 1)
    fixture.notificationResult = 'show'
    await updateCareReminderConfig(eyesOnly)
    mock.timers.tick(120000)
    await flush()
    assert.equal(fixture.notifications.length, 2)
    await updateCareReminderConfig(eyesOnly)
    mock.timers.tick(120000)
    await flush()
    assert.equal(fixture.notifications.length, 2)
  })

  it('skips quiet hours, speaking and connecting for both delivery paths', async () => {
    const fixture = globalThis.__careReminderRuntime
    await updateCareReminderConfig(eyesOnly)
    await startCareReminderService()
    fixture.deviceState = 'speaking'
    mock.timers.tick(120000)
    await flush()
    assert.equal(fixture.notifications.length, 0)
    assert.equal(startDemoRound().started, false)
    fixture.deviceState = 'connecting'
    assert.equal(startDemoRound().started, false)
    fixture.deviceState = 'idle'
    mock.timers.setTime(new Date(2027, 0, day * 2, 1).getTime())
    await updateCareReminderConfig(eyesOnly)
    mock.timers.tick(120000)
    await flush()
    assert.equal(fixture.notifications.length, 0)
  })

  it('discards sleeping and locked backlog and never resumes after stop', async () => {
    const fixture = globalThis.__careReminderRuntime
    await updateCareReminderConfig(eyesOnly)
    await startCareReminderService()
    powerMonitor.emit('suspend')
    mock.timers.tick(3 * 60 * 60 * 1000)
    await flush()
    assert.equal(fixture.notifications.length, 0)
    powerMonitor.emit('resume')
    mock.timers.tick(119999)
    assert.equal(fixture.notifications.length, 0)
    mock.timers.tick(1)
    await flush()
    assert.equal(fixture.notifications.length, 1)
    powerMonitor.emit('lock-screen')
    assert.equal(startDemoRound().started, false)
    stopCareReminderService()
    powerMonitor.emit('unlock-screen')
    powerMonitor.emit('resume')
    mock.timers.tick(60 * 60 * 1000)
    await flush()
    assert.equal(fixture.notifications.length, 1)
    assert.equal(powerMonitor.listenerCount('resume'), 0)
  })

  it('demos work without pets and bypass disabled config but use the same surface rules', async () => {
    const fixture = globalThis.__careReminderRuntime
    await updateCareReminderConfig({ ...eyesOnly, enabled: false })
    await startCareReminderService()
    assert.equal(startDemoRound().started, true)
    mock.timers.tick(0)
    await flush()
    assert.equal(fixture.notifications.length, 1)
    fixture.mode = 'live2d'
    fixture.pet = new Surface()
    mock.timers.tick(5000)
    await flush()
    assert.equal(fixture.notifications.length, 1)
    assert.equal(fixture.bubble.webContents.sent.length, 1)
    powerMonitor.emit('suspend')
    mock.timers.tick(20000)
    await flush()
    assert.equal(fixture.bubble.webContents.sent.length, 1)
  })

  it('records one successful sleep reminder per night without consuming failed attempts', async () => {
    const fixture = globalThis.__careReminderRuntime
    mock.timers.setTime(new Date(2027, 0, day * 2, 23).getTime())
    const config = { ...eyesOnly, eyes: false, sleep: true }
    fixture.notificationResult = 'failed'
    await updateCareReminderConfig(config)
    await startCareReminderService()
    mock.timers.tick(180000)
    await flush()
    assert.equal(fixture.notifications.length, 1)
    fixture.notificationResult = 'show'
    mock.timers.tick(300000)
    await flush()
    assert.equal(fixture.notifications.length, 2)
    await updateCareReminderConfig(config)
    mock.timers.tick(180000)
    await flush()
    assert.equal(fixture.notifications.length, 2)
  })
})
