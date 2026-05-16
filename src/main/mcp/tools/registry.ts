/**
 * MCP 工具注册表
 * 提供函数式的工具注册机制，工具通过 defineTool() 注册到全局注册表
 */

import type { PropertyList, ToolCallback } from '../types'

/** 工具定义 */
export interface ToolDef {
  name: string
  description: string
  properties: PropertyList
  callback: ToolCallback
}

const _registry: ToolDef[] = []

/**
 * 注册一个工具到全局注册表
 */
export function defineTool(def: ToolDef): void {
  _registry.push(def)
}

/**
 * 获取所有已注册的工具
 */
export function getAllTools(): ToolDef[] {
  return _registry
}

/**
 * 清空注册表（用于测试）
 */
export function clearRegistry(): void {
  _registry.length = 0
}
