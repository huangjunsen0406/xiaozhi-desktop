import type { AecMode, AudioSettings } from '@shared/types'

export function resolveAecMode(
  config: Pick<AudioSettings, 'aecMode' | 'enableEchoCancellation'>,
): AecMode {
  if (config.aecMode === 'off' || config.aecMode === 'app' || config.aecMode === 'system')
    return config.aecMode
  return config.enableEchoCancellation === false ? 'off' : 'app'
}

let permissionGranted = false

/**
 * 从配置匹配输入/输出设备 ID（单次枚举，避免重复 IPC 与 enumerateDevices）。
 */
export async function getDeviceIdsFromConfig(audioConfig?: AudioSettings): Promise<{
  inputDeviceId?: string
  outputDeviceId?: string
}> {
  try {
    if (!permissionGranted) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      permissionGranted = true
    }

    const config = audioConfig ?? await window.api.audioGetConfig()
    if (!config.inputDeviceName && !config.outputDeviceName)
      return {}

    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputDeviceId = config.inputDeviceName
      ? devices.find(d => d.kind === 'audioinput' && d.label === config.inputDeviceName)?.deviceId
      : undefined
    const outputDeviceId = config.outputDeviceName
      ? devices.find(d => d.kind === 'audiooutput' && d.label === config.outputDeviceName)?.deviceId
      : undefined

    return { inputDeviceId, outputDeviceId }
  }
  catch (error) {
    console.error('获取设备ID失败', error)
    return {}
  }
}
