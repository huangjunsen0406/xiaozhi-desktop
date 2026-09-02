import type {
  ActivationData,
  ActivationInitResult,
  ActivationResult,
  ActivationStatus,
  AddMessageParams,
  AecCaptureReport,
  AecStatus,
  AnalyticsStatus,
  AppStateSnapshot,
  AudioSettings,
  AudioUpdateSettingsResult,
  BackgroundAudioStateUpdate,
  BackgroundAudioStatus,
  BubbleLocalShowPayload,
  CameraConfig,
  CareReminderConfig,
  CareReminderDemoResult,
  ChatMessage,
  ChatMessageAddedEvent,
  ChatMessagesBatchAddedEvent,
  ChatSession,
  ChatSessionCreatedEvent,
  CreateSessionParams,
  DeviceInfo,
  FileDialogResult,
  HoverAnchor,
  ImageCapturedEvent,
  McpPluginImportResult,
  McpPluginsHostConfig,
  McpToolCatalogItem,
  McpToolsSaveResult,
  ModelInfo,
  MusicConfig,
  PcmAudioData,
  PetInfo,
  PetSpritesheetPayload,
  PetSurfaceContentSize,
  PetSurfaceId,
  ServerMessage,
  ShortcutConfig,
  SystemConfig,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdatePrefs,
  UpdateStatusSnapshot,
  WakeWordConfig,
} from '@shared/types'

/**
 * 激活设备信息
 */
export type ActivationDeviceInfo = DeviceInfo

// 导出共享类型供渲染进程使用
export type {
  ActivationData,
  ActivationInitResult,
  ActivationResult,
  ActivationStatus,
  AecCaptureReport,
  AecStatus,
  AppStateSnapshot,
  AudioSettings,
  AudioUpdateSettingsResult,
  BackgroundAudioStateUpdate,
  BackgroundAudioStatus,
  BubbleLocalShowPayload,
  CameraConfig,
  CareReminderConfig,
  CareReminderDemoResult,
  ChatMessage,
  ChatMessageAddedEvent,
  ChatMessagesBatchAddedEvent,
  ChatSession,
  ChatSessionCreatedEvent,
  CreateSessionParams,
  DeviceInfo,
  FileDialogResult,
  HoverAnchor,
  ImageCapturedEvent,
  McpPluginImportResult,
  McpPluginsHostConfig,
  McpToolCatalogItem,
  McpToolsSaveResult,
  ModelInfo,
  MusicConfig,
  PcmAudioData,
  PetInfo,
  PetSpritesheetPayload,
  PetSurfaceContentSize,
  PetSurfaceId,
  ServerMessage,
  ShortcutConfig,
  SystemConfig,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdatePrefs,
  UpdateStatusSnapshot,
  WakeWordConfig,
}

export interface RendererApi {
  togglePanel: () => void
  toggleToMini: () => void
  toggleToMain: () => void
  getDisplayMode: () => Promise<'main' | 'mini' | 'chat' | 'live2d' | 'pets'>
  switchDisplayMode: (mode: 'main' | 'mini' | 'chat' | 'live2d' | 'pets') => Promise<void>
  onDisplayModeChanged: (callback: (mode: 'main' | 'mini' | 'chat' | 'live2d' | 'pets') => void) => () => void
  showActivation: () => void
  toggleSettings: () => void
  /** 退出应用 */
  quitApp: () => void
  /** 桌宠窗点击穿透（live2d | pets） */
  setClickThrough: (target: 'live2d' | 'pets', ignore: boolean) => void
  dragStart: () => void
  dragMove: () => void
  dragEnd: () => void
  showHover: () => void
  hideHover: () => void
  /** 独立 Hover 菜单窗：按 mini/live2d/pets 锚点显示；xy 为屏幕坐标 */
  showHoverFor: (anchor: HoverAnchor, screenX?: number, screenY?: number) => void
  repositionHover: () => void
  hoverMiniEnter: () => void
  hoverMiniLeave: () => void
  hoverWindowEnter: () => void
  hoverWindowLeave: () => void
  minimize: () => void
  maximize: () => void
  unmaximize: () => void
  toggleMaximize: () => void
  close: () => void
  openExternal: (string: string) => void
  /** 重启整个应用（AEC system 等需启动参数的变更） */
  relaunchApp: () => Promise<void>
  /** 清除本地配置（userData：数据库 / 唤醒词等）并重启 */
  resetUserData: () => Promise<void>
  /** 打开 macOS 录屏与系统录音设置；非 mac 返回 opened:false */
  openScreenRecordingSettings: () => Promise<{ opened: boolean }>
  /** process.platform */
  getPlatform: () => NodeJS.Platform | string
  getProcessVersions: () => Partial<NodeJS.ProcessVersions> & Record<string, string | undefined>
  // Bubble / pet-shell APIs（独立气泡窗与内容级 bounds，禁止 renderer 裸打 channel）
  bubbleShow: () => void
  bubbleHide: () => void
  bubbleSetAnchorOffset: (offsetY: number) => void
  /**
   * 上报桌宠 surface 可见内容尺寸（CSS px），主进程 setBounds 紧包内容。
   * surface: pets | live2d | bubble
   */
  bubbleSetContentSize: (surface: PetSurfaceId, size: PetSurfaceContentSize) => void
  bubbleOnSetArrowX: (callback: (x: number) => void) => () => void
  /** 本地关怀提醒等非会话气泡 */
  bubbleOnShowLocal: (callback: (payload: BubbleLocalShowPayload) => void) => () => void
  bubbleOnHideLocal: (callback: () => void) => () => void
  // Care reminder APIs
  careReminderGetConfig: () => Promise<CareReminderConfig>
  careReminderUpdateConfig: (config: Partial<CareReminderConfig>) => Promise<CareReminderConfig>
  /** 演示一轮四类提醒（绕过正式间隔/静默/开关） */
  careReminderDemo: () => Promise<CareReminderDemoResult>
  // Activation APIs
  activationInitialize: () => Promise<ActivationInitResult>
  activationGetDeviceInfo: () => Promise<ActivationDeviceInfo>
  activationGetActivationData: () => Promise<ActivationData | null>
  activationStart: (data: ActivationData) => Promise<ActivationResult>
  activationCancel: () => Promise<ActivationResult>
  activationCheckStatus: () => Promise<ActivationStatus>
  // Audio APIs
  audioSendPCM: (pcm: Int16Array) => void
  audioOnOpusDecoded: (callback: (pcm: PcmAudioData) => void) => () => void
  // Audio Device APIs
  audioGetConfig: () => Promise<AudioSettings>
  audioUpdateConfig: (config: Partial<AudioSettings>) => Promise<AudioUpdateSettingsResult | void>
  audioGetAecStatus: () => Promise<AecStatus>
  audioReportAecCapture: (payload: AecCaptureReport) => Promise<AecStatus>
  audioGetDefaultDeviceId: (kind: 'input' | 'output') => Promise<string | null>
  // System Volume Control APIs
  audioSystemGetVolume: () => Promise<number>
  audioSystemSetVolume: (volume: number) => Promise<void>
  audioSystemVolumeSupported: () => Promise<boolean>
  // Application 控制 APIs
  appStartListeningManual: () => Promise<void>
  appStopListeningManual: () => Promise<void>
  appStartAutoConversation: () => Promise<void>
  appStopAutoConversation: () => Promise<void>
  appSendText: (text: string) => Promise<void>
  appGetState: () => Promise<AppStateSnapshot>
  appOnStateChanged: (callback: (state: AppStateSnapshot) => void) => () => void
  appOnServerMessage: (callback: (message: ServerMessage) => void) => () => void
  // System Config APIs
  systemGetConfig: () => Promise<SystemConfig>
  systemUpdateConfig: (config: SystemConfig) => Promise<void>
  // Wake Word APIs
  wakeWordGetConfig: () => Promise<WakeWordConfig>
  wakeWordUpdateConfig: (updates: Partial<WakeWordConfig>) => Promise<void>
  wakeWordTest: () => Promise<string | undefined>
  // Background Audio Window APIs
  onAudioCommand: (callback: (command: string, data?: Record<string, unknown>) => void) => () => void
  sendAudioState: (state: BackgroundAudioStateUpdate) => void
  backgroundAudioGetStatus: () => Promise<BackgroundAudioStatus>
  // Emotion APIs
  emotionSelectImage: () => Promise<FileDialogResult>
  emotionUploadCustom: (emotionType: string, sourcePath: string) => Promise<void>
  emotionGetMapping: () => Promise<Record<string, string>>
  emotionGetCustomPath: (emotionType: string) => Promise<string | null>
  emotionReset: (emotionType: string) => Promise<void>
  emotionOnChanged: (callback: (emotionType: string) => void) => () => void
  // Camera APIs
  cameraOnCaptureRequest: (callback: () => void) => () => void
  cameraSendCaptureResult: (success: boolean, data?: Uint8Array, message?: string) => void
  // Camera Config APIs
  cameraConfigGetConfig: () => Promise<CameraConfig>
  cameraConfigUpdateConfig: (config: Partial<CameraConfig>) => Promise<void>
  // Theme APIs
  themeOnChange: (callback: (theme: string) => void) => () => void
  themeGetCurrent: () => Promise<string>
  // Chat APIs
  chatGetSessions: (limit?: number, offset?: number) => Promise<ChatSession[]>
  chatGetSession: (sessionId: string) => Promise<ChatSession | null>
  chatCreateSession: (data: CreateSessionParams) => Promise<ChatSession>
  chatGetMessages: (sessionId: string, limit?: number, offset?: number) => Promise<ChatMessage[]>
  chatAddMessage: (data: AddMessageParams) => Promise<ChatMessage>
  chatUpdateSessionTitle: (sessionId: string, title: string) => Promise<void>
  chatDeleteSession: (sessionId: string) => Promise<void>
  chatClearMessages: (sessionId: string) => Promise<void>
  chatOnImageCaptured: (callback: (data: ImageCapturedEvent) => void) => () => void
  chatOnMessageAdded: (callback: (data: ChatMessageAddedEvent) => void) => () => void
  chatOnMessagesBatchAdded: (callback: (data: ChatMessagesBatchAddedEvent) => void) => () => void
  chatOnSessionCreated: (callback: (data: ChatSessionCreatedEvent) => void) => () => void
  // Shortcut APIs
  shortcutGetAll: () => Promise<ShortcutConfig[]>
  shortcutUpdate: (action: string, accelerator: string | null) => Promise<void>
  shortcutCheckConflict: (accelerator: string, excludeAction?: string) => Promise<{ conflict: boolean, name: string | null }>
  shortcutReset: () => Promise<void>
  // Music APIs
  musicOnCommand: (callback: (message: { command: string, args?: Record<string, unknown> }) => void) => () => void
  musicStatusUpdate: (status: Record<string, unknown>) => void
  musicGetConfig: () => Promise<MusicConfig>
  musicUpdateConfig: (config: Partial<MusicConfig>) => Promise<void>

  // Live2D APIs
  live2dOnAudioVolume: (callback: (volume: number) => void) => () => void

  // Model APIs
  modelGetList: () => Promise<ModelInfo[]>
  modelGetCurrent: () => Promise<string>
  modelSetCurrent: (modelId: string) => Promise<void>
  modelSelectFolder: () => Promise<FileDialogResult>
  modelImport: (sourcePath: string) => Promise<string | undefined>
  modelDelete: (modelId: string) => Promise<void>
  modelOpenFolder: () => Promise<void>
  modelGetFolderPath: () => Promise<string>
  modelOnChanged: (callback: (modelId: string) => void) => () => void

  // Pets APIs
  petsGetList: () => Promise<PetInfo[]>
  petsGetCurrent: () => Promise<string>
  petsSetCurrent: (petId: string) => Promise<void>
  petsSelectFolder: () => Promise<FileDialogResult>
  petsImport: (sourcePath: string) => Promise<string | undefined>
  petsDelete: (petId: string) => Promise<void>
  petsGetFolderPath: () => Promise<string>
  petsGetSpritesheet: (petId: string) => Promise<PetSpritesheetPayload | null>
  /** 全局桌宠显示宽度 CSS px（80–224，默认 112） */
  petsGetDisplayWidth: () => Promise<number>
  /** 设置全局显示宽度；返回夹取后的值 */
  petsSetDisplayWidth: (width: number) => Promise<number>
  petsOpenFolder: () => Promise<void>
  petsOnChanged: (callback: (petId: string) => void) => () => void
  /** 显示宽度变更广播（设置页 / pets / live2d 实时同步） */
  petsOnDisplayWidthChanged: (callback: (width: number) => void) => () => void

  // MCP 工具 APIs
  mcpToolsGetCatalog: () => Promise<McpToolCatalogItem[]>
  mcpToolsGetDisabled: () => Promise<string[]>
  mcpToolsSaveDisabled: (disabledNames: string[]) => Promise<McpToolsSaveResult>
  mcpToolsSelectFolder: () => Promise<FileDialogResult>
  mcpToolsImportPlugin: (sourcePath: string) => Promise<McpPluginImportResult>
  mcpToolsOpenFolder: () => Promise<void>
  mcpToolsGetFolderPath: () => Promise<string>
  mcpToolsRefresh: () => Promise<McpToolCatalogItem[]>
  /** 删除已导入外挂，返回最新 catalog */
  mcpToolsDeletePlugin: (pluginId: string) => Promise<McpToolCatalogItem[]>
  mcpToolsGetPluginsConfig: () => Promise<McpPluginsHostConfig>
  mcpToolsSetPluginsConfig: (
    partial: Partial<McpPluginsHostConfig>,
  ) => Promise<McpPluginsHostConfig>

  // 应用内更新
  updateGetStatus: () => Promise<UpdateStatusSnapshot>
  updateGetPrefs: () => Promise<UpdatePrefs>
  updateSetAutoCheck: (enabled: boolean) => Promise<UpdatePrefs>
  updateCheck: () => Promise<UpdateCheckResult>
  updateDownload: () => Promise<void>
  updateQuitAndInstall: () => Promise<void>
  updateCheckDownloadInstall: () => Promise<void>
  updateSkipVersion: (version: string) => Promise<UpdatePrefs>
  updateOpenReleases: () => Promise<void>
  updateOpenRepo: () => Promise<void>
  updateOnAvailable: (cb: (info: UpdateCheckResult) => void) => () => void
  updateOnNotAvailable: (cb: (info: UpdateCheckResult) => void) => () => void
  updateOnDownloadProgress: (cb: (p: UpdateDownloadProgress) => void) => () => void
  updateOnDownloaded: (cb: (info: { version: string, currentVersion: string }) => void) => () => void
  updateOnError: (cb: (payload: { message: string }) => void) => () => void

  // 产品分析
  analyticsGetStatus: () => Promise<AnalyticsStatus>
  analyticsSetEnabled: (enabled: boolean) => Promise<AnalyticsStatus>

  // 剪贴板 API
  clipboardWriteText: (text: string) => Promise<void>
  clipboardReadText: () => Promise<string | null>
}

// ShortcutConfig 从共享类型导入

declare global {
  interface Window {
    api: RendererApi
  }
}
