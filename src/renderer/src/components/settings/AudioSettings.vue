<script setup lang="ts">
import { NForm, NFormItem, NSelect, NSlider, NSwitch, useMessage } from 'naive-ui'
import { onMounted, ref, watch } from 'vue'

// 获取 message 实例
const message = useMessage()

// 表单数据
const enableMicrophone = ref(true)
const microphoneDevice = ref<string>('')
const enableSpeaker = ref(true)
const speakerDevice = ref<string>('')
const speakerVolume = ref(70)
const enableNoiseReduction = ref(true)
const enableEchoCancellation = ref(true)
const enableRealtimeConversation = ref(false) // 实时对话模式开关

// 系统音量控制支持标志
const systemVolumeSupported = ref(false)

// 设备列表
const microphoneDevices = ref<Array<{ label: string, value: string }>>([])
const speakerDevices = ref<Array<{ label: string, value: string }>>([])

// 刷新中状态
const isRefreshing = ref(false)

/**
 * 枚举音频设备
 */
async function enumerateDevices(): Promise<void> {
  try {
    isRefreshing.value = true

    // 请求麦克风权限（必须先获取权限才能看到设备标签）
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(track => track.stop())

    // 枚举设备
    const devices = await navigator.mediaDevices.enumerateDevices()

    // 过滤输入设备（排除 default 设备）
    const inputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default')
    microphoneDevices.value = inputs.map(d => ({
      label: d.label || `麦克风 ${d.deviceId.substring(0, 8)}`,
      value: d.deviceId,
    }))

    // 过滤输出设备（排除 default 设备）
    const outputs = devices.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default')
    speakerDevices.value = outputs.map(d => ({
      label: d.label || `扬声器 ${d.deviceId.substring(0, 8)}`,
      value: d.deviceId,
    }))

    console.log('音频设备枚举完成', {
      inputs: microphoneDevices.value.length,
      outputs: speakerDevices.value.length,
    })

    // 如果当前选择的设备不在列表中，选择第一个设备
    if (microphoneDevices.value.length > 0) {
      const currentExists = microphoneDevices.value.some(d => d.value === microphoneDevice.value)
      if (!currentExists) {
        microphoneDevice.value = microphoneDevices.value[0].value
      }
    }

    if (speakerDevices.value.length > 0) {
      const currentExists = speakerDevices.value.some(d => d.value === speakerDevice.value)
      if (!currentExists) {
        speakerDevice.value = speakerDevices.value[0].value
      }
    }
  }
  catch (error) {
    console.error('枚举音频设备失败:', error)
    message.error('枚举音频设备失败，请检查权限设置')
  }
  finally {
    isRefreshing.value = false
  }
}

/**
 * 加载音频配置
 */
async function loadConfig(): Promise<void> {
  try {
    // 检查系统音量控制是否支持
    systemVolumeSupported.value = await window.api.audioSystemVolumeSupported()
    console.log('系统音量控制支持:', systemVolumeSupported.value)

    const config = await window.api.audioGetConfig()

    // 加载配置
    enableNoiseReduction.value = config.enableNoiseReduction !== false
    enableEchoCancellation.value = config.enableEchoCancellation !== false
    enableRealtimeConversation.value = config.conversationMode === 'realtime'

    // 加载设备ID
    if (config.inputDeviceId) {
      microphoneDevice.value = config.inputDeviceId
    }
    if (config.outputDeviceId) {
      speakerDevice.value = config.outputDeviceId
    }

    if (systemVolumeSupported.value) {
      try {
        const systemVolume = await window.api.audioSystemGetVolume()
        speakerVolume.value = systemVolume
        console.log('从系统读取扬声器音量:', systemVolume)
      }
      catch (error) {
        console.warn('读取系统音量失败:', error)
        speakerVolume.value = 70
      }
    }

    console.log('音频配置已加载:', config)
  }
  catch (error) {
    console.error('加载音频配置失败:', error)
  }
}

/**
 * 保存配置
 */
async function handleSave(): Promise<void> {
  try {
    const config: any = {
      enableNoiseReduction: enableNoiseReduction.value,
      enableEchoCancellation: enableEchoCancellation.value,
      conversationMode: enableRealtimeConversation.value ? 'realtime' : 'auto',
    }

    if (microphoneDevice.value && microphoneDevice.value !== 'default') {
      config.inputDeviceId = microphoneDevice.value
    }
    if (speakerDevice.value && speakerDevice.value !== 'default') {
      config.outputDeviceId = speakerDevice.value
    }

    await window.api.audioUpdateConfig(config)

    console.log('音频配置已保存:', config)
    message.success('音频设置已保存')
  }
  catch (error) {
    console.error('保存音频配置失败:', error)
    message.error('保存失败')
  }
}

/**
 * 刷新设备列表
 */
async function handleCustomButton(): Promise<void> {
  await enumerateDevices()
  message.success('设备列表已刷新')
}

// 监听扬声器音量变化，实时设置系统音量
watch(speakerVolume, async (newVolume) => {
  if (systemVolumeSupported.value) {
    try {
      await window.api.audioSystemSetVolume(newVolume)
      console.log(`实时设置系统音量: ${newVolume}%`)
    }
    catch (error) {
      console.warn('实时设置系统音量失败:', error)
    }
  }
})

// 组件挂载时初始化
onMounted(async () => {
  await enumerateDevices()
  await loadConfig()
})

// 导出方法供父组件调用
defineExpose({ handleSave, handleCustomButton })
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <!-- 麦克风设置 -->
    <NFormItem label="启用麦克风">
      <NSwitch v-model:value="enableMicrophone" />
    </NFormItem>
    <NFormItem label="麦克风设备" :disabled="!enableMicrophone">
      <NSelect
        v-model:value="microphoneDevice"
        :options="microphoneDevices"
        placeholder="请选择麦克风设备"
        :disabled="!enableMicrophone"
        style="width: 300px"
      />
    </NFormItem>

    <!-- 扬声器设置 -->
    <NFormItem label="启用扬声器">
      <NSwitch v-model:value="enableSpeaker" />
    </NFormItem>
    <NFormItem label="扬声器设备" :disabled="!enableSpeaker">
      <NSelect
        v-model:value="speakerDevice"
        :options="speakerDevices"
        placeholder="请选择扬声器设备"
        :disabled="!enableSpeaker"
        style="width: 300px"
      />
    </NFormItem>
    <NFormItem label="扬声器音量" :disabled="!enableSpeaker">
      <div style="display: flex; flex-direction: column; gap: 4px; width: 300px">
        <NSlider
          v-model:value="speakerVolume"
          :min="0"
          :max="100"
          :step="1"
          :disabled="!enableSpeaker"
        />
        <span style="color: #999; font-size: 12px">
          当前系统音量: {{ speakerVolume }}% (实时跟随系统)
        </span>
      </div>
    </NFormItem>

    <!-- 音频处理设置 -->
    <NFormItem label="噪音抑制">
      <NSwitch v-model:value="enableNoiseReduction" />
    </NFormItem>
    <NFormItem label="回声消除">
      <NSwitch v-model:value="enableEchoCancellation" />
    </NFormItem>

    <!-- 对话模式设置 -->
    <NFormItem label="开启实时对话">
      <div style="display: flex; align-items: center; gap: 8px">
        <NSwitch v-model:value="enableRealtimeConversation" />
        <span style="color: #999; font-size: 12px">
          {{ enableRealtimeConversation ? '实时对话模式（全双工）' : '自动对话模式（回合制）' }}
        </span>
      </div>
    </NFormItem>

    <!-- 设备刷新提示 -->
    <NFormItem label=" " :show-label="false">
      <div style="color: #666; font-size: 12px">
        提示：如果设备未显示或更换了设备，请点击右下角"刷新设备"按钮
      </div>
    </NFormItem>
  </NForm>
</template>
