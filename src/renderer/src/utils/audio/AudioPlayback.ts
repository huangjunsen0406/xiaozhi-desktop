import type { PcmAudioData } from '@shared/types'

/** PCM playback owns scheduled sources, the output context and its IPC subscription. */
export class AudioPlayback {
  private audioContext: AudioContext | null = null
  private sources = new Set<AudioBufferSourceNode>()
  private nextStartTime = 0
  private accepting = false
  private removeOpusDecodedListener: (() => void) | null = null
  private sampleRate = 24000
  private channels = 1

  async initialize(deviceId?: string): Promise<void> {
    await this.dispose()
    const config = await window.api.audioGetConfig()
    this.sampleRate = config.outputSampleRate || 24000
    this.channels = config.channels || 1
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate })
    const context = this.audioContext
    context.onstatechange = () => {
      if (this.accepting && context.state === 'suspended') {
        void context.resume().catch(error => console.error('恢复播放上下文失败:', error))
      }
    }
    try {
      await this.switchDevice(deviceId || 'default')
      await this.audioContext.resume()
      this.removeOpusDecodedListener = window.api.audioOnOpusDecoded(data => this.playPCM(data))
    }
    catch (error) {
      await this.dispose()
      throw error
    }
  }

  start(): void {
    this.accepting = true
  }

  async switchDevice(deviceId: string): Promise<void> {
    if (!this.audioContext)
      throw new Error('AudioContext 未初始化')
    if ('setSinkId' in this.audioContext) {
      // @ts-expect-error setSinkId is supported by Chromium but absent from this DOM lib.
      await this.audioContext.setSinkId(deviceId)
    }
  }

  async updateConfig(): Promise<void> {
    const config = await window.api.audioGetConfig()
    this.sampleRate = config.outputSampleRate || 24000
    this.channels = config.channels || 1
  }

  private playPCM(data: PcmAudioData): void {
    const context = this.audioContext
    // Never queue old speech while the OS/context cannot play it.
    if (!this.accepting || !context || context.state !== 'running')
      return
    try {
      const samples = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2)
      const buffer = context.createBuffer(this.channels, samples.length, this.sampleRate)
      const output = buffer.getChannelData(0)
      for (let i = 0; i < samples.length; i++)
        output[i] = samples[i] / (samples[i] < 0 ? 0x8000 : 0x7FFF)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.onended = () => {
        source.disconnect()
        this.sources.delete(source)
      }
      this.sources.add(source)
      this.nextStartTime = Math.max(context.currentTime, this.nextStartTime)
      source.start(this.nextStartTime)
      this.nextStartTime += buffer.duration
    }
    catch (error) {
      console.error('播放 PCM 失败:', error)
    }
  }

  /** Stop and disconnect pending speech without creating a replacement context. */
  stop(): void {
    this.accepting = false
    for (const source of this.sources) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    this.sources.clear()
    this.nextStartTime = 0
  }

  async dispose(): Promise<void> {
    this.stop()
    this.removeOpusDecodedListener?.()
    this.removeOpusDecodedListener = null
    const context = this.audioContext
    this.audioContext = null
    if (context) {
      context.onstatechange = null
      if (context.state !== 'closed')
        await context.close()
    }
  }

  getLatency(): number {
    return this.audioContext ? Math.max(0, this.nextStartTime - this.audioContext.currentTime) : 0
  }
}
