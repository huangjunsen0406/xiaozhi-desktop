/**
 * IoT 设备类型定义
 */

/** 值类型枚举 */
export enum ValueType {
  BOOLEAN = 'boolean',
  NUMBER = 'number',
  STRING = 'string',
  FLOAT = 'float',
  ARRAY = 'array',
  OBJECT = 'object',
}

/** 属性 Getter 函数类型 */
export type PropertyGetter<T = unknown> = () => Promise<T> | T

/** 参数定义 */
export interface ParameterDef {
  name: string
  description: string
  type: ValueType
  required?: boolean
}

/** 方法回调函数类型 */
export type MethodCallback = (params: Record<string, unknown>) => Promise<unknown>

/** 设备描述符 */
export interface ThingDescriptor {
  name: string
  description: string
  properties: Record<string, PropertyDescriptor>
  methods: Record<string, MethodDescriptor>
}

/** 属性描述符 */
export interface PropertyDescriptor {
  description: string
  type: ValueType
}

/** 方法描述符 */
export interface MethodDescriptor {
  description: string
  parameters: Record<string, ParameterDescriptor>
}

/** 参数描述符 */
export interface ParameterDescriptor {
  description: string
  type: ValueType
}

/** 设备状态 */
export interface ThingState {
  name: string
  state: Record<string, unknown>
}

/** IoT 命令 */
export interface IoTCommand {
  name: string // 设备名称
  method: string // 方法名称
  parameters?: Record<string, unknown> // 参数
}
