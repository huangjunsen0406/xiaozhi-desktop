<script setup lang="ts">
import { NButton, NForm, NFormItem, NSelect, NSpace, NSwitch } from 'naive-ui'
import { ref } from 'vue'

const enableCamera = ref(true)
const cameraDevice = ref('')
const resolution = ref('1280x720')
const frameRate = ref(30)
const mirrorVideo = ref(false)

const cameraDevices = ref([
  { label: '内置摄像头', value: 'built-in' },
  { label: 'USB 摄像头 1', value: 'usb-1' },
  { label: 'USB 摄像头 2', value: 'usb-2' },
])

const resolutionOptions = [
  { label: '640x480', value: '640x480' },
  { label: '1280x720 (HD)', value: '1280x720' },
  { label: '1920x1080 (Full HD)', value: '1920x1080' },
  { label: '2560x1440 (2K)', value: '2560x1440' },
  { label: '3840x2160 (4K)', value: '3840x2160' },
]

const frameRateOptions = [
  { label: '15 FPS', value: 15 },
  { label: '24 FPS', value: 24 },
  { label: '30 FPS', value: 30 },
  { label: '60 FPS', value: 60 },
]

function handleSave() {
  // TODO: 实现保存逻辑
  console.log('保存摄像头设置', {
    enableCamera: enableCamera.value,
    cameraDevice: cameraDevice.value,
    resolution: resolution.value,
    frameRate: frameRate.value,
    mirrorVideo: mirrorVideo.value,
  })
}

function handleTest() {
  // TODO: 实现测试摄像头功能
  console.log('测试摄像头')
}

function refreshDevices() {
  // TODO: 实现刷新设备列表
  console.log('刷新摄像头设备列表')
}
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <NFormItem label="启用摄像头">
      <NSwitch v-model:value="enableCamera" />
    </NFormItem>
    <NFormItem label="摄像头设备" :disabled="!enableCamera">
      <NSpace>
        <NSelect
          v-model:value="cameraDevice"
          :options="cameraDevices"
          placeholder="请选择摄像头设备"
          :disabled="!enableCamera"
          style="width: 200px"
        />
        <NButton size="small" :disabled="!enableCamera" @click="refreshDevices">
          <template #icon>
            <!-- <icon-carbon-refresh class="w-4 h-4" /> -->
          </template>
          刷新
        </NButton>
      </NSpace>
    </NFormItem>
    <NFormItem label="分辨率" :disabled="!enableCamera">
      <NSelect
        v-model:value="resolution"
        :options="resolutionOptions"
        :disabled="!enableCamera"
      />
    </NFormItem>
    <NFormItem label="帧率" :disabled="!enableCamera">
      <NSelect
        v-model:value="frameRate"
        :options="frameRateOptions"
        :disabled="!enableCamera"
      />
    </NFormItem>
    <NFormItem label="镜像视频">
      <NSwitch v-model:value="mirrorVideo" :disabled="!enableCamera" />
    </NFormItem>
    <NSpace justify="end">
      <NButton secondary :disabled="!enableCamera" @click="handleTest">
        <template #icon>
          <icon-carbon-send-alt class="w-4 h-4" />
        </template>
        测试
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
