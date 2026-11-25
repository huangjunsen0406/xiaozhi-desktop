<script setup lang="ts">
import type { SystemConfig } from '@shared/types'
import type { SettingsPanelHandle } from '../../types/settings'
import { NForm, NFormItem, NInput, NSelect, useMessage } from 'naive-ui'
import { onMounted, reactive, ref, toRaw } from 'vue'

const message = useMessage()

const DEFAULTS: SystemConfig = {
  client_id: '',
  device_id: '',
  ota_version_url: 'https://api.tenclass.net/xiaozhi/ota/',
  websocket_url: '',
  websocket_access_token: '',
  mqtt_endpoint: '',
  mqtt_client_id: '',
  mqtt_username: '',
  mqtt_password: '',
  mqtt_publish_topic: '',
  mqtt_subscribe_topic: '',
  activation_version: 'v2',
  authorization_url: 'https://xiaozhi.me/',
}

const persisted = ref<SystemConfig>({ ...DEFAULTS })
const form = reactive<SystemConfig>({ ...DEFAULTS })

function validate(): string | null {
  if (!form.ota_version_url.trim())
    return 'OTA 版本 URL 不能为空'
  return null
}

async function loadConfig() {
  try {
    const config = await window.api.systemGetConfig()
    persisted.value = { ...config }
    Object.assign(form, config)
  }
  catch (error) {
    console.error('加载配置异常:', error)
    message.error('加载配置异常')
  }
}

onMounted(() => {
  void loadConfig()
})

const CONNECTION_KEYS = [
  'ota_version_url',
  'device_id',
  'websocket_url',
  'websocket_access_token',
  'mqtt_endpoint',
  'mqtt_client_id',
  'mqtt_username',
  'mqtt_password',
  'mqtt_publish_topic',
  'mqtt_subscribe_topic',
  'authorization_url',
] as const

async function handleSave() {
  const err = validate()
  if (err)
    throw new Error(err)

  const snapshot = { ...toRaw(form) }
  const hasConnectionChange = CONNECTION_KEYS.some(key => snapshot[key] !== persisted.value[key])

  await window.api.systemUpdateConfig(snapshot)
  persisted.value = snapshot
  message.success(hasConnectionChange ? '已保存，连接已断开，请重新唤醒' : '系统设置已保存')
}

async function resetDraft() {
  Object.assign(form, DEFAULTS)
}

const panel = {
  persistence: 'explicit',
  save: handleSave,
  actions: { resetDraft: { label: '重置', run: resetDraft } },
} satisfies SettingsPanelHandle

defineExpose(panel)
</script>

<template>
  <div class="min-h-0">
    <NForm label-placement="left" :label-width="160">
      <NFormItem label="OTA 版本 URL">
        <NInput v-model:value="form.ota_version_url" placeholder="https://.../ota/" />
      </NFormItem>
      <NFormItem label="授权 URL">
        <NInput v-model:value="form.authorization_url" placeholder="https://xiaozhi.me/" />
      </NFormItem>
      <NFormItem label="设备ID">
        <NInput v-model:value="form.device_id" placeholder="请输入设备ID（如 MAC ）" />
      </NFormItem>
      <NFormItem label="客户端ID">
        <NInput v-model:value="form.client_id" disabled placeholder="请输入客户端ID" />
      </NFormItem>

      <NFormItem label="WebSocket URL">
        <NInput v-model:value="form.websocket_url" disabled placeholder="wss://..." />
      </NFormItem>
      <NFormItem label="WS 访问令牌">
        <NInput v-model:value="form.websocket_access_token" disabled placeholder="请输入访问令牌" />
      </NFormItem>

      <NFormItem label="MQTT Endpoint">
        <NInput v-model:value="form.mqtt_endpoint" disabled placeholder="mqtt.example.com" />
      </NFormItem>
      <NFormItem label="MQTT Client ID">
        <NInput v-model:value="form.mqtt_client_id" disabled placeholder="GID_xxx@@@..." />
      </NFormItem>
      <NFormItem label="MQTT Username">
        <NInput v-model:value="form.mqtt_username" disabled placeholder="用户名 / Token" />
      </NFormItem>
      <NFormItem label="MQTT Password">
        <NInput v-model:value="form.mqtt_password" disabled type="password" placeholder="密码 / Secret" />
      </NFormItem>
      <NFormItem label="发布 Topic">
        <NInput v-model:value="form.mqtt_publish_topic" disabled placeholder="device-server" />
      </NFormItem>
      <NFormItem label="订阅 Topic">
        <NInput v-model:value="form.mqtt_subscribe_topic" disabled placeholder="device-client / null" />
      </NFormItem>

      <NFormItem label="激活协议版本">
        <NSelect
          v-model:value="form.activation_version"
          disabled
          :options="[
            { label: 'v1', value: 'v1' },
            { label: 'v2', value: 'v2' },
          ]"
          placeholder="请选择激活协议版本"
        />
      </NFormItem>
    </NForm>
  </div>
</template>
