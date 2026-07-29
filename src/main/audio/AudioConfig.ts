/**
 * @deprecated 使用 `AudioRuntime`（initializeAudioRuntime / getAudioRuntime）。
 * 本文件仅保留类型 re-export，避免旧路径 import 立即断裂。
 *
 * 长期契约：Settings（偏好）≠ Runtime（编解码/hello 参数）
 * 依赖方向：UI → Settings → Runtime → Protocol / Codec
 */

export type { AudioParams, AudioRuntimeParams, AudioUplinkParams } from './AudioRuntime'
export {
  AudioRuntime,
  getAudioRuntime,
  initializeAudioRuntime,
  resetAudioRuntime,
} from './AudioRuntime'
