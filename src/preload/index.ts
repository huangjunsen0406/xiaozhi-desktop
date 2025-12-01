/**
 * Preload 脚本入口
 * 使用模块化 API 结构
 */
import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge } from 'electron'
import { activationApi, analyticsApi, appApi, audioApi, backgroundAudioApi, cameraApi, cameraConfigApi, chatApi, clipboardApi, emotionApi, hoverApi, live2dApi, modelApi, musicApi, shortcutApi, systemApi, themeApi, wakeWordApi, windowApi } from './modules'

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
  setIgnoreMouseEvents: windowApi.setIgnoreMouseEvents,
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

  // 埋点 API
  analyticsTrack: analyticsApi.track,
  analyticsGetConfig: analyticsApi.getConfig,
  analyticsUpdateConfig: analyticsApi.updateConfig,
  analyticsFlush: analyticsApi.flush,

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
  audioUpdateState: backgroundAudioApi.audioUpdateState,
  backgroundAudioGetStatus: backgroundAudioApi.getStatus,

  // 表情 API
  emotionSelectImage: emotionApi.selectImage,
  emotionUploadCustom: emotionApi.uploadCustom,
  emotionGetMapping: emotionApi.getMapping,
  emotionGetCustomPath: emotionApi.getCustomPath,
  emotionReset: emotionApi.reset,
  emotionOnChanged: emotionApi.onEmotionChanged,
  emotionRemoveChangedListener: emotionApi.removeEmotionChangedListener,

  // 摄像头 API
  cameraOnCaptureRequest: cameraApi.onCaptureRequest,
  cameraSendCaptureResult: cameraApi.sendCaptureResult,

  // 摄像头配置 API
  cameraConfigGetConfig: cameraConfigApi.getConfig,
  cameraConfigUpdateConfig: cameraConfigApi.updateConfig,

  // 主题 API
  themeOnChange: themeApi.onThemeChange,
  themeGetCurrent: themeApi.getCurrentTheme,

  // 聊天 API
  chatGetSessions: chatApi.getSessions,
  chatGetSession: chatApi.getSession,
  chatCreateSession: chatApi.createSession,
  chatGetMessages: chatApi.getMessages,
  chatAddMessage: chatApi.addMessage,
  chatUpdateSessionTitle: chatApi.updateSessionTitle,
  chatDeleteSession: chatApi.deleteSession,
  chatClearMessages: chatApi.clearMessages,
  chatOnImageCaptured: chatApi.onImageCaptured,
  chatRemoveImageCapturedListener: chatApi.removeImageCapturedListener,
  chatOnMessageAdded: chatApi.onMessageAdded,
  chatRemoveMessageAddedListener: chatApi.removeMessageAddedListener,
  chatOnMessagesBatchAdded: chatApi.onMessagesBatchAdded,
  chatRemoveMessagesBatchAddedListener: chatApi.removeMessagesBatchAddedListener,
  chatOnSessionCreated: chatApi.onSessionCreated,
  chatRemoveSessionCreatedListener: chatApi.removeSessionCreatedListener,

  // 快捷键 API
  shortcutGetAll: shortcutApi.getAll,
  shortcutUpdate: shortcutApi.update,
  shortcutCheckConflict: shortcutApi.checkConflict,
  shortcutReset: shortcutApi.reset,

  // 音乐 API
  musicOnCommand: musicApi.onCommand,
  musicStatusUpdate: musicApi.statusUpdate,

  // Live2D API
  live2dOnAudioVolume: live2dApi.onAudioVolume,
  live2dRemoveAudioVolumeListener: live2dApi.removeAudioVolumeListener,

  // 模型管理 API
  modelGetList: modelApi.getList,
  modelGetCurrent: modelApi.getCurrent,
  modelSetCurrent: modelApi.setCurrent,
  modelSelectFolder: modelApi.selectFolder,
  modelImport: modelApi.import,
  modelDelete: modelApi.delete,
  modelOpenFolder: modelApi.openFolder,
  modelGetFolderPath: modelApi.getFolderPath,
  modelOnChanged: modelApi.onChanged,
  modelRemoveChangedListener: modelApi.removeChangedListener,

  // 剪贴板 API
  clipboardWriteText: clipboardApi.writeText,
  clipboardReadText: clipboardApi.readText,
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
  // @ts-expect-error (type mismatch in activation/app modules)
  window.electron = electronAPI
  // @ts-expect-error (type mismatch in activation/app modules)
  window.api = api
}
