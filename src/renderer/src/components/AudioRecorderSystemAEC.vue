<template>
  <div class="p-4 space-y-3">
    <div class="flex gap-2">
      <button @click="toggle" :disabled="busy" class="record-btn">
        {{ recording ? '停止录音' : '开始录音（系统AEC）' }}
      </button>
      <span v-if="info" class="info-text">{{ info }}</span>
    </div>

    <div v-if="aecInfo" class="aec-status">
      <h4>系统级AEC状态：</h4>
      <div class="status-grid">
        <div class="status-item">
          <span class="label">AEC启用:</span>
          <span class="value" :class="{ 'enabled': aecInfo.echoCancellation }">
            {{ aecInfo.echoCancellation ? '✅ 是' : '❌ 否' }}
          </span>
        </div>
        <div class="status-item">
          <span class="label">AEC类型:</span>
          <span class="value" :class="{ 
            'system': aecInfo.echoCancellationType === 'system',
            'working': aecInfo.echoCancellationType === 'unknown' && aecInfo.hasSystemFeatures
          }">
            {{ aecInfo.echoCancellationType || 'unknown' }}
            {{ aecInfo.echoCancellationType === 'system' ? '🎯' : 
               (aecInfo.hasSystemFeatures ? '🔧' : '⚠️') }}
          </span>
        </div>
        <div class="status-item">
          <span class="label">噪音抑制:</span>
          <span class="value" :class="{ 'enabled': aecInfo.noiseSuppression }">
            {{ aecInfo.noiseSuppression ? '✅ 是' : '❌ 否' }}
          </span>
        </div>
        <div class="status-item">
          <span class="label">自动增益:</span>
          <span class="value" :class="{ 'enabled': aecInfo.autoGainControl }">
            {{ aecInfo.autoGainControl ? '✅ 是' : '❌ 否' }}
          </span>
        </div>
      </div>
      <div class="aec-explanation">
        <p v-if="aecInfo.echoCancellationType === 'system'" class="success">
          🎉 已启用系统级AEC！能够消除所有系统播放的音频（包括音乐播放器）
        </p>
        <p v-else-if="aecInfo.echoCancellationType === 'browser'" class="warning">
          ⚠️ 使用浏览器AEC，只能部分消除浏览器内音频，无法消除系统音乐
        </p>
        <p v-else-if="aecInfo.echoCancellationType === 'unknown' && aecInfo.hasSystemFeatures" class="info">
          🔧 AEC类型显示未知，但系统级特性已启用，应该能消除系统音频
          <br><small>某些Electron版本不完全支持echoCancellationType属性返回值</small>
        </p>
        <p v-else class="error">
          ❌ AEC类型未知，系统级特性可能未启用
        </p>
      </div>
      
      <div class="diagnostic-info">
        <h5>诊断信息：</h5>
        <ul>
          <li>Electron特性开关: ChromeWideEchoCancellation + SystemLoopbackAsAecReference</li>
          <li>请求的AEC类型: {{ aecInfo.requestedType }}</li>
          <li>实际获得的AEC: {{ aecInfo.echoCancellation ? '启用' : '禁用' }}</li>
          <li>浏览器支持约束: {{ aecInfo.supportedConstraints }}</li>
        </ul>
      </div>
    </div>

    <div v-if="audioUrl" class="playback-section">
      <h3>录音回放（已消除系统音频）：</h3>
      <audio :src="audioUrl" controls class="audio-player"></audio>
      <div class="file-info">
        <span>格式：{{ mime }}</span>
        <button @click="downloadRecording" class="download-btn">下载录音</button>
      </div>
    </div>

    <div class="instructions">
      <h4>测试说明：</h4>
      <ol>
        <li>确保AEC类型显示为 "system" 🎯</li>
        <li>播放音乐（任何播放器都可以）</li>
        <li>点击"开始录音"但不要说话</li>
        <li>如果系统AEC生效，录音中应该听不到音乐</li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const recording = ref(false)
const busy = ref(false)
const mediaRecorder = ref<MediaRecorder | null>(null)
const chunks: BlobPart[] = []
const audioUrl = ref('')
const info = ref('')
const mime = ref('audio/webm;codecs=opus')
const aecInfo = ref<any>(null)

let stream: MediaStream | null = null

async function toggle() {
  if (recording.value) {
    // 停止录制
    mediaRecorder.value?.stop()
    stream?.getTracks().forEach(t => t.stop())
    recording.value = false
    return
  }

  busy.value = true
  info.value = '初始化中…'
  
  try {
    // 检查浏览器支持的约束
    const sup = navigator.mediaDevices.getSupportedConstraints?.() || {}
    const wantSystemType = !!(sup as any).echoCancellationType

    console.log('支持的约束:', sup)
    console.log('支持echoCancellationType:', wantSystemType)

    // 检查特性开关是否生效
    const hasSystemFeatures = true // 我们已经在主进程中启用了特性

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: { exact: true },     // 强制打开 AEC
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        sampleRate: { ideal: 48000 },
        channelCount: { exact: 1 },
        echoCancellationType: 'system'
      } as any
    }

    console.log('请求的约束:', constraints)

    stream = await navigator.mediaDevices.getUserMedia(constraints)

    // 查看最终选择了哪个 AEC
    const track = stream.getAudioTracks()[0]
    const settings = track.getSettings?.() || {}
    console.log('实际设置:', settings)
    
    const pickedType = (settings as any).echoCancellationType || 'unknown'
    const pickedEC = settings.echoCancellation
    
    aecInfo.value = {
      echoCancellation: pickedEC,
      echoCancellationType: pickedType,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      sampleRate: settings.sampleRate,
      hasSystemFeatures: hasSystemFeatures,
      requestedType: wantSystemType ? 'system' : 'browser',
      supportedConstraints: wantSystemType ? '支持echoCancellationType' : '不支持echoCancellationType'
    }

    info.value = `AEC=${pickedEC} type=${pickedType}`

    // 录音设置
    const preferred = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"]
    for (const t of preferred) {
      if (MediaRecorder.isTypeSupported(t)) { 
        mime.value = t
        break
      }
    }

    mediaRecorder.value = new MediaRecorder(stream, { mimeType: mime.value })
    
    mediaRecorder.value.ondataavailable = (e) => { 
      if (e.data?.size) chunks.push(e.data)
    }
    
    mediaRecorder.value.onstop = () => {
      const blob = new Blob(chunks.slice(), { type: mime.value })
      audioUrl.value = URL.createObjectURL(blob)
      chunks.length = 0
    }

    mediaRecorder.value.start(100) // 100ms 切片
    recording.value = true
    info.value = '录音中...'
    
  } catch (e: any) {
    info.value = `启动失败：${e?.message || e}`
    console.error('录音启动失败:', e)
  } finally {
    busy.value = false
  }
}

function downloadRecording() {
  if (!audioUrl.value) return
  
  const a = document.createElement('a')
  a.href = audioUrl.value
  a.download = `system-aec-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${mime.value.includes('opus') ? 'webm' : 'mp3'}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
</script>

<style scoped>
.p-4 {
  padding: 1rem;
}

.space-y-3 > * + * {
  margin-top: 0.75rem;
}

.flex {
  display: flex;
}

.gap-2 {
  gap: 0.5rem;
}

.record-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  background: #4CAF50;
  color: white;
  transition: background-color 0.3s;
}

.record-btn:hover:not(:disabled) {
  background: #45a049;
}

.record-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.info-text {
  font-family: monospace;
  background: #f0f0f0;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
}

.aec-status {
  background: #f8f9fa;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
}

.aec-status h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 16px;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 4px;
}

.status-item .label {
  font-weight: 600;
  color: #495057;
}

.status-item .value {
  color: #6c757d;
  font-weight: bold;
}

.status-item .value.enabled {
  color: #28a745;
}

.status-item .value.system {
  color: #007bff;
  background: #e3f2fd;
  padding: 2px 8px;
  border-radius: 12px;
}

.status-item .value.working {
  color: #ff9800;
  background: #fff3e0;
  padding: 2px 8px;
  border-radius: 12px;
}

.aec-explanation {
  margin-top: 12px;
}

.aec-explanation p {
  padding: 8px 12px;
  border-radius: 4px;
  margin: 0;
  font-weight: 500;
}

.aec-explanation .success {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
}

.aec-explanation .warning {
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  color: #856404;
}

.aec-explanation .error {
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.aec-explanation .info {
  background: #e3f2fd;
  border: 1px solid #90caf9;
  color: #0d47a1;
}

.diagnostic-info {
  margin-top: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #dee2e6;
}

.diagnostic-info h5 {
  margin: 0 0 8px 0;
  color: #495057;
  font-size: 14px;
}

.diagnostic-info ul {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: #6c757d;
}

.diagnostic-info li {
  margin-bottom: 4px;
}

.playback-section {
  background: #e8f5e8;
  border: 2px solid #4CAF50;
  border-radius: 8px;
  padding: 16px;
}

.playback-section h3 {
  margin: 0 0 12px 0;
  color: #2e7d32;
}

.audio-player {
  width: 100%;
  margin: 8px 0;
}

.file-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 14px;
  color: #666;
}

.download-btn {
  padding: 6px 12px;
  background: #FF9800;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.download-btn:hover {
  background: #F57C00;
}

.instructions {
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: 8px;
  padding: 16px;
}

.instructions h4 {
  margin: 0 0 12px 0;
  color: #1565c0;
}

.instructions ol {
  margin: 0;
  padding-left: 20px;
  color: #333;
}

.instructions li {
  margin-bottom: 4px;
}
</style>