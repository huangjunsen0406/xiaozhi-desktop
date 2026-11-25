import { subscribeChannel } from '../utils/ipc'

export const live2dApi = {
  onAudioVolume: (callback: (volume: number) => void): () => void =>
    subscribeChannel('live2d:audio-volume', callback),
}
