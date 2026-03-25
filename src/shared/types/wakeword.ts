export interface WakeWordConfig {
  enabled: boolean
  language: string
  keyword?: string
  keyword_zh?: string
  keyword_en?: string
  keywords_list?: string
  sensitivity?: number
  threshold?: number
  score?: number
  cooldown_ms?: number
}
