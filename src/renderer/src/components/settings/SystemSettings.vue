<script setup lang="ts">
import { NForm, NFormItem, NInput, NSelect, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'

interface SystemConfig {
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
    const result = await window.api.systemGetConfig()
    if (result?.success && result.data) {
      console.log('从数据库加载配置:', result.data)
      const config = result.data as SystemConfig
      persisted.value = cloneDeep(config)
      Object.assign(form, cloneDeep(config))
      console.log('配置加载成功')
    }
    else if (result?.error) {
      console.error('加载配置失败:', result.error)
      message.error(`加载配置失败: ${result.error}`)
    }
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
    const result = await window.api.systemUpdateConfig(toRaw(form))

    if (result?.success) {
      persisted.value = cloneDeep(toRaw(form))
      // eslint-disable-next-line vue/custom-event-name-casing
      emit('dirty-change', false)
      console.log('系统设置已保存', form)
      message.success('系统设置已保存')
    }
    else {
      throw new Error(result?.error || '保存失败')
    }
  }
  catch (error) {
    console.error('保存配置失败:', error)
    message.error(`保存失败: ${error}`)
    throw error
  }
}

async function handleCustomButton() {
  const snap = cloneDeep(DEFAULTS)
  Object.assign(form, snap)
}

defineExpose({ handleSave, handleCustomButton })
</script>

<template>
  <div class="min-h-0">
    <NForm label-placement="left" :label-width="160">
      <!-- 基本标识 -->
      <NFormItem label="客户端ID">
        <NInput v-model:value="form.client_id" disabled placeholder="请输入客户端ID" />
      </NFormItem>
      <NFormItem label="设备ID">
        <NInput v-model:value="form.device_id" placeholder="请输入设备ID（如 MAC ）" />
      </NFormItem>

      <!-- 网络配置 -->
      <NFormItem label="OTA 版本 URL">
        <NInput v-model:value="form.ota_version_url" placeholder="https://.../ota/" />
      </NFormItem>
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
      <NFormItem label="授权 URL">
        <NInput v-model:value="form.authorization_url" placeholder="https://xiaozhi.me/" />
      </NFormItem>
    </NForm>
  </div>
</template>
