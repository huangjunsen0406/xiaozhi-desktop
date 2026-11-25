/**
 * 音频设备管理 Composable
 * 统一设备枚举、选择和配置逻辑
 */
import type { AudioSettings } from '@shared/types'
import { ref } from 'vue'

/**
 * 设备选项类型
 */
export interface DeviceOption {
  label: string
  value: string
}

/**
 * 设备枚举结果
 */
export interface EnumerateResult {
  inputs: DeviceOption[]
  outputs: DeviceOption[]
  defaultInputName: string | null
  defaultOutputName: string | null
  currentInputDeviceId?: string
}

/**
 * 解析 default 设备的真实名称
 * 格式: "Default - MacBook Air麦克风 (Built-in)" -> "MacBook Air麦克风 (Built-in)"
 */
function parseDefaultDeviceName(label: string | undefined): string | null {
  if (!label)
    return null
  const match = label.match(/^Default - (.+)$/)
  return match ? match[1] : null
}

/**
 * 音频设备管理 Hook
 */
export function useDevices() {
  // 设备列表
  const inputDevices = ref<DeviceOption[]>([])
  const outputDevices = ref<DeviceOption[]>([])

  // 当前选中的设备
  const selectedInputDevice = ref<string>('')
  const selectedOutputDevice = ref<string>('')

  // 加载状态
  const isEnumerating = ref(false)

  /**
   * 枚举音频设备
   */
  async function enumerateDevices(): Promise<EnumerateResult> {
    try {
      isEnumerating.value = true

      // 请求麦克风权限（必须先获取权限才能看到设备标签）
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // 获取系统当前使用的设备ID（从stream中获取）
      const audioTrack = stream.getAudioTracks()[0]
      const currentInputDeviceId = audioTrack?.getSettings().deviceId

      // 关闭流
      stream.getTracks().forEach(track => track.stop())

      // 枚举设备
      const devices = await navigator.mediaDevices.enumerateDevices()

      // 找到 default 设备对应的实际设备
      const defaultInputDevice = devices.find(d => d.kind === 'audioinput' && d.deviceId === 'default')
      const defaultOutputDevice = devices.find(d => d.kind === 'audiooutput' && d.deviceId === 'default')

      const defaultInputName = parseDefaultDeviceName(defaultInputDevice?.label)
      const defaultOutputName = parseDefaultDeviceName(defaultOutputDevice?.label)

      // 过滤输入设备（排除 default 设备）
      const inputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default')
      inputDevices.value = inputs.map(d => ({
        label: d.label || `麦克风 ${d.deviceId.substring(0, 8)}`,
        value: d.deviceId,
      }))

      // 过滤输出设备（排除 default 设备）
      const outputs = devices.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default')
      outputDevices.value = outputs.map(d => ({
        label: d.label || `扬声器 ${d.deviceId.substring(0, 8)}`,
        value: d.deviceId,
      }))

      console.log('音频设备枚举完成', {
        inputs: inputDevices.value.length,
        outputs: outputDevices.value.length,
        currentInputDeviceId,
        defaultInputName,
        defaultOutputName,
      })

      return {
        inputs: inputDevices.value,
        outputs: outputDevices.value,
        defaultInputName,
        defaultOutputName,
        currentInputDeviceId,
      }
    }
    catch (error) {
      console.error('枚举音频设备失败:', error)
      throw error
    }
    finally {
      isEnumerating.value = false
    }
  }

  /**
   * 自动选择输入设备
   * 优先级: defaultInputName > currentInputDeviceId > 第一个设备
   */
  function autoSelectInputDevice(
    defaultInputName: string | null,
    currentInputDeviceId?: string,
  ): string | null {
    if (inputDevices.value.length === 0) {
      return null
    }

    let selectedDevice: DeviceOption | undefined

    // 尝试通过 default 设备名称匹配
    if (defaultInputName) {
      selectedDevice = inputDevices.value.find(d => d.label === defaultInputName)
      if (selectedDevice) {
        console.log('✓ 通过 default 设备名称匹配到麦克风:', selectedDevice.label)
      }
    }

    // 尝试通过 getUserMedia 获取的设备ID匹配
    if (!selectedDevice && currentInputDeviceId) {
      selectedDevice = inputDevices.value.find(d => d.value === currentInputDeviceId)
      if (selectedDevice) {
        console.log('✓ 通过 getUserMedia 匹配到麦克风:', selectedDevice.label)
      }
    }

    // 默认选择第一个设备
    if (!selectedDevice) {
      selectedDevice = inputDevices.value[0]
      console.log('✓ 使用第一个麦克风设备:', selectedDevice.label)
    }

    selectedInputDevice.value = selectedDevice.value
    return selectedDevice.value
  }

  /**
   * 自动选择输出设备
   * 优先级: defaultOutputName > 第一个设备
   */
  function autoSelectOutputDevice(defaultOutputName: string | null): string | null {
    if (outputDevices.value.length === 0) {
      return null
    }

    let selectedDevice: DeviceOption | undefined

    // 尝试通过 default 设备名称匹配
    if (defaultOutputName) {
      selectedDevice = outputDevices.value.find(d => d.label === defaultOutputName)
      if (selectedDevice) {
        console.log('✓ 通过 default 设备名称匹配到扬声器:', selectedDevice.label)
      }
    }

    // 默认选择第一个设备
    if (!selectedDevice) {
      selectedDevice = outputDevices.value[0]
      console.log('✓ 使用第一个扬声器设备:', selectedDevice.label)
    }

    selectedOutputDevice.value = selectedDevice.value
    return selectedDevice.value
  }

  /**
   * 从配置加载设备并选择（直接复用本次枚举结果，避免重复 enumerateDevices / audioGetConfig）
   */
  async function loadDevicesFromConfig(existingConfig?: AudioSettings): Promise<{
    inputDeviceId?: string
    outputDeviceId?: string
  }> {
    try {
      const result = await enumerateDevices()
      const audioConfig = existingConfig ?? await window.api.audioGetConfig()

      let inputDeviceId = audioConfig.inputDeviceName
        ? result.inputs.find(d => d.label === audioConfig.inputDeviceName)?.value
        : undefined
      if (inputDeviceId) {
        selectedInputDevice.value = inputDeviceId
      }
      else {
        inputDeviceId = autoSelectInputDevice(result.defaultInputName, result.currentInputDeviceId) || undefined
      }

      let outputDeviceId = audioConfig.outputDeviceName
        ? result.outputs.find(d => d.label === audioConfig.outputDeviceName)?.value
        : undefined
      if (outputDeviceId) {
        selectedOutputDevice.value = outputDeviceId
      }
      else {
        outputDeviceId = autoSelectOutputDevice(result.defaultOutputName) || undefined
      }

      return { inputDeviceId, outputDeviceId }
    }
    catch (error) {
      console.error('从配置加载设备失败:', error)
      throw error
    }
  }

  /**
   * 获取设备名称（通过ID）
   */
  function getDeviceLabelById(deviceId: string, kind: 'input' | 'output'): string | undefined {
    const devices = kind === 'input' ? inputDevices.value : outputDevices.value
    const device = devices.find(d => d.value === deviceId)
    return device?.label
  }

  return {
    // 状态
    inputDevices,
    outputDevices,
    selectedInputDevice,
    selectedOutputDevice,
    isEnumerating,

    // 方法
    enumerateDevices,
    autoSelectInputDevice,
    autoSelectOutputDevice,
    loadDevicesFromConfig,
    getDeviceLabelById,
  }
}
