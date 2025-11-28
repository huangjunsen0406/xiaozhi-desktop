import { Thing } from '../Thing'

/**
 * 灯设备
 * 用于测试和演示的简单灯控制设备
 */
export class Lamp extends Thing {
  private power = false

  constructor() {
    super('Lamp', '一个测试用的灯')

    // 定义属性 - 灯的开关状态
    this.addProperty('power', '灯是否打开', () => this.getPower())

    // 定义方法 - 打开灯
    this.addMethod('TurnOn', '打开灯', [], async () => this.turnOn())

    // 定义方法 - 关闭灯
    this.addMethod('TurnOff', '关闭灯', [], async () => this.turnOff())
  }

  /**
   * 获取灯的开关状态
   */
  private getPower(): boolean {
    return this.power
  }

  /**
   * 打开灯
   */
  private async turnOn(): Promise<{ status: string, message: string }> {
    this.power = true
    console.log('[Lamp] 灯已打开')
    return {
      status: 'success',
      message: '灯已打开',
    }
  }

  /**
   * 关闭灯
   */
  private async turnOff(): Promise<{ status: string, message: string }> {
    this.power = false
    console.log('[Lamp] 灯已关闭')
    return {
      status: 'success',
      message: '灯已关闭',
    }
  }
}
