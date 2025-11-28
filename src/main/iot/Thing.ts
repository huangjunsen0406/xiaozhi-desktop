import type {
  IoTCommand,
  MethodCallback,
  ParameterDef,
  PropertyGetter,
  ThingDescriptor,
  ThingState,
} from './types'
import { Method } from './Method'
import { Property } from './Property'

/**
 * IoT 设备基类
 */
export abstract class Thing {
  name: string
  description: string
  protected properties: Map<string, Property>
  protected methods: Map<string, Method>

  constructor(name: string, description: string) {
    this.name = name
    this.description = description
    this.properties = new Map()
    this.methods = new Map()
  }

  /**
   * 添加属性
   */
  protected addProperty<T = unknown>(
    name: string,
    description: string,
    getter: PropertyGetter<T>,
  ): void {
    const property = new Property<T>(name, description, getter)
    this.properties.set(name, property)
  }

  /**
   * 添加方法
   */
  protected addMethod(
    name: string,
    description: string,
    parameters: ParameterDef[],
    callback: MethodCallback,
  ): void {
    const method = new Method(name, description, parameters, callback)
    this.methods.set(name, method)
  }

  /**
   * 获取设备描述符
   */
  getDescriptor(): ThingDescriptor {
    const props: Record<string, { description: string, type: import('./types').ValueType }> = {}
    for (const [name, prop] of this.properties) {
      props[name] = prop.getDescriptor()
    }

    const meths: Record<string, { description: string, parameters: Record<string, { description: string, type: import('./types').ValueType }> }> = {}
    for (const [name, method] of this.methods) {
      meths[name] = method.getDescriptor()
    }

    return {
      name: this.name,
      description: this.description,
      properties: props,
      methods: meths,
    }
  }

  /**
   * 获取设备状态
   */
  async getState(): Promise<ThingState> {
    const state: Record<string, unknown> = {}

    for (const [name, prop] of this.properties) {
      state[name] = await prop.getValue()
    }

    return {
      name: this.name,
      state,
    }
  }

  /**
   * 调用方法
   */
  async invoke(command: IoTCommand): Promise<unknown> {
    const methodName = command.method
    const method = this.methods.get(methodName)

    if (!method) {
      throw new Error(`方法不存在: ${methodName}`)
    }

    return await method.invoke(command.parameters || {})
  }
}
