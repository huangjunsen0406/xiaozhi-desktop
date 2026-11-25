export interface MqttInfo {
  endpoint: string | null
  client_id: string | null
  username: string | null
  password: string | null
  publish_topic: string | null
  subscribe_topic: string | null
}
