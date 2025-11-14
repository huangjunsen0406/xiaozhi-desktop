<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { NForm, NFormItem, NInput, NSelect, useMessage } from 'naive-ui'
import { computed, reactive, toRaw, watch } from 'vue'

/* ======================= Types ======================= */
interface MqttInfo {
  endpoint: string
  client_id: string
  username: string
  password: string
  publish_topic: string
  subscribe_topic: string
}
interface NetworkOptions {
  OTA_VERSION_URL: string
  WEBSOCKET_URL: string
  WEBSOCKET_ACCESS_TOKEN: string
  MQTT_INFO: MqttInfo
  ACTIVATION_VERSION: string
  AUTHORIZATION_URL: string
}
interface SystemOptions {
  CLIENT_ID: string
  DEVICE_ID: string
  NETWORK: NetworkOptions
}

/** 脏检查（父组件可用来点亮“保存”） */
const emit = defineEmits<{ (e: 'dirty-change', dirty: boolean): void }>()

/* ======================= Defaults ======================= */
const DEFAULTS: SystemOptions = {
  CLIENT_ID: 'ce807cd9-2714-4a07-aaf2-0fc7355d4b87',
  DEVICE_ID: '7e:e9:56:a4:86:10',
  NETWORK: {
    OTA_VERSION_URL: 'https://api.tenclass.net/xiaozhi/ota/',
    WEBSOCKET_URL: 'wss://api.tenclass.net/xiaozhi/v1/',
    WEBSOCKET_ACCESS_TOKEN: 'test-token',
    MQTT_INFO: {
      endpoint: 'mqtt.xiaozhi.me',
      client_id: 'GID_test@@@7e_e9_56_a4_86_10@@@ce807cd9-2714-4a07-aaf2-0fc7355d4b87',
      username: 'eyJpcCI6IjExMi45Ni4xMTAuMTU4In0=',
      password: 'cao2qZv7Iph1d49y5zRyG3aCxcsm7gfQJccFuOHTe+w=',
      publish_topic: 'device-server',
      subscribe_topic: 'null',
    },
    ACTIVATION_VERSION: 'v2',
    AUTHORIZATION_URL: 'https://xiaozhi.me/',
  },
}

/* ======================= State ======================= */
/** 仅用作持久化基线；不要把它直接 v-model 到表单 */
const persisted = useStorage<SystemOptions>('SYSTEM_OPTIONS', DEFAULTS)

/** 工作副本：编辑时改这里，点击“保存”再写回 persisted */
const form = reactive(cloneDeep(persisted.value))

const isDirty = computed(() => JSON.stringify(form) !== JSON.stringify(persisted.value))
// eslint-disable-next-line vue/custom-event-name-casing
watch(isDirty, v => emit('dirty-change', v), { immediate: true })

/* ======================= Utils ======================= */
function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}
function validate(): string | null {
  if (!form.NETWORK.OTA_VERSION_URL)
    return 'OTA 版本 URL 不能为空'
  if (!/^wss?:\/\//i.test(form.NETWORK.WEBSOCKET_URL))
    return 'WebSocket URL 格式不正确'
  if (!form.NETWORK.MQTT_INFO.endpoint)
    return 'MQTT Endpoint 不能为空'
  return null
}

/* ======================= Exposed API ======================= */
const message = useMessage()

async function handleSave() {
  const err = validate()
  if (err)
    throw new Error(err)

  // TODO: 在这里做 IPC/HTTP 提交；成功后再落盘
  // await window.electron?.ipcRenderer.invoke('settings:save', toRaw(form))

  // 写回存储作为新基线
  persisted.value = cloneDeep(toRaw(form))
  // eslint-disable-next-line vue/custom-event-name-casing
  emit('dirty-change', false)
  console.log('系统设置已保存', form)

  message.success('系统设置已保存')
}

async function handleCustomButton() {
  // 重置工作副本为默认值（不立即写盘；等父组件点保存）
  const snap = cloneDeep(DEFAULTS)
  Object.assign(form, snap) // 顶层替换
  // 深层也要替换（Object.assign 只会合并一层）：
  Object.assign(form.NETWORK, snap.NETWORK)
  Object.assign(form.NETWORK.MQTT_INFO, snap.NETWORK.MQTT_INFO)
}

defineExpose({ handleSave, handleCustomButton })
</script>

<template>
  <!-- 关键：根容器可收缩，避免把父级滚动区顶开 -->
  <div class="min-h-0">
    <NForm label-placement="left" :label-width="160">
      <!-- 基本标识 -->
      <NFormItem label="客户端ID">
        <NInput v-model:value="form.CLIENT_ID" placeholder="请输入客户端ID" />
      </NFormItem>
      <NFormItem label="设备ID">
        <NInput v-model:value="form.DEVICE_ID" placeholder="请输入设备ID（如 MAC ）" />
      </NFormItem>

      <!-- 网络配置 -->
      <NFormItem label="OTA 版本 URL">
        <NInput v-model:value="form.NETWORK.OTA_VERSION_URL" placeholder="https://.../ota/" />
      </NFormItem>
      <NFormItem label="WebSocket URL">
        <NInput v-model:value="form.NETWORK.WEBSOCKET_URL" placeholder="wss://..." />
      </NFormItem>
      <NFormItem label="WS 访问令牌">
        <NInput v-model:value="form.NETWORK.WEBSOCKET_ACCESS_TOKEN" placeholder="请输入访问令牌" />
      </NFormItem>

      <!-- MQTT 配置 -->
      <NFormItem label="MQTT Endpoint">
        <NInput v-model:value="form.NETWORK.MQTT_INFO.endpoint" placeholder="mqtt.example.com" />
      </NFormItem>
      <NFormItem label="MQTT Client ID">
        <NInput v-model:value="form.NETWORK.MQTT_INFO.client_id" placeholder="GID_xxx@@@..." />
      </NFormItem>
      <NFormItem label="MQTT Username">
        <NInput v-model:value="form.NETWORK.MQTT_INFO.username" placeholder="用户名 / Token" />
      </NFormItem>
      <NFormItem label="MQTT Password">
        <NInput v-model:value="form.NETWORK.MQTT_INFO.password" type="password" placeholder="密码 / Secret" />
      </NFormItem>
      <NFormItem label="发布 Topic">
        <NInput v-model:value="form.NETWORK.MQTT_INFO.publish_topic" placeholder="device-server" />
      </NFormItem>
      <NFormItem label="订阅 Topic">
        <NInput v-model:value="form.NETWORK.MQTT_INFO.subscribe_topic" placeholder="device-client / null" />
      </NFormItem>

      <!-- 其他 -->
      <NFormItem label="激活协议版本">
        <NSelect
          v-model:value="form.NETWORK.ACTIVATION_VERSION"
          :options="[
            { label: 'v1', value: 'v1' },
            { label: 'v2', value: 'v2' }
          ]"
          placeholder="请选择激活协议版本"
        />
      </NFormItem>
      <NFormItem label="授权 URL">
        <NInput v-model:value="form.NETWORK.AUTHORIZATION_URL" placeholder="https://xiaozhi.me/" />
      </NFormItem>
    </NForm>
  </div>
</template>
