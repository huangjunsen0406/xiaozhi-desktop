<script setup lang="ts">
import type { AecMode, AecStatus, AudioConfig } from '@shared/types'
import { NForm, NFormItem, NSelect, NSlider, NSwitch, useMessage } from 'naive-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useDevices } from '../../composables/useDevices'

const message = useMessage()

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

const speakerVolume = ref(70)
const enableNoiseReduction = ref(true)
const aecMode = ref<AecMode>('app')
const aecStatus = ref<AecStatus | null>(null)
const enableRealtimeConversation = ref(false)

const inputSampleRate = ref(16000)
const outputSampleRate = ref(24000)
const channels = ref(1)
const frameDuration = ref(20)

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

const aecModeOptions = [
  {
    label: '关闭',
    value: 'off' as const,
  },
  {
    label: '应用内（推荐）',
    value: 'app' as const,
  },
  {
    label: '系统级（需授权）',
    value: 'system' as const,
  },
]

const aecModeHint = computed(() => {
  switch (aecMode.value) {
    case 'off':
      return '不启用浏览器回声消除，扬声器声音更容易被麦克风拾取。'
    case 'system':
      return '尝试消除本应用与其它应用外放造成的回声。完整生效可能需要重启应用，并授予系统音频相关权限（macOS 14.2+ 更完整）。'
    default:
      return '使用 Chromium 应用级回声消除，主要抑制本应用播放（如语音播报）造成的回声。'
  }
})

const aecEffectiveText = computed(() => {
  const s = aecStatus.value
  if (!s)
    return ''
  const map: Record<string, string> = {
    off: '当前：已关闭',
    app: '当前：应用内',
    system: '当前：系统级',
    app_fallback: '当前：已回退为应用内',
    unavailable: '当前：回声消除不可用',
  }
  let text = map[s.effective] || `当前：${s.effective}`
  if (s.reason === 'system_features_need_relaunch')
    text += '（需重启应用以启用系统级参考）'
  else if (s.reason === 'track_echo_cancellation_false')
    text += '（采集轨道未启用 EC）'
  return text
})

const systemVolumeSupported = ref(false)

async function refreshDevices(): Promise<void> {
  try {
    const result = await enumerateDevices()

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

async function refreshAecStatus(): Promise<void> {
  try {
    aecStatus.value = await window.api.audioGetAecStatus()
  }
  catch (error) {
    console.warn('获取 AEC 状态失败', error)
  }
}

async function loadConfig(): Promise<void> {
  try {
    systemVolumeSupported.value = await window.api.audioSystemVolumeSupported()

    const config = await window.api.audioGetConfig()

    enableNoiseReduction.value = config.enableNoiseReduction !== false
    if (config.aecMode === 'off' || config.aecMode === 'app' || config.aecMode === 'system') {
      aecMode.value = config.aecMode
    }
    else {
      aecMode.value = config.enableEchoCancellation === false ? 'off' : 'app'
    }
    enableRealtimeConversation.value = config.conversationMode === 'realtime'

    inputSampleRate.value = config.inputSampleRate || 16000
    outputSampleRate.value = config.outputSampleRate || 24000
    channels.value = config.channels || 1
    frameDuration.value = config.frameDuration || 20

    await loadDevicesFromConfig()

    if (systemVolumeSupported.value) {
      try {
        speakerVolume.value = await window.api.audioSystemGetVolume()
      }
      catch (error) {
        console.warn('读取系统音量失败:', error)
        speakerVolume.value = 70
      }
    }

    await refreshAecStatus()
  }
  catch (error) {
    console.error('加载音频配置失败:', error)
  }
}

async function handleSave(): Promise<void> {
  try {
    const previousConfig = await window.api.audioGetConfig()
    const previousMode = previousConfig.aecMode
      ?? (previousConfig.enableEchoCancellation === false ? 'off' : 'app')

    const config: Partial<AudioConfig> = {
      enableNoiseReduction: enableNoiseReduction.value,
      aecMode: aecMode.value,
      enableEchoCancellation: aecMode.value !== 'off',
      conversationMode: enableRealtimeConversation.value ? 'realtime' : 'auto',
      inputSampleRate: inputSampleRate.value as AudioConfig['inputSampleRate'],
      outputSampleRate: outputSampleRate.value as AudioConfig['outputSampleRate'],
      channels: channels.value,
      frameDuration: frameDuration.value,
    }

    if (selectedInputDevice.value && selectedInputDevice.value !== 'default') {
      const label = getDeviceLabelById(selectedInputDevice.value, 'input')
      if (label)
        config.inputDeviceName = label
    }

    if (selectedOutputDevice.value && selectedOutputDevice.value !== 'default') {
      const label = getDeviceLabelById(selectedOutputDevice.value, 'output')
      if (label)
        config.outputDeviceName = label
    }

    const result = await window.api.audioUpdateConfig(config)

    const needsRelaunch = result?.requiresRelaunch
      ?? ((previousMode === 'system') !== (aecMode.value === 'system'))

    if (result?.aecStatus)
      aecStatus.value = result.aecStatus
    else
      await refreshAecStatus()

    // 文案跟主进程 apply 结果，避免 UI 自猜误报「正在重连」
    if (needsRelaunch) {
      message.warning('回声消除模式已保存。系统级完整生效需要重启应用。', { duration: 5000 })
    }
    else if (result?.protocolReconnected || result?.codecRebuilt) {
      message.success('音频设置已保存，正在重新初始化音频和重连...', { duration: 3000 })
    }
    else if (result?.deviceSwitched) {
      message.success('音频设置已保存，正在切换设备...', { duration: 2500 })
    }
    else if (result?.captureReinitialized) {
      message.success('音频设置已保存，正在重建采集...', { duration: 2500 })
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

async function handleCustomButton(): Promise<void> {
  await refreshDevices()
  message.success('设备列表已刷新')
}

let volumeDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(speakerVolume, (newVolume) => {
  if (!systemVolumeSupported.value)
    return

  if (volumeDebounceTimer)
    clearTimeout(volumeDebounceTimer)

  volumeDebounceTimer = setTimeout(async () => {
    try {
      await window.api.audioSystemSetVolume(newVolume)
    }
    catch (error) {
      console.warn('设置系统音量失败:', error)
    }
  }, 300)
})

onMounted(async () => {
  await loadConfig()
})

defineExpose({ handleSave, handleCustomButton })
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <NFormItem label="麦克风设备">
      <NSelect
        v-model:value="selectedInputDevice"
        :options="inputDevices"
        placeholder="请选择麦克风设备"
        :loading="isEnumerating"
        style="width: 300px"
      />
    </NFormItem>

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

    <NFormItem label="噪音抑制">
      <NSwitch v-model:value="enableNoiseReduction" />
    </NFormItem>

    <NFormItem label="回声消除">
      <div style="display: flex; flex-direction: column; gap: 6px; width: 360px">
        <NSelect
          v-model:value="aecMode"
          :options="aecModeOptions"
          style="width: 300px"
        />
        <span style="color: #999; font-size: 12px; line-height: 1.4">
          {{ aecModeHint }}
        </span>
        <span v-if="aecEffectiveText" style="color: #666; font-size: 12px">
          {{ aecEffectiveText }}
        </span>
      </div>
    </NFormItem>

    <NFormItem label="开启实时对话">
      <div style="display: flex; align-items: center; gap: 8px">
        <NSwitch v-model:value="enableRealtimeConversation" />
        <span style="color: #999; font-size: 12px">
          {{ enableRealtimeConversation ? '实时对话模式（全双工，可随时打断）' : '自动对话模式（回合制）' }}
        </span>
      </div>
    </NFormItem>

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

    <NFormItem label=" " :show-label="false">
      <div style="color: #666; font-size: 12px">
        提示：如果设备未显示或更换了设备，请点击右下角"刷新设备"按钮
      </div>
    </NFormItem>
  </NForm>
</template>
