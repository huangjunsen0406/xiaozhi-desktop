<script setup lang="ts">
import type { AudioConfig } from '@shared/types'
import { NForm, NFormItem, NSelect, NSlider, NSwitch, useMessage } from 'naive-ui'
import { onMounted, ref, watch } from 'vue'
import { useDevices } from '../../composables/useDevices'

// 获取 message 实例
const message = useMessage()

// 使用设备管理 Composable
const {
  inputDevices,
  outputDevices,
  selectedInputDevice,
  selectedOutputDevice,
  isEnumerating,
  enumerateDevices,
  autoSelectInputDevice,
  autoSelectOutputDevice,
  loadDevicesFromConfig,
  getDeviceLabelById,
} = useDevices()

// 表单数据
const speakerVolume = ref(70)
const enableNoiseReduction = ref(true)
const enableEchoCancellation = ref(true)
const enableRealtimeConversation = ref(false) // 实时对话模式开关

// 高级音频参数
const inputSampleRate = ref(16000)
const outputSampleRate = ref(24000)
const channels = ref(1)
const frameDuration = ref(20)

// 选项配置
const sampleRateOptions = [
  { label: '8000 Hz', value: 8000 },
  { label: '16000 Hz', value: 16000 },
  { label: '24000 Hz', value: 24000 },
  { label: '48000 Hz', value: 48000 },
]

const channelOptions = [
  { label: '单声道', value: 1 },
  { label: '立体声', value: 2 },
]

const frameDurationOptions = [
  { label: '10ms', value: 10 },
  { label: '20ms (推荐)', value: 20 },
  { label: '40ms', value: 40 },
  { label: '60ms', value: 60 },
]

// 系统音量控制支持标志
const systemVolumeSupported = ref(false)

/**
 * 刷新音频设备列表
 */
async function refreshDevices(): Promise<void> {
  try {
    // 枚举设备
    const result = await enumerateDevices()

    // 如果当前没有选中设备，自动选择
    if (!selectedInputDevice.value) {
      autoSelectInputDevice(result.defaultInputName, result.currentInputDeviceId)
    }

    if (!selectedOutputDevice.value) {
      autoSelectOutputDevice(result.defaultOutputName)
    }
  }
  catch (error) {
    console.error('枚举音频设备失败:', error)
    message.error('枚举音频设备失败，请检查权限设置')
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

    // 加载高级音频参数
    inputSampleRate.value = config.inputSampleRate || 16000
    outputSampleRate.value = config.outputSampleRate || 24000
    channels.value = config.channels || 1
    frameDuration.value = config.frameDuration || 20

    // 从配置加载并匹配设备（使用当前组件的 composable 实例）
    const { inputDeviceId, outputDeviceId } = await loadDevicesFromConfig()

    // 更新选中的设备（loadDevicesFromConfig 已经设置了 selectedInputDevice/selectedOutputDevice）
    console.log('从配置加载的设备:', {
      input: inputDeviceId,
      output: outputDeviceId,
    })

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
    // 记录保存前的配置（用于判断是否需要重新初始化）
    const previousConfig = await window.api.audioGetConfig()

    const config: Partial<AudioConfig> = {
      enableNoiseReduction: enableNoiseReduction.value,
      enableEchoCancellation: enableEchoCancellation.value,
      conversationMode: enableRealtimeConversation.value ? 'realtime' : 'auto',
      inputSampleRate: inputSampleRate.value as AudioConfig['inputSampleRate'],
      outputSampleRate: outputSampleRate.value as AudioConfig['outputSampleRate'],
      channels: channels.value,
      frameDuration: frameDuration.value,
    }

    // 使用 composable 提供的方法获取设备名称
    if (selectedInputDevice.value && selectedInputDevice.value !== 'default') {
      const label = getDeviceLabelById(selectedInputDevice.value, 'input')
      if (label) {
        config.inputDeviceName = label
        console.log('保存麦克风设备名称:', label)
      }
    }

    if (selectedOutputDevice.value && selectedOutputDevice.value !== 'default') {
      const label = getDeviceLabelById(selectedOutputDevice.value, 'output')
      if (label) {
        config.outputDeviceName = label
        console.log('保存扬声器设备名称:', label)
      }
    }

    await window.api.audioUpdateConfig(config)

    console.log('音频配置已保存:', config)

    // 检查是否修改了采样率、声道数或帧长度（需要完整重建 AudioContext + 协议重连）
    const needsReinitialization
      = config.inputSampleRate !== previousConfig.inputSampleRate
        || config.outputSampleRate !== previousConfig.outputSampleRate
        || config.channels !== previousConfig.channels
        || config.frameDuration !== previousConfig.frameDuration

    if (needsReinitialization) {
      message.success('音频设置已保存，正在重新初始化音频和重连...', { duration: 3000 })
    }
    else {
      message.success('音频设置已保存')
    }
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
  await refreshDevices()
  message.success('设备列表已刷新')
}

// 音量设置防抖定时器
let volumeDebounceTimer: ReturnType<typeof setTimeout> | null = null

// 监听扬声器音量变化，实时设置系统音量（带防抖）
watch(speakerVolume, (newVolume) => {
  if (!systemVolumeSupported.value)
    return

  // 清除之前的定时器
  if (volumeDebounceTimer) {
    clearTimeout(volumeDebounceTimer)
  }

  // 300ms 防抖：只在用户停止拖动后才设置系统音量
  volumeDebounceTimer = setTimeout(async () => {
    try {
      await window.api.audioSystemSetVolume(newVolume)
      console.log(`系统音量已设置: ${newVolume}%`)
    }
    catch (error) {
      console.warn('设置系统音量失败:', error)
    }
  }, 300)
})

// 组件挂载时初始化
onMounted(async () => {
  await loadConfig()
})

// 导出方法供父组件调用
defineExpose({ handleSave, handleCustomButton })
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <!-- 麦克风设置 -->
    <NFormItem label="麦克风设备">
      <NSelect
        v-model:value="selectedInputDevice"
        :options="inputDevices"
        placeholder="请选择麦克风设备"
        :loading="isEnumerating"
        style="width: 300px"
      />
    </NFormItem>

    <!-- 扬声器设置 -->
    <NFormItem label="扬声器设备">
      <NSelect
        v-model:value="selectedOutputDevice"
        :options="outputDevices"
        placeholder="请选择扬声器设备"
        :loading="isEnumerating"
        style="width: 300px"
      />
    </NFormItem>
    <NFormItem label="扬声器音量">
      <div style="display: flex; flex-direction: column; gap: 4px; width: 300px">
        <NSlider
          v-model:value="speakerVolume"
          :min="0"
          :max="100"
          :step="1"
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
          {{ enableRealtimeConversation ? '实时对话模式（全双工）' : '自动对话模式（回合制）' }} 开启实时对话后会获取屏幕录制权限（默认开启）
        </span>
      </div>
    </NFormItem>

    <!-- 高级音频参数 -->
    <NFormItem label=" " :show-label="false">
      <div style="color: #666; font-size: 14px; font-weight: 500; margin-top: 16px">
        高级音频参数
      </div>
    </NFormItem>

    <NFormItem label="输入采样率">
      <NSelect
        v-model:value="inputSampleRate"
        :options="sampleRateOptions"
        style="width: 300px"
      />
    </NFormItem>

    <NFormItem label="输出采样率">
      <NSelect
        v-model:value="outputSampleRate"
        :options="sampleRateOptions"
        style="width: 300px"
      />
    </NFormItem>

    <NFormItem label="声道数">
      <NSelect
        v-model:value="channels"
        :options="channelOptions"
        style="width: 300px"
      />
    </NFormItem>

    <NFormItem label="帧长度">
      <NSelect
        v-model:value="frameDuration"
        :options="frameDurationOptions"
        style="width: 300px"
      />
    </NFormItem>

    <NFormItem label=" " :show-label="false">
      <div style="color: #f90; font-size: 12px">
        ⚠️ 注意：修改这些高级参数可能影响音频质量和性能，建议使用默认值
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
