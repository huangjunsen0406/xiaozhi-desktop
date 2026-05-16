/**
 * 后台音频窗口入口
 * 负责音频采集和播放,保持系统AEC永久活跃
 */
import { AudioCapture } from './utils/audio/AudioCapture'
import { AudioPlayback } from './utils/audio/AudioPlayback'
import { getDeviceIdsFromConfig } from './utils/audio/deviceUtils'
import { initMusicPlayer } from './utils/music/MusicPlayer'

console.log('初始化后台音频系统...')

// 初始化音乐播放器
initMusicPlayer()
console.log('音乐播放器已初始化')

enum AudioState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  CAPTURING = 'capturing',
  SWITCHING = 'switching',
  ERROR = 'error',
}

type CommandType = 'initialize' | 'switchDevices' | 'updateConfig' | 'cleanup'

interface Command {
  type: CommandType
  priority: number // 0=高优先级, 1=普通
}

class AudioCommandQueue {
  private queue: Command[] = []
  private processing = false

  enqueue(type: CommandType, priority = 1): void {
    const command: Command = { type, priority }

    // 按优先级插入
    const insertIndex = this.queue.findIndex(c => c.priority > priority)
    if (insertIndex === -1) {
      this.queue.push(command)
    }
    else {
      this.queue.splice(insertIndex, 0, command)
    }

    console.log(`[Queue] 加入命令: ${type}`)
    this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true
    const command = this.queue.shift()!

    try {
      await this.execute(command)
    }
    catch (error) {
      console.error(`[Queue] 处理失败: ${command.type}`, error)
      updateState(AudioState.ERROR)
    }
    finally {
      this.processing = false
      if (this.queue.length > 0) {
        this.processNext()
      }
    }
  }

  private async execute(command: Command): Promise<void> {
    switch (command.type) {
      case 'initialize':
        await doInitialize()
        break
      case 'switchDevices':
        await doSwitchDevices()
        break
      case 'updateConfig':
        await doUpdateConfig()
        break
      case 'cleanup':
        await doCleanup()
        break
    }
  }
}

const commandQueue = new AudioCommandQueue()
const capture = new AudioCapture()
const playback = new AudioPlayback()

let currentState = AudioState.UNINITIALIZED
let currentInputDeviceId: string | undefined
let currentOutputDeviceId: string | undefined

/**
 * 更新状态并上报
 */
function updateState(newState: AudioState): void {
  if (currentState === newState) {
    return
  }

  const oldState = currentState
  currentState = newState

  console.log(`[State] ${oldState} → ${newState}`)

  // 上报给主进程
  window.api.sendAudioState({
    state: newState,
    capturing: newState === AudioState.CAPTURING,
    initialized: newState !== AudioState.UNINITIALIZED && newState !== AudioState.INITIALIZING,
  })
}

/**
 * 执行初始化并启动采集
 */
async function doInitialize(): Promise<void> {
  if (currentState !== AudioState.UNINITIALIZED && currentState !== AudioState.ERROR) {
    console.log('音频系统已初始化,跳过')
    return
  }

  updateState(AudioState.INITIALIZING)

  try {
    const { inputDeviceId, outputDeviceId } = await getDeviceIdsFromConfig()

    await capture.initialize(inputDeviceId)
    currentInputDeviceId = inputDeviceId
    console.log('✓ 采集器初始化成功')

    await playback.initialize(outputDeviceId)
    currentOutputDeviceId = outputDeviceId
    console.log('✓ 播放器初始化成功')

    // 直接开始采集
    await capture.start()
    updateState(AudioState.CAPTURING)
    console.log('✓ 音频系统初始化并开始采集')
  }
  catch (error) {
    console.error('初始化失败', error)
    updateState(AudioState.ERROR)
    throw error
  }
}

/**
 * 执行设备切换
 */
async function doSwitchDevices(): Promise<void> {
  // 未初始化，先初始化
  if (currentState === AudioState.UNINITIALIZED || currentState === AudioState.ERROR) {
    console.log('音频系统未初始化，先进行初始化...')
    await doInitialize()
  }

  try {
    console.log('检查设备配置...')

    // 获取最新的设备配置
    const { inputDeviceId, outputDeviceId } = await getDeviceIdsFromConfig()

    let changed = false

    // 切换输入设备
    if (inputDeviceId !== currentInputDeviceId && inputDeviceId) {
      console.log('切换输入设备:', currentInputDeviceId, '→', inputDeviceId)
      await capture.switchDevice(inputDeviceId)
      currentInputDeviceId = inputDeviceId
      changed = true
    }

    // 切换输出设备
    if (outputDeviceId !== currentOutputDeviceId && outputDeviceId) {
      console.log('切换输出设备:', currentOutputDeviceId, '→', outputDeviceId)
      await playback.switchDevice(outputDeviceId)
      currentOutputDeviceId = outputDeviceId
      changed = true
    }

    if (changed) {
      console.log('✓ 设备切换完成')
    }
    else {
      console.log('设备未变化')
    }

    // 恢复到采集状态
    updateState(AudioState.CAPTURING)
  }
  catch (error) {
    console.error('切换设备失败', error)
    updateState(AudioState.ERROR)
    throw error
  }
}

/**
 * 执行配置更新（采样率、帧长度等）
 */
async function doUpdateConfig(): Promise<void> {
  // 未初始化，跳过更新
  if (currentState === AudioState.UNINITIALIZED || currentState === AudioState.ERROR) {
    console.log('音频系统未初始化，跳过配置更新')
    return
  }

  try {
    console.log('更新音频配置...')

    // 更新采集器配置
    await capture.updateConfig()

    // 更新播放器配置
    await playback.updateConfig()

    console.log('✓ 音频配置已更新')
  }
  catch (error) {
    console.error('更新配置失败', error)
    // 配置更新失败不改变状态，继续使用旧配置
  }
}

/**
 * 执行清理
 */
async function doCleanup(): Promise<void> {
  console.log('清理资源...')

  try {
    if (currentState === AudioState.CAPTURING) {
      capture.stop()
    }

    await capture.dispose()
    await playback.dispose()

    updateState(AudioState.UNINITIALIZED)
    console.log('✓ 资源已清理')
  }
  catch (error) {
    console.error('清理失败', error)
    updateState(AudioState.ERROR)
  }
}

// 监听来自主进程的指令
window.api.onAudioCommand((command: string, _data?: Record<string, unknown>) => {
  console.log('收到指令:', command)

  switch (command) {
    case 'switchDevices':
      // 用户在设置中更改了音频设备
      commandQueue.enqueue('switchDevices', 1)
      break
    case 'updateConfig':
      // 用户在设置中更改了音频配置（采样率、帧长度等）
      commandQueue.enqueue('updateConfig', 1)
      break
    case 'cleanup':
      // 应用即将退出，清理资源
      commandQueue.enqueue('cleanup', 0)
      break
    default:
      console.warn('[BackgroundAudio] 未知指令:', command)
  }
})

// 页面加载完成后自动初始化并开始采集
window.addEventListener('DOMContentLoaded', () => {
  commandQueue.enqueue('initialize', 0)
})

console.log('后台音频系统已启动')
