/**
 * 回归：CONNECTING 时 close() 不能变成主进程未捕获异常
 *
 * 运行：npx tsx --test src/main/__tests__/ws-close-socket.test.ts
 */

import type { AddressInfo } from 'node:net'
import assert from 'node:assert/strict'
import http from 'node:http'
import { describe, it } from 'node:test'
import WebSocket from 'ws'
import { closeWsSocket, WS_CONNECTING, WS_OPEN } from '../protocols/wsCloseSocket'

describe('closeWsSocket', () => {
  it('attaches an error sink before closing CONNECTING sockets', () => {
    let errorListener: ((error: Error) => void) | undefined
    const socket = {
      readyState: WS_CONNECTING,
      closeCalls: 0,
      close() {
        this.closeCalls++
      },
      once(event: 'error', listener: (error: Error) => void) {
        if (event === 'error')
          errorListener = listener
      },
    }

    closeWsSocket(socket)

    assert.equal(socket.closeCalls, 1)
    assert.equal(typeof errorListener, 'function')
    assert.doesNotThrow(() => {
      errorListener!(new Error('WebSocket was closed before the connection was established'))
    })
  })

  it('closes OPEN sockets without attaching a sink', () => {
    let onceCalls = 0
    const socket = {
      readyState: WS_OPEN,
      closeCalls: 0,
      close() {
        this.closeCalls++
      },
      once() {
        onceCalls++
      },
    }

    closeWsSocket(socket)

    assert.equal(socket.closeCalls, 1)
    assert.equal(onceCalls, 0)
  })

  it('does not emit uncaughtException when closing a real CONNECTING ws', async () => {
    const server = http.createServer()
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    const uncaught: Error[] = []
    const onUncaught = (error: Error) => {
      uncaught.push(error)
    }
    process.on('uncaughtException', onUncaught)

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      assert.equal(ws.readyState, WebSocket.CONNECTING)

      // 复现线上 cleanup：先卸监听再关
      ws.removeAllListeners()
      closeWsSocket(ws)

      await new Promise<void>(resolve => setTimeout(resolve, 50))
      assert.equal(
        uncaught.length,
        0,
        uncaught[0] ? `uncaught: ${uncaught[0].message}` : undefined,
      )
    }
    finally {
      process.off('uncaughtException', onUncaught)
      await new Promise<void>((resolve, reject) => {
        server.close(err => err ? reject(err) : resolve())
      })
    }
  })
})
