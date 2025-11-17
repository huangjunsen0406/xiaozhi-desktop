<script setup lang="ts">
import { NForm, NFormItem, NSelect, NSlider, NSwitch, useMessage } from 'naive-ui'
import { onMounted, ref, watch } from 'vue'
import { getDeviceIdByName } from '../../utils/audio/deviceUtils'

// 获取 message 实例
const message = useMessage()

// 表单数据
const microphoneDevice = ref<string>('')
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

    // 获取系统当前使用的设备ID（从stream中获取）
    const audioTrack = stream.getAudioTracks()[0]
    const currentInputDeviceId = audioTrack?.getSettings().deviceId

    stream.getTracks().forEach(track => track.stop())

    // 枚举设备
    const devices = await navigator.mediaDevices.enumerateDevices()

    // 找到 default 设备对应的实际设备
    const defaultInputDevice = devices.find(d => d.kind === 'audioinput' && d.deviceId === 'default')
    const defaultOutputDevice = devices.find(d => d.kind === 'audiooutput' && d.deviceId === 'default')

    // 解析 default 设备的真实名称
    // 格式: "Default - MacBook Air麦克风 (Built-in)" -> "MacBook Air麦克风 (Built-in)"
    const parseDefaultDeviceName = (label: string | undefined): string | null => {
      if (!label)
        return null
      const match = label.match(/^Default - (.+)$/)
      return match ? match[1] : null
    }

    const defaultInputName = parseDefaultDeviceName(defaultInputDevice?.label)
    const defaultOutputName = parseDefaultDeviceName(defaultOutputDevice?.label)

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
      currentInputDeviceId,
      defaultInputName,
      defaultOutputName,
    })

    if (!microphoneDevice.value && microphoneDevices.value.length > 0) {
      let selectedDevice = null

      if (defaultInputName) {
        selectedDevice = microphoneDevices.value.find(d => d.label === defaultInputName)
        if (selectedDevice) {
          console.log('✓ 通过 default 设备名称匹配到麦克风:', selectedDevice.label)
        }
      }

      if (!selectedDevice && currentInputDeviceId) {
        selectedDevice = microphoneDevices.value.find(d => d.value === currentInputDeviceId)
        if (selectedDevice) {
          console.log('✓ 通过 getUserMedia 匹配到麦克风:', selectedDevice.label)
        }
      }

      if (!selectedDevice) {
        selectedDevice = microphoneDevices.value[0]
        console.log('✓ 选中第一个麦克风设备:', selectedDevice.label)
      }

      microphoneDevice.value = selectedDevice.value
    }

    if (!speakerDevice.value && speakerDevices.value.length > 0) {
      let selectedDevice = null

      if (defaultOutputName) {
        selectedDevice = speakerDevices.value.find(d => d.label === defaultOutputName)
        if (selectedDevice) {
          console.log('✓ 通过 default 设备名称匹配到扬声器:', selectedDevice.label)
        }
      }

      // 降级选择第一个设备
      if (!selectedDevice) {
        selectedDevice = speakerDevices.value[0]
        console.log('✓ 选中第一个扬声器设备:', selectedDevice.label)
      }

      speakerDevice.value = selectedDevice.value
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

    if (config.inputDeviceName) {
      const deviceId = await getDeviceIdByName(config.inputDeviceName, 'audioinput')
      if (deviceId) {
        microphoneDevice.value = deviceId
      }
      else {
        console.warn('[AudioSettings] 未找到匹配的麦克风设备:', config.inputDeviceName)
      }
    }

    if (config.outputDeviceName) {
      const deviceId = await getDeviceIdByName(config.outputDeviceName, 'audiooutput')
      if (deviceId) {
        speakerDevice.value = deviceId
      }
      else {
        console.warn('[AudioSettings] 未找到匹配的扬声器设备:', config.outputDeviceName)
      }
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
      const selectedInput = microphoneDevices.value.find(d => d.value === microphoneDevice.value)
      if (selectedInput) {
        config.inputDeviceName = selectedInput.label
        console.log('保存麦克风设备名称:', selectedInput.label)
      }
    }

    if (speakerDevice.value && speakerDevice.value !== 'default') {
      const selectedOutput = speakerDevices.value.find(d => d.value === speakerDevice.value)
      if (selectedOutput) {
        config.outputDeviceName = selectedOutput.label
        console.log('保存扬声器设备名称:', selectedOutput.label)
      }
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
    <NFormItem label="麦克风设备">
      <NSelect
        v-model:value="microphoneDevice"
        :options="microphoneDevices"
        placeholder="请选择麦克风设备"
        style="width: 300px"
      />
    </NFormItem>

    <!-- 扬声器设置 -->
    <NFormItem label="扬声器设备">
      <NSelect
        v-model:value="speakerDevice"
        :options="speakerDevices"
        placeholder="请选择扬声器设备"
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
