/**
 * Preload 脚本入口
 * 使用模块化 API 结构
 */
import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge } from 'electron'
import { activationApi, appApi, audioApi, backgroundAudioApi, hoverApi, systemApi, wakeWordApi, windowApi } from './modules'

/**
 * 暴露给渲染进程的 API
 */
const api = {
  // 窗口控制 API
  togglePanel: windowApi.togglePanel,
  toggleToMini: windowApi.toggleToMini,
  toggleToMain: windowApi.toggleToMain,
  switchDisplayMode: windowApi.switchDisplayMode,
  showActivation: windowApi.showActivation,
  toggleSettings: windowApi.toggleSettings,
  dragStart: windowApi.dragStart,
  dragMove: windowApi.dragMove,
  dragEnd: windowApi.dragEnd,
  minimize: windowApi.minimize,
  maximize: windowApi.maximize,
  unmaximize: windowApi.unmaximize,
  toggleMaximize: windowApi.toggleMaximize,
  close: windowApi.close,
  openExternal: windowApi.openExternal,

  // Hover 控制 API
  showHover: hoverApi.showHover,
  hideHover: hoverApi.hideHover,
  repositionHover: hoverApi.repositionHover,
  hoverMiniEnter: hoverApi.hoverMiniEnter,
  hoverMiniLeave: hoverApi.hoverMiniLeave,
  hoverWindowEnter: hoverApi.hoverWindowEnter,
  hoverWindowLeave: hoverApi.hoverWindowLeave,

  // 激活 API
  activationInitialize: activationApi.initialize,
  activationGetDeviceInfo: activationApi.getDeviceInfo,
  activationGetActivationData: activationApi.getActivationData,
  activationStart: activationApi.start,
  activationCancel: activationApi.cancel,
  activationCheckStatus: activationApi.checkStatus,

  // 音频 API
  audioSendPCM: audioApi.sendPCM,
  audioOnOpusDecoded: audioApi.onOpusDecoded,
  audioRemoveOpusDecodedListener: audioApi.removeOpusDecodedListener,
  audioGetConfig: audioApi.getConfig,
  audioUpdateConfig: audioApi.updateConfig,
  audioGetDefaultDeviceId: audioApi.getDefaultDeviceId,
  audioSystemGetVolume: audioApi.systemGetVolume,
  audioSystemSetVolume: audioApi.systemSetVolume,
  audioSystemVolumeSupported: audioApi.systemVolumeSupported,

  // Application 控制 API
  appStartListeningManual: appApi.startListeningManual,
  appStopListeningManual: appApi.stopListeningManual,
  appStartAutoConversation: appApi.startAutoConversation,
  appStopAutoConversation: appApi.stopAutoConversation,
  appSendText: appApi.sendText,
  appGetState: appApi.getState,
  appOnStateChanged: appApi.onStateChanged,
  appRemoveStateChangedListener: appApi.removeStateChangedListener,
  appOnServerMessage: appApi.onServerMessage,
  appRemoveServerMessageListener: appApi.removeServerMessageListener,

  // 系统配置 API
  systemGetConfig: systemApi.getConfig,
  systemUpdateConfig: systemApi.updateConfig,

  // 唤醒词 API
  wakeWordGetConfig: wakeWordApi.getConfig,
  wakeWordUpdateConfig: wakeWordApi.updateConfig,
  wakeWordTest: wakeWordApi.test,

  // 后台音频窗口 API
  onAudioCommand: backgroundAudioApi.onAudioCommand,
  sendAudioState: backgroundAudioApi.sendAudioState,
  backgroundAudioGetStatus: backgroundAudioApi.getStatus,
}

// 使用 contextBridge 暴露 API
// eslint-disable-next-line node/prefer-global/process
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  }
  catch (error) {
    console.error(error)
  }
}
else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
}
