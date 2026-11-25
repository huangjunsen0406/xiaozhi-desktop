import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { MqttProtocol } from '../protocols/MqttProtocol'
import { parseMqttServerHello } from '../protocols/mqttServerHello'

const TEST_AES_KEY_HEX = '00112233445566778899aabbccddeeff'
const TEST_AES_NONCE_HEX = '01020000112233445566778800000000'

class FakeMqttClient extends EventEmitter {
  connected = false
  subscribedTopics: string[] = []
  publishedMessages: Array<{ topic: string, payload: string }> = []
  ended = false

  async subscribeAsync(topic: string): Promise<void> {
    this.subscribedTopics.push(topic)
  }

  async publishAsync(topic: string, payload: string): Promise<void> {
    this.publishedMessages.push({ topic, payload })
  }

  async endAsync(): Promise<void> {
    this.ended = true
    this.connected = false
  }
}

class FakeUdpSocket extends EventEmitter {
  sentPackets: Array<{ data: Buffer, port: number, host: string }> = []
  closed = false

  address() {
    return { address: '127.0.0.1', port: 45678 }
  }

  send(data: Buffer, port: number, host: string, cb?: (err: Error | null) => void): void {
    this.sentPackets.push({ data: Buffer.from(data), port, host })
    queueMicrotask(() => cb?.(null))
  }

  close(): void {
    this.closed = true
  }
}

interface MqttRuntime {
  connectCalls: Array<{ url: string, opts: Record<string, unknown> }>
  client: FakeMqttClient
  socket: FakeUdpSocket
  connect: (url: string, opts: Record<string, unknown>) => FakeMqttClient
  createSocket: () => FakeUdpSocket
  configManager: { getMqttInfo: () => Record<string, unknown> | null }
  audioRuntime: { getUplinkParams: () => Record<string, unknown> }
}

let runtime: MqttRuntime

beforeEach(() => {
  const client = new FakeMqttClient()
  const socket = new FakeUdpSocket()
  const connectCalls: Array<{ url: string, opts: Record<string, unknown> }> = []

  runtime = {
    connectCalls,
    client,
    socket,
    connect: (url, opts) => {
      connectCalls.push({ url, opts })
      queueMicrotask(() => {
        client.connected = true
        client.emit('connect')
      })
      return client
    },
    createSocket: () => socket,
    configManager: {
      getMqttInfo: () => ({
        endpoint: 'broker.example.com:8883',
        client_id: 'cid-1',
        username: 'user',
        password: 'secret',
        publish_topic: 'device/pub',
        subscribe_topic: 'device/sub',
      }),
    },
    audioRuntime: {
      getUplinkParams: () => ({
        format: 'opus',
        sample_rate: 16000,
        channels: 1,
        frame_duration: 20,
      }),
    },
  }

  Object.assign(globalThis, { __mqttTestRuntime: runtime })
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__mqttTestRuntime
})

describe('parseMqttServerHello', () => {
  it('accepts valid UDP hello payloads and rejects malformed ones', () => {
    const parsed = parseMqttServerHello({
      type: 'hello',
      transport: 'udp',
      session_id: 'sess-1',
      udp: {
        server: '127.0.0.1',
        port: 9000,
        key: TEST_AES_KEY_HEX,
        nonce: TEST_AES_NONCE_HEX,
      },
    })
    assert.deepEqual(parsed, {
      sessionId: 'sess-1',
      udp: {
        server: '127.0.0.1',
        port: 9000,
        key: TEST_AES_KEY_HEX,
        nonce: TEST_AES_NONCE_HEX,
      },
    })

    assert.equal(parseMqttServerHello({ type: 'hello', transport: 'websocket' }), null)
    assert.equal(parseMqttServerHello({ type: 'hello', transport: 'udp', udp: { server: '', port: 0 } }), null)
    assert.equal(parseMqttServerHello(null), null)
  })
})

describe('MqttProtocol', () => {
  it('fires onAudioChannelOpened once after UDP punch packet succeeds and round-trips AES-128-CTR audio', async () => {
    const protocol = new MqttProtocol()
    const events: string[] = []
    const receivedAudio: Buffer[] = []

    protocol.onAudioChannelOpened(() => {
      events.push(`opened:udpSent=${runtime.socket.sentPackets.length}`)
    })
    protocol.onIncomingAudio((audio) => {
      receivedAudio.push(audio)
    })

    // Auto-reply with server hello when client publishes hello
    const origPublish = runtime.client.publishAsync.bind(runtime.client)
    runtime.client.publishAsync = async (topic: string, payload: string) => {
      await origPublish(topic, payload)
      const msg = JSON.parse(payload) as { type?: string }
      if (msg.type === 'hello') {
        queueMicrotask(() => {
          runtime.client.emit('message', 'device/sub', Buffer.from(JSON.stringify({
            type: 'hello',
            transport: 'udp',
            session_id: 'sess-42',
            udp: {
              server: '10.0.0.1',
              port: 12345,
              key: TEST_AES_KEY_HEX,
              nonce: TEST_AES_NONCE_HEX,
            },
          })))
        })
      }
    }

    const ok = await protocol.openAudioChannel()
    assert.equal(ok, true)
    assert.equal(runtime.connectCalls[0]?.url, 'mqtts://broker.example.com:8883')
    assert.deepEqual(runtime.client.subscribedTopics, ['device/sub'])
    assert.deepEqual(events, ['opened:udpSent=1'])
    assert.equal(protocol.isAudioChannelOpened(), true)

    // Encrypt and send an audio frame, then feed that exact UDP packet back to verify decrypt round-trip
    const plainOpus = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03, 0x04])
    const sent = await protocol.sendAudio(plainOpus)
    assert.equal(sent, true)
    assert.equal(runtime.socket.sentPackets.length, 2)

    const encryptedPacket = runtime.socket.sentPackets[1].data
    assert.equal(encryptedPacket.length, 16 + plainOpus.length)
    assert.equal(encryptedPacket.readUInt16BE(2), plainOpus.length)
    assert.equal(encryptedPacket.readUInt32BE(12), 1)

    runtime.socket.emit('message', encryptedPacket)
    assert.equal(receivedAudio.length, 1)
    assert.deepEqual(receivedAudio[0], plainOpus)

    await protocol.closeAudioChannel()
    assert.equal(protocol.isAudioChannelOpened(), false)
    assert.equal(runtime.socket.closed, true)
    assert.equal(runtime.client.ended, true)
  })

  it('cleans up cleanly on unexpected disconnect and notifies closed + error callbacks once', async () => {
    const protocol = new MqttProtocol()
    let closedCount = 0
    const errors: string[] = []
    protocol.onAudioChannelClosed(() => {
      closedCount++
    })
    protocol.onNetworkError((msg) => {
      errors.push(msg)
    })

    const origPublish = runtime.client.publishAsync.bind(runtime.client)
    runtime.client.publishAsync = async (topic: string, payload: string) => {
      await origPublish(topic, payload)
      if ((JSON.parse(payload) as { type?: string }).type === 'hello') {
        queueMicrotask(() => {
          runtime.client.emit('message', 'device/sub', Buffer.from(JSON.stringify({
            type: 'hello',
            transport: 'udp',
            session_id: 'sess-99',
            udp: {
              server: '10.0.0.1',
              port: 12345,
              key: TEST_AES_KEY_HEX,
              nonce: TEST_AES_NONCE_HEX,
            },
          })))
        })
      }
    }

    assert.equal(await protocol.openAudioChannel(), true)
    runtime.client.emit('offline')
    runtime.client.emit('disconnect')
    await new Promise(resolve => setImmediate(resolve))

    assert.equal(closedCount, 1)
    assert.equal(errors.length, 1)
    assert.equal(protocol.isAudioChannelOpened(), false)
  })
})
