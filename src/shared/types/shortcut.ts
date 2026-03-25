export interface ShortcutConfig {
  id: number
  action: string
  name: string
  category: string
  accelerator: string | null
  enabled: number
  is_global: number
}
