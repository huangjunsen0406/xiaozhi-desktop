import type { ParameterDescriptor, ValueType } from './types'

/**
 * 方法参数
 */
export class Parameter {
  name: string
  description: string
  type: ValueType
  required: boolean
  private value?: unknown

  constructor(name: string, description: string, type: ValueType, required = true) {
    this.name = name
    this.description = description
    this.type = type
    this.required = required
  }

  /**
   * 获取参数描述符
   */
  getDescriptor(): ParameterDescriptor {
    return {
      description: this.description,
      type: this.type,
    }
  }

  /**
   * 设置参数值
   */
  setValue(value: unknown): void {
    this.value = value
  }

  /**
   * 获取参数值
   */
  getValue(): unknown {
    return this.value
  }
}
