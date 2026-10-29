import { parseServerMessage } from '@shared/types'

export interface UdpTransportConfig {
  server: string
  port: number
  key: string
  nonce: string
}

export interface MqttServerHello {
  sessionId: string
  udp: UdpTransportConfig
}

export function parseMqttServerHello(value: unknown): MqttServerHello | null {
  const message = parseServerMessage(value)
  if (message?.type !== 'hello' || message.transport !== 'udp')
    return null
  const udp = message.udp
  if (!udp || typeof udp.server !== 'string' || typeof udp.port !== 'number'
    || typeof udp.key !== 'string' || typeof udp.nonce !== 'string') {
    return null
  }
  return {
    sessionId: message.session_id ?? '',
    udp: { server: udp.server, port: udp.port, key: udp.key, nonce: udp.nonce },
  }
}
