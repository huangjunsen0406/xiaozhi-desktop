export type MaybePromise<T> = T | Promise<T>

export interface SettingsPanelAction {
  label: string
  run: () => MaybePromise<void>
}

export type SettingsPanelHandle = {
  actions?: Record<string, SettingsPanelAction>
} & (
  | { persistence: 'explicit', save: () => MaybePromise<void> }
  | { persistence: 'immediate', save?: never }
)
