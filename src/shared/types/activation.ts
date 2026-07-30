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

/** initialize 成功后的 data 载荷（外层由 IpcResult 包装） */
export interface ActivationInitResult {
  need_activation_ui: boolean
  status_message?: string
}
