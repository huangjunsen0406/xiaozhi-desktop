import type { Thing } from './Thing'
import type { IoTCommand, ThingDescriptor, ThingState } from './types'

/**
 * IoT 设备管理器
 * 单例模式，管理所有 IoT 设备
 */
export class ThingManager {
  private static instance: ThingManager | null = null
  private things: Thing[] = []
  private lastStates: Map<string, string> = new Map()

  private constructor() {
    console.log('[ThingManager] IoT 设备管理器初始化')
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ThingManager {
    if (!ThingManager.instance) {
      ThingManager.instance = new ThingManager()
    }
    return ThingManager.instance
  }

  /**
   * 初始化 IoT 设备
   */
  async initialize(): Promise<void> {
    try {
      // 导入并添加设备
      const { Lamp } = await import('./devices/Lamp')
      this.addThing(new Lamp())

      console.log('[ThingManager] IoT 设备初始化完成')
    }
    catch (error) {
      console.error('[ThingManager] IoT 设备初始化失败:', error)
      throw error
    }
  }

  /**
   * 添加设备
   */
  addThing(thing: Thing): void {
    this.things.push(thing)
    console.log(`[ThingManager] 添加设备: ${thing.name}`)
  }

  /**
   * 获取所有设备的描述符
   */
  async getDescriptors(): Promise<ThingDescriptor[]> {
    return this.things.map(thing => thing.getDescriptor())
  }

  /**
   * 获取所有设备的描述符 JSON 字符串
   */
  async getDescriptorsJson(): Promise<string> {
    const descriptors = await this.getDescriptors()
    return JSON.stringify(descriptors)
  }

  /**
   * 获取所有设备的状态
   */
  async getStates(delta = false): Promise<{ changed: boolean, states: ThingState[] }> {
    if (!delta) {
      this.lastStates.clear()
    }

    let changed = false
    const states: ThingState[] = []

    for (const thing of this.things) {
      const state = await thing.getState()
      const stateJson = JSON.stringify(state)

      if (delta) {
        // 检查状态是否变化
        const lastState = this.lastStates.get(thing.name)
        if (lastState === stateJson) {
          continue // 状态未变化，跳过
        }
        changed = true
        this.lastStates.set(thing.name, stateJson)
      }

      states.push(state)
    }

    return { changed, states }
  }

  /**
   * 获取所有设备的状态 JSON 字符串
   */
  async getStatesJson(delta = false): Promise<{ changed: boolean, json: string }> {
    const { changed, states } = await this.getStates(delta)
    return { changed, json: JSON.stringify(states) }
  }

  /**
   * 调用设备方法
   */
  async invoke(command: IoTCommand): Promise<unknown> {
    const thing = this.things.find(t => t.name === command.name)

    if (!thing) {
      const error = `设备不存在: ${command.name}`
      console.error(`[ThingManager] ${error}`)
      throw new Error(error)
    }

    console.log(`[ThingManager] 调用设备方法: ${command.name}.${command.method}`)
    const result = await thing.invoke(command)

    return result
  }

  /**
   * 获取所有设备
   */
  getThings(): Thing[] {
    return this.things
  }
}
