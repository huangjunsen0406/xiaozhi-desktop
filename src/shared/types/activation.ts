export interface ActivationData {
  client_id?: string
  otp?: string
  mac_address?: string
  challenge?: string
  code?: string
  message?: string
}

export interface ActivationResult {
  success: boolean
  message?: string
  websocket_url?: string
  access_token?: string
  error?: string
}

export interface ActivationStatus {
  activated: boolean
  message?: string
}

export interface ActivationInitResult {
  success: boolean
  need_activation_ui: boolean
  error?: string
}
