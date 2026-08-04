declare module 'sherpa-onnx-node' {
  export interface KeywordSpotter {
    createStream: () => KeywordSpotterStream
    isReady: (stream: KeywordSpotterStream) => boolean
    decode: (stream: KeywordSpotterStream) => void
    getResult: (stream: KeywordSpotterStream) => KeywordSpotterResult
    reset: (stream: KeywordSpotterStream) => void
  }

  export interface KeywordSpotterStream {
    acceptWaveform: (config: { sampleRate: number, samples: Float32Array }) => void
  }

  export interface KeywordSpotterResult {
    keyword: string
  }

  export interface KeywordSpotterConfig {
    featConfig: {
      sampleRate: number
      featureDim: number
    }
    modelConfig: {
      transducer: {
        encoder: string
        decoder: string
        joiner: string
      }
      tokens: string
      numThreads?: number
      provider?: string
      debug?: number | boolean
    }
    maxActivePaths?: number
    keywordsScore?: number
    keywordsThreshold?: number
    numTrailingBlanks?: number
    keywordsFile: string
  }

  const sherpaOnnx: {
    KeywordSpotter: new (config: KeywordSpotterConfig) => KeywordSpotter
  }

  export default sherpaOnnx
}
