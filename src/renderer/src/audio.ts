/**
 * 后台音频窗口入口
 * 负责音频采集和播放,保持系统AEC永久活跃
 */
import { AudioCapture } from './utils/audio/AudioCapture'
import { AudioPlayback } from './utils/audio/AudioPlayback'
import { getDeviceIdsFromConfig } from './utils/audio/deviceUtils'

console.log('[BackgroundAudio] 初始化后台音频系统...')

// 音频系统实例
const capture = new AudioCapture()
const playback = new AudioPlayback()

let isInitialized = false
let isCapturing = false

// 当前使用的设备ID (用于检测设备变化)
let currentInputDeviceId: string | undefined
let currentOutputDeviceId: string | undefined

/**
 * 初始化音频系统
 */
async function initialize(): Promise<void> {
  if (isInitialized) {
    console.log('[BackgroundAudio] 音频系统已初始化,跳过')
    return
  }

  try {
    console.log('[BackgroundAudio] 初始化音频系统...')

    // 获取配置的设备ID
    const { inputDeviceId, outputDeviceId } = await getDeviceIdsFromConfig()

    // 初始化采集器
    await capture.initialize(inputDeviceId)
    currentInputDeviceId = inputDeviceId
    console.log('[BackgroundAudio] ✓ 采集器初始化成功')

    // 初始化播放器
    await playback.initialize(outputDeviceId)
    currentOutputDeviceId = outputDeviceId
    console.log('[BackgroundAudio] ✓ 播放器初始化成功')

    isInitialized = true
    console.log('[BackgroundAudio] ✓ 音频系统初始化完成')
  }
  catch (error) {
    console.error('[BackgroundAudio] 初始化失败:', error)
    throw error
  }
}

/**
 * 开始音频采集
 */
async function startCapture(): Promise<void> {
  if (!isInitialized) {
    await initialize()
  }

  if (isCapturing) {
    console.log('[BackgroundAudio] 已在采集中,跳过')
    return
  }

  try {
    console.log('[BackgroundAudio] 开始音频采集...')
    await capture.start()
    isCapturing = true
    console.log('[BackgroundAudio] ✓ 音频采集已开始')
  }
  catch (error) {
    console.error('[BackgroundAudio] 开始采集失败:', error)
    throw error
  }
}

/**
 * 停止音频采集
 */
function stopCapture(): void {
  if (!isCapturing) {
    console.log('[BackgroundAudio] 未在采集中,跳过')
    return
  }

  try {
    console.log('[BackgroundAudio] 停止音频采集...')
    capture.stop()
    isCapturing = false
    console.log('[BackgroundAudio] ✓ 音频采集已停止')
  }
  catch (error) {
    console.error('[BackgroundAudio] 停止采集失败:', error)
  }
}

/**
 * 切换音频设备
 */
async function switchDevices(): Promise<void> {
  try {
    console.log('[BackgroundAudio] 检查设备配置...')

    // 获取最新的设备配置
    const { inputDeviceId, outputDeviceId } = await getDeviceIdsFromConfig()

    let changed = false

    // 切换输入设备
    if (inputDeviceId !== currentInputDeviceId && inputDeviceId) {
      console.log('[BackgroundAudio] 切换输入设备:', currentInputDeviceId, '→', inputDeviceId)
      await capture.switchDevice(inputDeviceId)
      currentInputDeviceId = inputDeviceId
      changed = true
    }

    // 切换输出设备
    if (outputDeviceId !== currentOutputDeviceId && outputDeviceId) {
      console.log('[BackgroundAudio] 切换输出设备:', currentOutputDeviceId, '→', outputDeviceId)
      await playback.switchDevice(outputDeviceId)
      currentOutputDeviceId = outputDeviceId
      changed = true
    }

    if (changed) {
      console.log('[BackgroundAudio] ✓ 设备切换完成')
    }
    else {
      console.log('[BackgroundAudio] 设备未变化')
    }
  }
  catch (error) {
    console.error('[BackgroundAudio] 切换设备失败:', error)
    throw error
  }
}

/**
 * 清理资源
 */
async function cleanup(): Promise<void> {
  console.log('[BackgroundAudio] 清理资源...')

  try {
    stopCapture()
    await capture.dispose()
    await playback.dispose()
    isInitialized = false
    console.log('[BackgroundAudio] ✓ 资源已清理')
  }
  catch (error) {
    console.error('[BackgroundAudio] 清理失败:', error)
  }
}

// 监听来自主进程的指令
window.api.onAudioCommand((command: string, data?: any) => {
  console.log('[BackgroundAudio] 收到指令:', command, data)

  switch (command) {
    case 'initialize':
      initialize().catch(console.error)
      break
    case 'start':
      startCapture().catch(console.error)
      break
    case 'stop':
      stopCapture()
      break
    case 'switchDevices':
      switchDevices().catch(console.error)
      break
    case 'cleanup':
      cleanup().catch(console.error)
      break
    default:
      console.warn('[BackgroundAudio] 未知指令:', command)
  }
})

// 应用启动时自动初始化
initialize().catch(console.error)

console.log('[BackgroundAudio] 后台音频系统已启动')
