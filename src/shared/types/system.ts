/**
 * SystemConfig shares network field keys with NetworkFields,
 * but requires all values as non-nullable strings.
 */
export interface SystemConfig {
  client_id: string
  device_id: string
  ota_version_url: string
  websocket_url: string
  websocket_access_token: string
  mqtt_endpoint: string
  mqtt_client_id: string
  mqtt_username: string
  mqtt_password: string
  mqtt_publish_topic: string
  mqtt_subscribe_topic: string
  activation_version: string
  authorization_url: string
}

export interface OtaConfigResponse {
  websocket?: {
    url?: string
    token?: string
  }
  mqtt?: {
    endpoint?: string
    client_id?: string
    username?: string
    password?: string
    publish_topic?: string
    subscribe_topic?: string
  }
  activation?: {
    challenge: string
    code: string
    message?: string
  }
}
