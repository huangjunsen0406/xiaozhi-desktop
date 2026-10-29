export interface WakeWordConfig {
  enabled: boolean
  language: string
  keyword?: string
  threshold?: number
  score?: number
  cooldownMs?: number
  /** 唤醒后把唤醒词当用户输入发给服务端（主动问候）；默认 false，只进入聆听 */
  greet?: boolean
}
