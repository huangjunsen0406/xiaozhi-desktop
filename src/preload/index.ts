/**
 * Preload 脚本入口
 * 使用模块化 API 结构
 */
import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge } from 'electron'
import { activationApi, appApi, appEnvApi, audioApi, backgroundAudioApi, bubbleApi, cameraApi, cameraConfigApi, chatApi, clipboardApi, emotionApi, hoverApi, live2dApi, mcpToolsApi, modelApi, musicApi, musicConfigApi, petsApi, shortcutApi, systemApi, themeApi, wakeWordApi, windowApi } from './modules'

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
  setPetsIgnoreMouseEvents: windowApi.setPetsIgnoreMouseEvents,
  dragStart: windowApi.dragStart,
  dragMove: windowApi.dragMove,
  dragEnd: windowApi.dragEnd,
  minimize: windowApi.minimize,
  maximize: windowApi.maximize,
  unmaximize: windowApi.unmaximize,
  toggleMaximize: windowApi.toggleMaximize,
  close: windowApi.close,
  openExternal: windowApi.openExternal,

  // 环境信息（替代 window.electron.process）
  getPlatform: appEnvApi.getPlatform,
  getProcessVersions: appEnvApi.getProcessVersions,

  // 气泡窗
  bubbleShow: bubbleApi.show,
  bubbleHide: bubbleApi.hide,
  bubbleSetAnchorOffset: bubbleApi.setAnchorOffset,
  bubbleOnSetArrowX: bubbleApi.onSetArrowX,

  // Hover 控制 API
  showHover: hoverApi.showHover,
  hideHover: hoverApi.hideHover,
  showHoverFor: hoverApi.showHoverFor,
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
  audioGetConfig: audioApi.getConfig,
  audioUpdateConfig: audioApi.updateConfig,
  audioGetAecStatus: audioApi.getAecStatus,
  audioReportAecCapture: audioApi.reportAecCapture,
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
  appOnServerMessage: appApi.onServerMessage,

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

  // 表情 API
  emotionSelectImage: emotionApi.selectImage,
  emotionUploadCustom: emotionApi.uploadCustom,
  emotionGetMapping: emotionApi.getMapping,
  emotionGetCustomPath: emotionApi.getCustomPath,
  emotionReset: emotionApi.reset,
  emotionOnChanged: emotionApi.onEmotionChanged,

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
  chatOnMessageAdded: chatApi.onMessageAdded,
  chatOnMessagesBatchAdded: chatApi.onMessagesBatchAdded,
  chatOnSessionCreated: chatApi.onSessionCreated,

  // 快捷键 API
  shortcutGetAll: shortcutApi.getAll,
  shortcutUpdate: shortcutApi.update,
  shortcutCheckConflict: shortcutApi.checkConflict,
  shortcutReset: shortcutApi.reset,

  // 音乐 API
  musicOnCommand: musicApi.onCommand,
  musicStatusUpdate: musicApi.statusUpdate,
  musicGetConfig: musicConfigApi.getConfig,
  musicUpdateConfig: musicConfigApi.updateConfig,

  // Live2D API
  live2dOnAudioVolume: live2dApi.onAudioVolume,

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

  // 精灵宠物管理 API
  petsGetList: petsApi.getList,
  petsGetCurrent: petsApi.getCurrent,
  petsSetCurrent: petsApi.setCurrent,
  petsSelectFolder: petsApi.selectFolder,
  petsImport: petsApi.import,
  petsDelete: petsApi.delete,
  petsOpenFolder: petsApi.openFolder,
  petsGetFolderPath: petsApi.getFolderPath,
  petsGetSpritesheet: petsApi.getSpritesheet,
  petsOnChanged: petsApi.onChanged,

  // MCP 工具 API
  mcpToolsGetCatalog: mcpToolsApi.getCatalog,
  mcpToolsGetDisabled: mcpToolsApi.getDisabled,
  mcpToolsSaveDisabled: mcpToolsApi.saveDisabled,
  mcpToolsSelectFolder: mcpToolsApi.selectFolder,
  mcpToolsImportPlugin: mcpToolsApi.importPlugin,
  mcpToolsOpenFolder: mcpToolsApi.openFolder,
  mcpToolsGetFolderPath: mcpToolsApi.getFolderPath,
  mcpToolsRefresh: mcpToolsApi.refresh,
  mcpToolsDeletePlugin: mcpToolsApi.deletePlugin,

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
