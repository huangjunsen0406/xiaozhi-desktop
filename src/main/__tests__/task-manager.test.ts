import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TaskManager } from '../core/TaskManager'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('task manager shutdown', () => {
  it('rejects new factories after shutdown without starting work', async () => {
    const tasks = new TaskManager()
    let started = false
    tasks.requestShutdown()
    await tasks.waitShutdown()
    await assert.rejects(tasks.run(() => {
      started = true
      return 42
    }, 'new'), /正在关闭/)
    assert.equal(started, false)
    assert.equal(tasks.getActiveCount(), 0)
  })

  it('keeps already-started work tracked during shutdown and preserves its result', async () => {
    const tasks = new TaskManager()
    const pending = deferred<number>()
    tasks.requestShutdown()
    const result = tasks.track(pending.promise, 'started')
    const draining = tasks.drain(1000)
    assert.equal(tasks.getActiveCount(), 1)
    pending.resolve(42)
    assert.equal(await result, 42)
    await draining
    assert.equal(tasks.getActiveCount(), 0)
  })

  it('retains unfinished work after timeout rather than pretending it was cancelled', async () => {
    const tasks = new TaskManager()
    const pending = deferred<number>()
    const result = tasks.track(pending.promise, 'slow')
    await tasks.drain(0)
    assert.equal(tasks.getActiveCount(), 1)
    pending.resolve(7)
    assert.equal(await result, 7)
    assert.equal(tasks.getActiveCount(), 0)
  })

  it('drains work added by an already running task and preserves failures', async () => {
    const tasks = new TaskManager()
    const parent = deferred<void>()
    const child = deferred<void>()
    const tracked = tasks.track(parent.promise.then(() => {
      tasks.track(child.promise, 'child')
    }), 'parent')
    const draining = tasks.drain(1000)
    parent.resolve()
    await tracked
    assert.equal(tasks.getActiveCount(), 1)
    child.resolve()
    await draining
    assert.equal(tasks.getActiveCount(), 0)
    await assert.rejects(tasks.track(Promise.reject(new Error('failed')), 'failed'), /failed/)
  })
})
