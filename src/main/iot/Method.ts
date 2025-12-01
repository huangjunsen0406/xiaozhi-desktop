import type { MethodCallback, MethodDescriptor, ParameterDef } from './types'
import { Parameter } from './Parameter'

/**
 * 设备方法
 */
export class Method {
  name: string
  description: string
  parameters: Map<string, Parameter>
  private callback: MethodCallback

  constructor(
    name: string,
    description: string,
    parameters: ParameterDef[],
    callback: MethodCallback,
  ) {
    this.name = name
    this.description = description
    this.callback = callback

    // 初始化参数
    this.parameters = new Map()
    for (const paramDef of parameters) {
      const param = new Parameter(
        paramDef.name,
        paramDef.description,
        paramDef.type,
        paramDef.required ?? true,
      )
      this.parameters.set(param.name, param)
    }
  }

  /**
   * 获取方法描述符
   */
  getDescriptor(): MethodDescriptor {
    const params: Record<string, { description: string, type: import('./types').ValueType }> = {}

    for (const [name, param] of this.parameters) {
      params[name] = param.getDescriptor()
    }

    return {
      description: this.description,
      parameters: params,
    }
  }

  /**
   * 调用方法
   */
  async invoke(params: Record<string, unknown>): Promise<unknown> {
    // 设置参数值
    for (const [name, value] of Object.entries(params)) {
      const param = this.parameters.get(name)
      if (param) {
        // 如果参数类型是 STRING，但值是 object 或 array，转换为 JSON 字符串
        if (param.type === 'string' && (typeof value === 'object' || Array.isArray(value))) {
          param.setValue(JSON.stringify(value))
        }
        else {
          param.setValue(value)
        }
      }
    }

    // 检查必需参数
    for (const [name, param] of this.parameters) {
      if (param.required && param.getValue() === undefined) {
        throw new Error(`缺少必需参数: ${name}`)
      }
    }

    // 转换参数 Map 为普通对象
    const paramsObj: Record<string, unknown> = {}
    for (const [name, param] of this.parameters) {
      const value = param.getValue()
      if (value !== undefined) {
        paramsObj[name] = value
      }
    }

    // 调用回调函数
    return await this.callback(paramsObj)
  }
}
