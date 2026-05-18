/**
 * 音频设备工具函数
 * 提供统一的设备匹配和选择逻辑
 */

export interface DeviceInfo {
  deviceId: string
  label: string
}

/**
 * 通过设备名称匹配设备ID
 * @param deviceName 设备名称
 * @param kind 设备类型: 'audioinput' | 'audiooutput'
 * @returns 设备ID,如果未找到返回 undefined
 */
export async function getDeviceIdByName(
  deviceName: string,
  kind: 'audioinput' | 'audiooutput',
): Promise<string | undefined> {
  try {
    // 枚举所有设备
    const devices = await navigator.mediaDevices.enumerateDevices()

    // 通过名称匹配设备
    const device = devices.find(
      d => d.kind === kind && d.label === deviceName,
    )

    if (device) {
      console.log(`[DeviceUtils] 匹配到${kind === 'audioinput' ? '输入' : '输出'}设备:`, deviceName, '→', device.deviceId)
      return device.deviceId
    }
    else {
      console.warn(`[DeviceUtils] 未找到匹配的${kind === 'audioinput' ? '输入' : '输出'}设备:`, deviceName)
      return undefined
    }
  }
  catch (error) {
    console.error('获取设备ID失败', error)
    return undefined
  }
}

let permissionGranted = false

/**
 * 从配置获取设备ID
 * 会自动匹配设备名称到设备ID
 */
export async function getDeviceIdsFromConfig(): Promise<{
  inputDeviceId?: string
  outputDeviceId?: string
}> {
  try {
    // 仅首次请求麦克风权限（避免干扰正在采集的流）
    if (!permissionGranted) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      permissionGranted = true
    }

    // 获取音频配置
    const audioConfig = await window.api.audioGetConfig()

    let inputDeviceId: string | undefined
    let outputDeviceId: string | undefined

    // 匹配输入设备
    if (audioConfig.inputDeviceName) {
      inputDeviceId = await getDeviceIdByName(audioConfig.inputDeviceName, 'audioinput')
    }

    // 匹配输出设备
    if (audioConfig.outputDeviceName) {
      outputDeviceId = await getDeviceIdByName(audioConfig.outputDeviceName, 'audiooutput')
    }

    return { inputDeviceId, outputDeviceId }
  }
  catch (error) {
    console.error('获取设备ID失败', error)
    return {}
  }
}
