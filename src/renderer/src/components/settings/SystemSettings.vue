<script setup lang="ts">
import { NButton, NForm, NFormItem, NInput, NSpace } from 'naive-ui'
import { ref } from 'vue'

const clientId = ref('ce807cd9-...')
const deviceId = ref('7e:e9:56:a4:86:10')
const authUrl = ref('https://xiaozhi.me/')

function handleSave() {
  // TODO: 实现保存逻辑
  console.log('保存系统设置', {
    clientId: clientId.value,
    deviceId: deviceId.value,
    authUrl: authUrl.value,
  })
}

function handleReset() {
  clientId.value = ''
  deviceId.value = ''
  authUrl.value = ''
}
</script>

<template>
  <NForm label-placement="left" :label-width="100">
    <NFormItem label="客户端ID">
      <NInput v-model:value="clientId" placeholder="请输入客户端ID" />
    </NFormItem>
    <NFormItem label="设备ID">
      <NInput v-model:value="deviceId" placeholder="请输入设备ID" />
    </NFormItem>
    <NFormItem label="授权URL">
      <NInput v-model:value="authUrl" placeholder="请输入授权URL" />
    </NFormItem>
    <NSpace justify="end">
      <NButton secondary @click="handleReset">
        <template #icon>
          <icon-carbon-reset class="w-4 h-4" />
        </template>
        重置
      </NButton>
      <NButton type="primary" @click="handleSave">
        <template #icon>
          <icon-carbon-save class="w-4 h-4" />
        </template>
        保存
      </NButton>
    </NSpace>
  </NForm>
</template>
