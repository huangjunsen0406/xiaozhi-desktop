/**
 * 后台音频窗口入口
 * 负责音频采集和播放,保持系统AEC永久活跃
 */
import { AudioCapture } from './utils/audio/AudioCapture'
import { AudioPlayback } from './utils/audio/AudioPlayback'
import { getDeviceIdsFromConfig } from './utils/audio/deviceUtils'
import { initMusicPlayer } from './utils/music/MusicPlayer'

// 日志辅助函数：同时输出到控制台和主进程
function log(level: 'info' | 'error' | 'warn', ...args: any[]) {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ')

  console[level === 'info' ? 'log' : level](...args)

  // 发送到主进程日志系统
  window.api?.logToMain?.({
    level,
    source: 'BackgroundAudio',
    message,
    timestamp: new Date().toISOString()
  }).catch(() => {
    // 忽略日志发送失败
  })
}

log('info', '初始化后台音频系统...')

// 初始化音乐播放器
initMusicPlayer()
log('info', '音乐播放器已初始化')

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
    log('info', '音频系统已初始化,跳过')
    return
  }

  try {
    log('info', '初始化音频系统...')

    // 获取配置的设备ID
    const { inputDeviceId, outputDeviceId } = await getDeviceIdsFromConfig()
    log('info', `设备配置: input=${inputDeviceId || 'default'}, output=${outputDeviceId || 'default'}`)

    // 初始化采集器
    log('info', '开始初始化采集器...')
    await capture.initialize(inputDeviceId)
    currentInputDeviceId = inputDeviceId
    log('info', '✓ 采集器初始化成功')

    // 初始化播放器
    log('info', '开始初始化播放器...')
    await playback.initialize(outputDeviceId)
    currentOutputDeviceId = outputDeviceId
    log('info', '✓ 播放器初始化成功')

    isInitialized = true
    log('info', '✓ 音频系统初始化完成')
  }
  catch (error) {
    log('error', '初始化失败:', error)
    throw error
  }
}

/**
 * 开始音频采集
 */
async function startCapture(): Promise<void> {
  if (!isInitialized) {
    log('warn', '未初始化，先进行初始化...')
    await initialize()
  }

  if (isCapturing) {
    log('warn', '已在采集中,跳过')
    return
  }

  try {
    log('info', '开始音频采集...')
    await capture.start()
    isCapturing = true
    log('info', '✓ 音频采集已开始')
  }
  catch (error) {
    log('error', '开始采集失败:', error)
    throw error
  }
}

/**
 * 停止音频采集
 */
function stopCapture(): void {
  if (!isCapturing) {
    log('warn', '未在采集中,跳过')
    return
  }

  try {
    log('info', '停止音频采集...')
    capture.stop()
    isCapturing = false
    log('info', '✓ 音频采集已停止')
  }
  catch (error) {
    log('error', '停止采集失败:', error)
  }
}

/**
 * 切换音频设备
 */
async function switchDevices(): Promise<void> {
  try {
    log('info', '检查设备配置...')

    // 获取最新的设备配置
    const { inputDeviceId, outputDeviceId } = await getDeviceIdsFromConfig()

    let changed = false

    // 切换输入设备
    if (inputDeviceId !== currentInputDeviceId && inputDeviceId) {
      log('info', `切换输入设备: ${currentInputDeviceId} → ${inputDeviceId}`)
      await capture.switchDevice(inputDeviceId)
      currentInputDeviceId = inputDeviceId
      changed = true
    }

    // 切换输出设备
    if (outputDeviceId !== currentOutputDeviceId && outputDeviceId) {
      log('info', `切换输出设备: ${currentOutputDeviceId} → ${outputDeviceId}`)
      await playback.switchDevice(outputDeviceId)
      currentOutputDeviceId = outputDeviceId
      changed = true
    }

    if (changed) {
      log('info', '✓ 设备切换完成')
    }
    else {
      log('info', '设备未变化')
    }
  }
  catch (error) {
    log('error', '切换设备失败:', error)
    throw error
  }
}

/**
 * 清理资源
 */
async function cleanup(): Promise<void> {
  log('info', '清理资源...')

  try {
    stopCapture()
    await capture.dispose()
    await playback.dispose()
    isInitialized = false
    log('info', '✓ 资源已清理')
  }
  catch (error) {
    log('error', '清理失败:', error)
  }
}

// 监听来自主进程的指令
window.api.onAudioCommand((command: string, _data?: Record<string, unknown>) => {
  log('info', `收到指令: ${command}`)

  switch (command) {
    case 'initialize':
      initialize().catch(err => log('error', 'initialize failed:', err))
      break
    case 'start':
      startCapture().catch(err => log('error', 'startCapture failed:', err))
      break
    case 'stop':
      stopCapture()
      break
    case 'switchDevices':
      switchDevices().catch(err => log('error', 'switchDevices failed:', err))
      break
    case 'cleanup':
      cleanup().catch(err => log('error', 'cleanup failed:', err))
      break
    default:
      log('warn', `未知指令: ${command}`)
  }
})

log('info', '后台音频系统已启动')
