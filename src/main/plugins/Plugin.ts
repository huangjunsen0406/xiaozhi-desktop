import type { DeviceState } from '../constants/DeviceState'
import type { Protocol } from '../protocols/Protocol'

/**
 * 插件基类
 * 所有插件必须继承此类并实现相关生命周期方法
 */
export abstract class Plugin {
  /**
   * 插件名称
   */
  abstract readonly name: string

  /**
   * 插件优先级（数值越小越优先执行）
   * 默认为 50
   */
  readonly priority: number = 50

  /**
   * 插件初始化（在应用启动时调用一次）
   * @param _app - 应用实例
   */
  async setup(_app: any): Promise<void> {
    // 子类可选实现
  }

  /**
   * 插件启动（在初始化完成后调用）
   */
  async start(): Promise<void> {
    // 子类可选实现
  }

  /**
   * 协议连接成功回调
   * @param _protocol - 协议实例
   */
  async onProtocolConnected(_protocol: Protocol): Promise<void> {
    // 子类可选实现
  }

  /**
   * 接收到 JSON 消息回调
   * @param _message - JSON 消息数据
   */
  async onIncomingJson(_message: any): Promise<void> {
    // 子类可选实现
  }

  /**
   * 接收到音频数据回调
   * @param _data - 音频二进制数据
   */
  async onIncomingAudio(_data: Buffer): Promise<void> {
    // 子类可选实现
  }

  /**
   * 设备状态变化回调
   * @param _state - 新的设备状态
   */
  async onDeviceStateChanged(_state: DeviceState): Promise<void> {
    // 子类可选实现
  }

  /**
   * 插件停止
   */
  async stop(): Promise<void> {
    // 子类可选实现
  }

  /**
   * 插件关闭（清理资源）
   */
  async shutdown(): Promise<void> {
    // 子类可选实现
  }
}
