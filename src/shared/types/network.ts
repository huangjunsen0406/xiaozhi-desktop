export interface MqttInfo {
  endpoint: string | null
  client_id: string | null
  username: string | null
  password: string | null
  publish_topic: string | null
  subscribe_topic: string | null
}

export interface NetworkConfig {
  websocket_url?: string | null
  websocket_access_token?: string | null
  mqtt_endpoint?: string | null
  mqtt_client_id?: string | null
  mqtt_username?: string | null
  mqtt_password?: string | null
  mqtt_publish_topic?: string | null
  mqtt_subscribe_topic?: string | null
}
