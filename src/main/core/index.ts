/**
 * 核心基础设施模块 — 桶式导出
 *
 * 提供应用核心能力：事件总线、状态管理、任务管理、资源池、服务容器、接口契约。
 */

// 事件总线
export { EventBus, Events } from './EventBus'
export type { EventHandler } from './EventBus'

// 接口契约
export type { PluginCommands, PluginContext } from './interfaces'

// 资源池
export { ResourcePool } from './ResourcePool'

// 服务容器
export { ServiceContainer } from './ServiceContainer'
export type { ProtocolDelegate } from './ServiceContainer'

// 状态管理器
export { StateManager } from './StateManager'
export type { StateChangeData } from './StateManager'

// 任务管理器
export { TaskManager } from './TaskManager'
