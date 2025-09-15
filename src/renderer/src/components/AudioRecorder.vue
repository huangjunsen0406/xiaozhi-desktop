<template>
  <div class="audio-recorder">
    <h2>WebRTC 音频录制器</h2>

    <div class="controls">
      <button
        @click="toggleRecording"
        :class="['record-btn', { recording: isRecording }]"
        :disabled="isInitializing"
      >
        {{ isRecording ? '停止录音' : '开始录音' }}
      </button>

      <button @click="playRecording" :disabled="!audioBlob || isRecording" class="play-btn">
        播放录音
      </button>

      <button @click="downloadRecording" :disabled="!audioBlob" class="download-btn">
        下载MP3
      </button>
    </div>

    <div class="status">
      <p v-if="isInitializing">正在初始化音频设备...</p>
      <p v-else-if="isRecording">🔴 录音中...</p>
      <p v-else-if="audioBlob">✅ 录音完成</p>
      <p v-else>准备就绪</p>
    </div>

    <div class="audio-info" v-if="recordingDuration > 0">
      <p>录音时长: {{ formatDuration(recordingDuration) }}</p>
    </div>

    <div class="audio-settings" v-if="!isRecording && mediaStream">
      <h4>高级音频分离设置</h4>
      <div class="settings-grid">
        <div class="setting-item">
          <span class="label">智能人声检测:</span>
          <span class="value enabled">✅ 启用</span>
        </div>
        <div class="setting-item">
          <span class="label">音乐频率抑制:</span>
          <span class="value enabled">✅ 启用</span>
        </div>
        <div class="setting-item">
          <span class="label">动态门限控制:</span>
          <span class="value enabled">✅ 启用</span>
        </div>
        <div class="setting-item">
          <span class="label">频率范围:</span>
          <span class="value">200Hz - 4kHz</span>
        </div>
      </div>

      <div class="basic-settings">
        <h5>基础设置</h5>
        <div class="settings-grid">
          <div class="setting-item">
            <span class="label">回声消除:</span>
            <span class="value" :class="{ enabled: audioSettings?.echoCancellation }">
              {{ audioSettings?.echoCancellation ? '✅ 启用' : '❌ 禁用' }}
            </span>
          </div>
          <div class="setting-item">
            <span class="label">噪音抑制:</span>
            <span class="value" :class="{ enabled: audioSettings?.noiseSuppression }">
              {{ audioSettings?.noiseSuppression ? '✅ 启用' : '❌ 禁用' }}
            </span>
          </div>
          <div class="setting-item">
            <span class="label">采样率:</span>
            <span class="value">{{ audioSettings?.sampleRate }} Hz</span>
          </div>
        </div>
      </div>
    </div>

    <div class="audio-visualization" v-if="isRecording">
      <h4>实时音频分析</h4>
      <div class="viz-info">
        <div class="viz-item">
          <span class="viz-label">人声强度:</span>
          <div class="viz-bar">
            <div class="viz-fill voice" :style="{ width: voiceLevel + '%' }"></div>
          </div>
          <span class="viz-value">{{ voiceLevel }}%</span>
        </div>
        <div class="viz-item">
          <span class="viz-label">背景音乐:</span>
          <div class="viz-bar">
            <div class="viz-fill music" :style="{ width: musicLevel + '%' }"></div>
          </div>
          <span class="viz-value">{{ musicLevel }}%</span>
        </div>
        <div class="viz-item">
          <span class="viz-label">录制状态:</span>
          <span class="viz-status" :class="{ active: isRecordingActive }">
            {{ isRecordingActive ? '🎙️ 录制人声' : '🔇 静音中' }}
          </span>
        </div>
      </div>
    </div>

    <audio ref="audioPlayer" controls v-if="audioUrl" class="audio-player" preload="metadata">
      <source :src="audioUrl" :type="audioBlob?.type || 'audio/webm'" />
      您的浏览器不支持音频播放。
    </audio>

    <div class="error" v-if="errorMessage">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as lamejs from 'lamejs'

const isRecording = ref(false)
const isInitializing = ref(false)
const audioBlob = ref<Blob | null>(null)
const audioUrl = ref<string>('')
const errorMessage = ref<string>('')
const recordingDuration = ref(0)
const audioSettings = ref<MediaTrackSettings | null>(null)
const voiceLevel = ref(0)
const musicLevel = ref(0)
const isRecordingActive = ref(false)

let mediaRecorder: MediaRecorder | null = null
let recordingStartTime = 0
let durationTimer: number | null = null

// 音频录制相关
let mediaStream: MediaStream | null = null
let audioChunks: Blob[] = []
let globalAudioContext: AudioContext | null = null
let audioContext: AudioContext | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null
let gainNode: GainNode | null = null
let filterNode: BiquadFilterNode | null = null

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const initAudioContext = async (): Promise<void> => {
  try {
    isInitializing.value = true
    errorMessage.value = ''

    // 尝试获取桌面音频进行消除（实验性功能）
    try {
      // 在Electron中尝试获取桌面音频
      const systemAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: 'screen:0:0'
          }
        } as any
      })
      console.log('成功获取系统音频流:', systemAudioStream)
      // 可以在这里实现更高级的音频处理逻辑
    } catch (e) {
      console.log('无法获取系统音频，使用高级过滤方案')
    }

    // 获取麦克风音频 - 使用Chrome最新的回声消除建议
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // 强制使用浏览器的原生回声消除
        echoCancellation: true,
        // 启用改进的噪音抑制
        noiseSuppression: true,
        // 使用系统的自动增益控制
        autoGainControl: true,
        // 高质量采样率
        sampleRate: { ideal: 48000 },
        // 单声道录制
        channelCount: { exact: 1 }
        // 注释掉不支持的属性
        // latency: { ideal: 0.01 } as any,
        // suppressLocalAudioPlayback: true as any
      }
    })

    mediaStream = stream

    // 创建高级音频处理链
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    sourceNode = audioContext.createMediaStreamSource(stream)

    // 创建多级音频处理
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8

    // 人声频率增强器 (300Hz - 3400Hz)
    const voiceFilter = audioContext.createBiquadFilter()
    voiceFilter.type = 'bandpass'
    voiceFilter.frequency.value = 1000 // 人声中心频率
    voiceFilter.Q.value = 2

    // 音乐频率抑制器 (低频和高频)
    const musicSuppressor1 = audioContext.createBiquadFilter()
    musicSuppressor1.type = 'highpass'
    musicSuppressor1.frequency.value = 200 // 去除低频音乐
    musicSuppressor1.Q.value = 0.7

    const musicSuppressor2 = audioContext.createBiquadFilter()
    musicSuppressor2.type = 'lowpass'
    musicSuppressor2.frequency.value = 4000 // 去除高频音乐
    musicSuppressor2.Q.value = 0.7

    // 动态范围压缩器
    const compressor = audioContext.createDynamicsCompressor()
    compressor.threshold.value = -24
    compressor.knee.value = 30
    compressor.ratio.value = 12
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    // 增益控制
    gainNode = audioContext.createGain()
    gainNode.gain.value = 2.0 // 增强人声

    // 门限器 - 只有超过一定音量才录制
    const gateNode = audioContext.createGain()

    // 连接处理链
    sourceNode.connect(analyser)
    sourceNode.connect(musicSuppressor1)
    musicSuppressor1.connect(musicSuppressor2)
    musicSuppressor2.connect(voiceFilter)
    voiceFilter.connect(compressor)
    compressor.connect(gainNode)
    gainNode.connect(gateNode)

    // 实现智能门限 - 检测人声vs背景音乐
    const setupSmartGate = () => {
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const checkAudioLevel = () => {
        analyser.getByteFrequencyData(dataArray)

        // 计算人声频段能量 (300-3400Hz)
        const voiceRange = dataArray.slice(10, 100) // 大概的人声频段
        const voiceEnergy = voiceRange.reduce((sum, val) => sum + val, 0) / voiceRange.length

        // 计算音乐频段能量 (低频和高频)
        const musicLowRange = dataArray.slice(0, 10)
        const musicHighRange = dataArray.slice(150, 200)
        const musicEnergy =
          [...musicLowRange, ...musicHighRange].reduce((sum, val) => sum + val, 0) /
          (musicLowRange.length + musicHighRange.length)

        // 智能门限: 当人声能量明显高于音乐能量时才录制
        const voiceToMusicRatio = voiceEnergy / (musicEnergy + 1)
        const threshold = voiceToMusicRatio > 1.5 ? 1.0 : 0.1 // 动态调整增益

        // 更新可视化数据
        voiceLevel.value = Math.min(100, (voiceEnergy / 255) * 100)
        musicLevel.value = Math.min(100, (musicEnergy / 255) * 100)
        isRecordingActive.value = threshold > 0.5

        if (audioContext) {
          gateNode.gain.linearRampToValueAtTime(threshold, audioContext.currentTime + 0.1)
        }

        if (isRecording.value) {
          requestAnimationFrame(checkAudioLevel)
        }
      }

      if (isRecording.value) {
        checkAudioLevel()
      }
    }

    // 保存智能门限函数到全局
    ;(window as any).setupSmartGate = setupSmartGate

    // 创建输出流
    const destination = audioContext.createMediaStreamDestination()
    gateNode.connect(destination)

    // 保存音频设置信息
    audioSettings.value = stream.getAudioTracks()[0].getSettings()

    console.log('音频处理链设置完成:', audioSettings.value)

    // 使用处理后的音频流创建 MediaRecorder
    let options: MediaRecorderOptions | undefined

    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      options = { mimeType: 'audio/webm;codecs=opus' }
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      options = { mimeType: 'audio/webm' }
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      options = { mimeType: 'audio/mp4' }
    } else if (MediaRecorder.isTypeSupported('audio/wav')) {
      options = { mimeType: 'audio/wav' }
    }

    mediaRecorder = new MediaRecorder(destination.stream, options)
    console.log('使用的音频格式:', mediaRecorder.mimeType)

    // 设置事件监听器
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder?.mimeType || 'audio/webm'
      const blob = new Blob(audioChunks, { type: mimeType })
      audioBlob.value = blob
      audioUrl.value = URL.createObjectURL(blob)
      audioChunks = []
      console.log('录音完成，文件大小:', blob.size, 'bytes, 类型:', blob.type)
    }
  } catch (error) {
    console.error('初始化音频失败:', error)
    errorMessage.value = '无法访问麦克风，请检查权限设置'
  } finally {
    isInitializing.value = false
  }
}

const toggleRecording = async (): Promise<void> => {
  if (!mediaRecorder) {
    await initAudioContext()
    if (!mediaRecorder) return
  }

  if (isRecording.value) {
    stopRecording()
  } else {
    startRecording()
  }
}

const startRecording = (): void => {
  if (!mediaRecorder) return

  audioChunks = []
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = ''
  }
  audioBlob.value = null
  recordingDuration.value = 0

  mediaRecorder.start(100) // 每100ms收集一次数据
  isRecording.value = true
  recordingStartTime = Date.now()

  // 启动智能门限检测
  if ((window as any).setupSmartGate) {
    ;(window as any).setupSmartGate()
  }

  // 开始计时
  durationTimer = window.setInterval(() => {
    recordingDuration.value = Math.floor((Date.now() - recordingStartTime) / 1000)
  }, 1000)
}

const stopRecording = (): void => {
  if (!mediaRecorder || !isRecording.value) return

  mediaRecorder.stop()
  isRecording.value = false

  if (durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
}

const audioPlayer = ref<HTMLAudioElement>()

const playRecording = (): void => {
  if (!audioUrl.value) return

  errorMessage.value = '' // 清除之前的错误信息

  if (audioPlayer.value) {
    // 使用模板ref直接播放
    audioPlayer.value.currentTime = 0
    audioPlayer.value.play().catch((error) => {
      console.error('播放失败:', error)
      errorMessage.value = `播放失败: ${error.message}`
    })
  } else {
    // 备用方案：创建新的Audio对象
    const audio = new Audio(audioUrl.value)
    audio.play().catch((error) => {
      console.error('播放失败:', error)
      errorMessage.value = `播放失败: ${error.message}`
    })
  }
}

const downloadRecording = async (): Promise<void> => {
  if (!audioBlob.value) return

  try {
    // 转换为MP3格式
    const mp3Blob = await convertToMp3(audioBlob.value)

    const url = URL.createObjectURL(mp3Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.mp3`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('下载失败:', error)
    errorMessage.value = '下载失败'
  }
}

// 将WebM音频转换为MP3
const convertToMp3 = async (webmBlob: Blob): Promise<Blob> => {
  return new Promise(async (resolve, reject) => {
    try {
      // 创建音频上下文来解码音频
      const arrayBuffer = await webmBlob.arrayBuffer()
      globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const audioBuffer = await globalAudioContext.decodeAudioData(arrayBuffer)

      // 获取音频数据
      const samples = audioBuffer.getChannelData(0) // 获取第一个声道
      const sampleRate = audioBuffer.sampleRate

      // 转换为16位PCM
      const buffer = new Int16Array(samples.length)
      for (let i = 0; i < samples.length; i++) {
        buffer[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff
      }

      // 使用lamejs编码为MP3
      const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128) // 1声道，采样率，比特率128kbps
      const mp3Data: Int8Array[] = []

      const blockSize = 1152 // MP3编码块大小
      for (let i = 0; i < buffer.length; i += blockSize) {
        const sampleChunk = buffer.subarray(i, i + blockSize)
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk)
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf)
        }
      }

      // 完成编码
      const finalBuffer = mp3encoder.flush()
      if (finalBuffer.length > 0) {
        mp3Data.push(finalBuffer)
      }

      // 创建MP3 Blob
      const mp3Blob = new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' })
      resolve(mp3Blob)
    } catch (error) {
      console.error('MP3转换失败:', error)
      reject(error)
    }
  })
}

const cleanup = (): void => {
  if (durationTimer) {
    clearInterval(durationTimer)
  }

  // 断开音频节点连接
  if (sourceNode) {
    sourceNode.disconnect()
    sourceNode = null
  }

  if (gainNode) {
    gainNode.disconnect()
    gainNode = null
  }

  if (filterNode) {
    filterNode.disconnect()
    filterNode = null
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop())
    mediaStream = null
  }

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close()
    audioContext = null
  }

  if (globalAudioContext && globalAudioContext.state !== 'closed') {
    globalAudioContext.close()
    globalAudioContext = null
  }

  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
  }
}

onMounted(() => {
  // 组件挂载时初始化
})

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped>
.audio-recorder {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #f9f9f9;
}

.controls {
  display: flex;
  gap: 10px;
  margin: 20px 0;
  flex-wrap: wrap;
}

.record-btn,
.play-btn,
.download-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.3s ease;
}

.record-btn {
  background: #4caf50;
  color: white;
}

.record-btn.recording {
  background: #f44336;
  animation: pulse 2s infinite;
}

.play-btn {
  background: #2196f3;
  color: white;
}

.download-btn {
  background: #ff9800;
  color: white;
}

.record-btn:disabled,
.play-btn:disabled,
.download-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.record-btn:hover:not(:disabled) {
  background: #45a049;
}

.record-btn.recording:hover {
  background: #da190b;
}

.play-btn:hover:not(:disabled) {
  background: #1976d2;
}

.download-btn:hover:not(:disabled) {
  background: #f57c00;
}

.status {
  margin: 15px 0;
  font-weight: bold;
}

.audio-info {
  margin: 10px 0;
  color: #666;
}

.audio-player {
  width: 100%;
  margin: 20px 0;
}

.error {
  color: #f44336;
  margin: 10px 0;
  padding: 10px;
  background: #ffebee;
  border-radius: 4px;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(244, 67, 54, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0);
  }
}

h2 {
  text-align: center;
  color: #333;
  margin-bottom: 20px;
}

.audio-settings {
  margin: 20px 0;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.audio-settings h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: white;
  border-radius: 4px;
  border: 1px solid #eee;
}

.setting-item .label {
  font-weight: 600;
  color: #555;
}

.setting-item .value {
  color: #666;
}

.setting-item .value.enabled {
  color: #4caf50;
  font-weight: bold;
}

.basic-settings {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #ddd;
}

.basic-settings h5 {
  margin: 0 0 10px 0;
  color: #666;
  font-size: 14px;
}

.audio-visualization {
  margin: 20px 0;
  padding: 15px;
  background: #e8f5e8;
  border-radius: 8px;
  border: 2px solid #4caf50;
}

.audio-visualization h4 {
  margin: 0 0 15px 0;
  color: #2e7d32;
  font-size: 16px;
}

.viz-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.viz-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.viz-label {
  min-width: 80px;
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.viz-bar {
  flex: 1;
  height: 20px;
  background: #ddd;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

.viz-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.1s ease;
}

.viz-fill.voice {
  background: linear-gradient(90deg, #4caf50, #8bc34a);
}

.viz-fill.music {
  background: linear-gradient(90deg, #ff5722, #ff9800);
}

.viz-value {
  min-width: 40px;
  text-align: right;
  font-weight: bold;
  color: #333;
  font-size: 12px;
}

.viz-status {
  padding: 4px 12px;
  border-radius: 20px;
  background: #f0f0f0;
  color: #666;
  font-weight: bold;
  font-size: 14px;
  transition: all 0.3s ease;
}

.viz-status.active {
  background: #4caf50;
  color: white;
  animation: pulse-green 2s infinite;
}

@keyframes pulse-green {
  0% {
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(76, 175, 80, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
  }
}
</style>
