<script setup lang="ts">
import type { SystemConfig } from '@shared/types'
import type { SettingsPanelHandle } from '../../types/settings'
import { NForm, NFormItem, NInput, NSelect, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'

const emit = defineEmits<{ (e: 'dirty-change', dirty: boolean): void }>()

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

const persisted = ref<SystemConfig>(cloneDeep(DEFAULTS))

const form = reactive(cloneDeep(DEFAULTS))

const isDirty = computed(() => JSON.stringify(form) !== JSON.stringify(persisted.value))
// eslint-disable-next-line vue/custom-event-name-casing
watch(isDirty, v => emit('dirty-change', v), { immediate: true })

function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}
function validate(): string | null {
  if (!form.ota_version_url)
    return 'OTA 版本 URL 不能为空'
  if (form.websocket_url && !/^wss?:\/\//i.test(form.websocket_url))
    return 'WebSocket URL 格式不正确'
  return null
}

/**
 * 从数据库加载配置
 */
async function loadConfig() {
  try {
    const config = await window.api.systemGetConfig()
    console.log('从数据库加载配置:', config)
    persisted.value = cloneDeep(config)
    Object.assign(form, cloneDeep(config))
    console.log('配置加载成功')
  }
  catch (error) {
    console.error('加载配置异常:', error)
    message.error('加载配置异常')
  }
}

// 组件挂载时加载配置
onMounted(() => {
  loadConfig()
})

async function handleSave() {
  const err = validate()
  if (err)
    throw new Error(err)

  try {
    // 检查是否有连接相关字段发生变化
    const connectionKeys = [
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
    const hasConnectionChange = connectionKeys.some(
      key => toRaw(form)[key] !== persisted.value[key],
    )

    await window.api.systemUpdateConfig(toRaw(form))
    persisted.value = cloneDeep(toRaw(form))
    // eslint-disable-next-line vue/custom-event-name-casing
    emit('dirty-change', false)
    console.log('系统设置已保存', form)
    message.success(hasConnectionChange ? '已保存，连接已断开，请重新唤醒' : '系统设置已保存')
  }
  catch (error) {
    console.error('保存配置失败:', error)
    message.error(`保存失败: ${error}`)
    throw error
  }
}

async function resetDraft() {
  const snap = cloneDeep(DEFAULTS)
  Object.assign(form, snap)
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
      <!-- 自定义 -->
      <NFormItem label="OTA 版本 URL">
        <NInput v-model:value="form.ota_version_url" placeholder="https://.../ota/" />
      </NFormItem>
      <NFormItem label="授权 URL">
        <NInput v-model:value="form.authorization_url" placeholder="https://xiaozhi.me/" />
      </NFormItem>
      <NFormItem label="设备ID">
        <NInput v-model:value="form.device_id" placeholder="请输入设备ID（如 MAC ）" />
      </NFormItem>
      <!-- 基本标识 -->
      <NFormItem label="客户端ID">
        <NInput v-model:value="form.client_id" disabled placeholder="请输入客户端ID" />
      </NFormItem>

      <!-- 网络配置 -->
      <NFormItem label="WebSocket URL">
        <NInput v-model:value="form.websocket_url" disabled placeholder="wss://..." />
      </NFormItem>
      <NFormItem label="WS 访问令牌">
        <NInput v-model:value="form.websocket_access_token" disabled placeholder="请输入访问令牌" />
      </NFormItem>

      <!-- MQTT 配置 -->
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

      <!-- 其他 -->
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
