<script setup lang="ts">
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
    const config: any = {
      enableNoiseReduction: enableNoiseReduction.value,
      enableEchoCancellation: enableEchoCancellation.value,
      conversationMode: enableRealtimeConversation.value ? 'realtime' : 'auto',
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
  await refreshDevices()
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
          v-model:value="speakerVolume.data"
          :min="0"
          :max="100"
          :step="1"
        />
        <span style="color: #999; font-size: 12px">
          当前系统音量: {{ speakerVolume.data }}% (实时跟随系统)
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
