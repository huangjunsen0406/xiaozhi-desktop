/**
 * 内置 MCP 工具中文标签与分组
 */

/** 工具全名 → 中文展示名（内置 + 已知示例） */
export const BUILTIN_TOOL_LABELS: Record<string, string> = {
  'self.audio_speaker.set_volume': '设置音量',
  'self.audio_speaker.get_volume': '获取音量',
  'self.application.launch': '启动应用',
  'self.application.list_running': '列出运行中应用',
  'self.application.kill': '结束应用',
  'self.application.scan_installed': '扫描已安装应用',
  'self.camera.take_photo': '拍照',
  'self.screenshot.take': '截图',
  'self.ui.set_theme': '设置主题',
  'self.ui.get_theme': '获取主题',
  'self.system.get_info': '系统信息',
  'self.timer.start_countdown': '开始倒计时',
  'self.timer.cancel_countdown': '取消倒计时',
  'self.timer.get_active_timers': '查看活动定时器',
  'self.music.search': '搜索音乐',
  'self.music.play': '播放',
  'self.music.pause': '暂停',
  'self.music.resume': '继续播放',
  'self.music.stop': '停止',
  'self.music.set_volume': '音乐音量',
  'self.music.seek': '跳转进度',
  'self.music.set_loop': '循环模式',
  'self.music.set_playback_rate': '播放倍速',
  'self.music.get_status': '播放状态',
  'self.music.get_lyrics': '获取歌词',
  // 示例外挂（仅 label；分组走 pluginId / manifest.name）
  'example.hello': '打招呼',
  'example.now': '当前时间',
  'example.add_days': '日期加减',
}

/**
 * 内置分组 key → 中文名
 * 注意：不要把 example.* 等外挂前缀写死在这里——多个插件可共用 tool_name_prefix
 */
export const TOOL_GROUP_LABELS: Record<string, string> = {
  audio_speaker: '音量',
  application: '应用',
  camera: '摄像头',
  screenshot: '截图',
  ui: '界面',
  system: '系统',
  timer: '定时器',
  music: '音乐',
  other: '其他',
}

/**
 * 从工具全名推导「内置」分组 key
 * self.music.pause → music
 */
export function deriveBuiltinToolGroup(toolName: string): string {
  const parts = toolName.split('.')
  if (parts[0] === 'self' && parts.length >= 2) {
    return parts[1]
  }
  return 'other'
}

/**
 * Catalog 分组 key
 * - 外挂：pluginId（manifest.id），保证一插件一组
 * - 内置：self 后第二段
 */
export function deriveCatalogGroupKey(toolName: string, pluginId?: string): string {
  if (pluginId) {
    return pluginId
  }
  return deriveBuiltinToolGroup(toolName)
}

/** @deprecated 使用 deriveBuiltinToolGroup / deriveCatalogGroupKey */
export function deriveToolGroup(toolName: string): string {
  return deriveBuiltinToolGroup(toolName)
}

/**
 * 获取工具中文标签
 */
export function getToolLabel(toolName: string, _fallbackPluginName?: string): string {
  if (BUILTIN_TOOL_LABELS[toolName]) {
    return BUILTIN_TOOL_LABELS[toolName]
  }
  const parts = toolName.split('.')
  const tail = parts[parts.length - 1] || toolName
  return tail.replace(/_/g, ' ')
}

/**
 * 获取分组展示名
 * - 外挂：优先 manifest.name（pluginName）
 * - 内置：TOOL_GROUP_LABELS
 */
export function getGroupLabel(groupKey: string, pluginName?: string): string {
  // 外挂：catalog 传入的 groupKey 已是 pluginId，展示用 name
  if (pluginName) {
    return pluginName
  }
  if (TOOL_GROUP_LABELS[groupKey]) {
    return TOOL_GROUP_LABELS[groupKey]
  }
  return groupKey
}
