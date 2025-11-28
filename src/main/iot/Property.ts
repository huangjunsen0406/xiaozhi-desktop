import type { PropertyDescriptor, PropertyGetter, ValueType } from './types'

/**
 * 设备属性
 */
export class Property<T = unknown> {
  name: string
  description: string
  private getter: PropertyGetter<T>
  private _type: ValueType
  private _typeDetermined = false

  constructor(name: string, description: string, getter: PropertyGetter<T>) {
    this.name = name
    this.description = description
    this.getter = getter
    this._type = 'string' as ValueType // 默认类型
  }

  /**
   * 根据值确定属性类型
   */
  private determineType(value: unknown): ValueType {
    if (typeof value === 'boolean')
      return 'boolean' as ValueType
    if (typeof value === 'number') {
      return Number.isInteger(value) ? ('number' as ValueType) : ('float' as ValueType)
    }
    if (typeof value === 'string')
      return 'string' as ValueType
    if (Array.isArray(value))
      return 'array' as ValueType
    if (typeof value === 'object' && value !== null)
      return 'object' as ValueType
    throw new TypeError(`不支持的属性类型: ${typeof value}`)
  }

  /**
   * 获取属性描述符
   */
  getDescriptor(): PropertyDescriptor {
    return {
      description: this.description,
      type: this._type,
    }
  }

  /**
   * 获取属性值
   */
  async getValue(): Promise<T> {
    const value = await Promise.resolve(this.getter())

    // 如果是第一次调用 getter，确定类型
    if (!this._typeDetermined) {
      this._type = this.determineType(value)
      this._typeDetermined = true
    }

    return value
  }
}
