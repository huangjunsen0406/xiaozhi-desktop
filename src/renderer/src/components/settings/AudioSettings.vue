<script setup lang="ts">
import { NButton, NForm, NFormItem, NSelect, NSlider, NSpace, NSwitch } from 'naive-ui'
import { ref } from 'vue'

const enableMicrophone = ref(true)
const microphoneDevice = ref('')
const enableSpeaker = ref(true)
const speakerDevice = ref('')
const microphoneVolume = ref(80)
const speakerVolume = ref(70)
const enableNoiseReduction = ref(true)
const enableEchoCancellation = ref(true)

const microphoneDevices = ref([
  { label: '内置麦克风', value: 'built-in-mic' },
  { label: 'USB 麦克风 1', value: 'usb-mic-1' },
  { label: 'USB 麦克风 2', value: 'usb-mic-2' },
])

const speakerDevices = ref([
  { label: '内置扬声器', value: 'built-in-speaker' },
  { label: 'USB 扬声器 1', value: 'usb-speaker-1' },
  { label: '蓝牙耳机', value: 'bluetooth-headphones' },
])

function handleSave() {
  // TODO: 实现保存逻辑
  console.log('保存音频设置', {
    enableMicrophone: enableMicrophone.value,
    microphoneDevice: microphoneDevice.value,
    enableSpeaker: enableSpeaker.value,
    speakerDevice: speakerDevice.value,
    microphoneVolume: microphoneVolume.value,
    speakerVolume: speakerVolume.value,
    enableNoiseReduction: enableNoiseReduction.value,
    enableEchoCancellation: enableEchoCancellation.value,
  })
}

function testMicrophone() {
  // TODO: 实现测试麦克风功能
  console.log('测试麦克风')
}

function testSpeaker() {
  // TODO: 实现测试扬声器功能
  console.log('测试扬声器')
}

function refreshDevices() {
  // TODO: 实现刷新设备列表
  console.log('刷新音频设备列表')
}
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <!-- 麦克风设置 -->
    <NFormItem label="启用麦克风">
      <NSwitch v-model:value="enableMicrophone" />
    </NFormItem>
    <NFormItem label="麦克风设备" :disabled="!enableMicrophone">
      <NSpace>
        <NSelect
          v-model:value="microphoneDevice"
          :options="microphoneDevices"
          placeholder="请选择麦克风设备"
          :disabled="!enableMicrophone"
          style="width: 200px"
        />
        <NButton size="small" :disabled="!enableMicrophone" @click="testMicrophone">
          <template #icon>
            <icon-carbon-phone class="w-4 h-4" />
          </template>
          测试
        </NButton>
      </NSpace>
    </NFormItem>
    <NFormItem label="麦克风音量" :disabled="!enableMicrophone">
      <NSlider
        v-model:value="microphoneVolume"
        :min="0"
        :max="100"
        :step="1"
        :disabled="!enableMicrophone"
        style="width: 200px"
      />
    </NFormItem>

    <!-- 扬声器设置 -->
    <NFormItem label="启用扬声器">
      <NSwitch v-model:value="enableSpeaker" />
    </NFormItem>
    <NFormItem label="扬声器设备" :disabled="!enableSpeaker">
      <NSpace>
        <NSelect
          v-model:value="speakerDevice"
          :options="speakerDevices"
          placeholder="请选择扬声器设备"
          :disabled="!enableSpeaker"
          style="width: 200px"
        />
        <NButton size="small" :disabled="!enableSpeaker" @click="testSpeaker">
          <template #icon>
            <icon-carbon-phone class="w-4 h-4" />
          </template>
          测试
        </NButton>
      </NSpace>
    </NFormItem>
    <NFormItem label="扬声器音量" :disabled="!enableSpeaker">
      <NSlider
        v-model:value="speakerVolume"
        :min="0"
        :max="100"
        :step="1"
        :disabled="!enableSpeaker"
        style="width: 200px"
      />
    </NFormItem>

    <!-- 音频处理设置 -->
    <NFormItem label="噪音抑制">
      <NSwitch v-model:value="enableNoiseReduction" />
    </NFormItem>
    <NFormItem label="回声消除">
      <NSwitch v-model:value="enableEchoCancellation" />
    </NFormItem>

    <!-- 音频处理设置 -->
    <NFormItem label="噪音抑制">
      <NSwitch v-model:value="enableNoiseReduction" />
    </NFormItem>
    <NFormItem label="回声消除">
      <NSwitch v-model:value="enableEchoCancellation" />
    </NFormItem>

    <!-- 音频处理设置 -->
    <NFormItem label="噪音抑制">
      <NSwitch v-model:value="enableNoiseReduction" />
    </NFormItem>
    <NFormItem label="回声消除">
      <NSwitch v-model:value="enableEchoCancellation" />
    </NFormItem>

    <!-- 音频处理设置 -->
    <NFormItem label="噪音抑制">
      <NSwitch v-model:value="enableNoiseReduction" />
    </NFormItem>
    <NFormItem label="回声消除">
      <NSwitch v-model:value="enableEchoCancellation" />
    </NFormItem>

    <NSpace justify="end">
      <NButton secondary @click="refreshDevices">
        <template #icon>
          <icon-carbon-reset class="w-4 h-4" />
        </template>
        刷新设备
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
