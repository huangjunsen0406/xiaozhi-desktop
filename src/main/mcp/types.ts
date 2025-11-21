/**
 * MCP 类型定义
 * 参考 MCP 规范: https://modelcontextprotocol.io/specification/2024-11-05
 */

/** 属性类型枚举 */
export enum PropertyType {
  BOOLEAN = 'boolean',
  INTEGER = 'integer',
  STRING = 'string',
}

/** 工具参数定义 */
export interface Property {
  name: string
  type: PropertyType
  defaultValue?: unknown
  minValue?: number
  maxValue?: number
}

/** 参数列表 */
export class PropertyList {
  properties: Property[]

  constructor(properties: Property[] = []) {
    this.properties = properties
  }

  /** 获取必需参数列表 */
  getRequired(): string[] {
    return this.properties
      .filter((p) => p.defaultValue === undefined)
      .map((p) => p.name)
  }

  /** 转换为 JSON Schema */
  toJson(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const prop of this.properties) {
      const schema: Record<string, unknown> = { type: prop.type }
      if (prop.defaultValue !== undefined) {
        schema.default = prop.defaultValue
      }
      if (prop.type === PropertyType.INTEGER) {
        if (prop.minValue !== undefined) schema.minimum = prop.minValue
        if (prop.maxValue !== undefined) schema.maximum = prop.maxValue
      }
      result[prop.name] = schema
    }
    return result
  }

  /** 解析并验证参数 */
  parseArguments(args?: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const prop of this.properties) {
      if (args && prop.name in args) {
        const value = args[prop.name]
        // 类型校验
        if (prop.type === PropertyType.BOOLEAN && typeof value === 'boolean') {
          result[prop.name] = value
        }
        else if (prop.type === PropertyType.INTEGER && typeof value === 'number') {
          // 范围校验
          if (prop.minValue !== undefined && value < prop.minValue) {
            throw new Error(`Value ${value} is below minimum ${prop.minValue}`)
          }
          if (prop.maxValue !== undefined && value > prop.maxValue) {
            throw new Error(`Value ${value} exceeds maximum ${prop.maxValue}`)
          }
          result[prop.name] = Math.floor(value)
        }
        else if (prop.type === PropertyType.STRING && typeof value === 'string') {
          result[prop.name] = value
        }
        else {
          throw new Error(`Invalid type for property ${prop.name}`)
        }
      }
      else if (prop.defaultValue !== undefined) {
        result[prop.name] = prop.defaultValue
      }
      else {
        throw new Error(`Missing required argument: ${prop.name}`)
      }
    }

    return result
  }
}

/** 工具回调函数类型 */
export type ToolCallback = (args: Record<string, unknown>) => Promise<string> | string

/** MCP 工具定义 */
export interface McpTool {
  name: string
  description: string
  properties: PropertyList
  callback: ToolCallback
}

/** MCP 工具 JSON 格式 */
export interface McpToolJson {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required: string[]
  }
}

/** JSONRPC 2.0 请求 */
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

/** JSONRPC 2.0 响应 */
export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/** MCP 工具调用结果 */
export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError: boolean
}
