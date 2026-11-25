import type {
  AecCaptureReport,
  AecStatus,
  AudioSettings,
  AudioUpdateSettingsResult,
  PcmAudioData,
} from '@shared/types'
import { ipcRenderer } from 'electron'
import { invokeData, invokeVoid, subscribeChannel } from '../utils/ipc'

export const audioApi = {
  sendPCM: (pcm: Int16Array): void => ipcRenderer.send('audio:pcm', pcm),

  onOpusDecoded: (callback: (pcm: PcmAudioData) => void): () => void =>
    subscribeChannel('audio:opus-decoded', callback),

  getConfig: (): Promise<AudioSettings> =>
    invokeData('audio:get-config', '获取音频设置失败'),

  updateConfig: (config: Partial<AudioSettings>): Promise<AudioUpdateSettingsResult | void> =>
    invokeData('audio:update-config', '更新音频设置失败', config),

  getAecStatus: (): Promise<AecStatus> =>
    invokeData('audio:get-aec-status', '获取 AEC 状态失败'),

  reportAecCapture: (payload: AecCaptureReport): Promise<AecStatus> =>
    invokeData('audio:report-aec-capture', '上报 AEC 采集状态失败', payload),

  getPreferredDeviceName: (kind: 'input' | 'output'): Promise<string | null> =>
    invokeData('audio:get-preferred-device-name', '获取首选设备名称失败', kind),

  systemGetVolume: (): Promise<number> =>
    invokeData('audio:system-get-volume', '获取系统音量失败'),

  systemSetVolume: (volume: number): Promise<void> =>
    invokeVoid('audio:system-set-volume', '设置系统音量失败', volume),

  systemVolumeSupported: (): Promise<boolean> =>
    invokeData('audio:system-volume-supported', '获取系统音量支持状态失败'),
}
