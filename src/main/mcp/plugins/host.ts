/**
 * McpHost 实现 — 插件 register(host) 的稳定契约
 *
 * 插件禁止依赖 getServiceContainer / 应用内部实现细节。
 * host.get 仅暴露白名单键（默认 logger、config_readonly；
 * media_player / subtitle 需配置显式加入）。
 */

import type { McpTool, Property, ToolCallback } from '../types'
import type { McpHost, McpHostGetKey, PropDef, ToolDefLike } from './types'
import { isMcpHostCapability } from '../../../shared/mcpCapabilities'
import { getConfigManager } from '../../services/configManagerDB'
import { getLogger } from '../../utils/logger'
import { PropertyList, PropertyType } from '../types'
import { McpPluginLifecycle } from './lifecycle'

const baseLogger = getLogger('McpHost')

export interface McpHostOptions {
  pluginId: string
  lifecycle?: McpPluginLifecycle
  allowHostGet: McpHostGetKey[]
  /** 强制前缀（可选） */
  toolNamePrefix?: string
  enforcePrefix: boolean
  /** 调用超时（毫秒），包装 callback */
  callTimeoutMs: number
  /** 注册工具到 McpServer */
  onAddTool: (tool: McpTool) => void
  /**
   * 额外 Host 能力（如 media_player / subtitle facade）。
   * get 时：白名单通过后优先查本表；logger / config_readonly 仍由内建提供。
   */
  capabilities?: Record<string, unknown>
}

function propDefsToPropertyList(props?: PropDef[]): PropertyList {
  if (!props || props.length === 0) {
    return new PropertyList([])
  }
  const mapped: Property[] = props.map((p) => {
    let type: PropertyType
    switch (p.type) {
      case 'boolean':
        type = PropertyType.BOOLEAN
        break
      case 'integer':
        type = PropertyType.INTEGER
        break
      case 'number':
        type = PropertyType.NUMBER
        break
      default:
        type = PropertyType.STRING
    }
    return {
      name: p.name,
      type,
      defaultValue: p.defaultValue,
      minValue: p.minValue,
      maxValue: p.maxValue,
    }
  })
  return new PropertyList(mapped)
}

function isPropertyList(value: unknown): value is PropertyList {
  return (
    value instanceof PropertyList
    || (typeof value === 'object'
      && value !== null
      && !Array.isArray(value)
      && typeof (value as PropertyList).parseArguments === 'function'
      && typeof (value as PropertyList).toJson === 'function')
  )
}

function ensurePropertyList(properties?: PropertyList | PropDef[]): PropertyList {
  if (!properties) {
    return new PropertyList([])
  }
  if (isPropertyList(properties)) {
    return properties
  }
  return propDefsToPropertyList(properties)
}

/**
 * 为工具 callback 包一层超时
 */
function withTimeout(
  callback: ToolCallback,
  timeoutMs: number,
  toolName: string,
  lifecycle: McpPluginLifecycle,
): ToolCallback {
  return async (args) => {
    lifecycle.assertActive()
    const controller = new AbortController()
    const parent = lifecycle.controller.signal
    const abort = () => controller.abort(parent.reason)
    parent.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(
      () => controller.abort(new Error(`工具调用超时 (${timeoutMs}ms): ${toolName}`)),
      timeoutMs,
    )
    let rejectAbort: () => void = () => {}
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', rejectAbort, { once: true })
    })
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          controller.signal.throwIfAborted()
          return callback(args, controller.signal)
        }),
        cancelled,
      ])
    }
    finally {
      clearTimeout(timer)
      parent.removeEventListener('abort', abort)
      controller.signal.removeEventListener('abort', rejectAbort)
    }
  }
}

/**
 * 只读配置切片（脱敏，不含密钥）
 */
function getConfigReadonlySlice(): Record<string, unknown> {
  try {
    const cm = getConfigManager()
    const all = cm.getAll()
    return {
      ota_version_url: all.ota_version_url ?? all.OTA_VERSION_URL ?? null,
      authorization_url: all.authorization_url ?? all.AUTHORIZATION_URL ?? null,
      activation_version: all.activation_version ?? all.ACTIVATION_VERSION ?? null,
      // 不暴露 token / password / hmac
    }
  }
  catch {
    return {}
  }
}

export function createMcpHost(options: McpHostOptions): McpHost {
  const {
    pluginId,
    allowHostGet,
    toolNamePrefix,
    enforcePrefix,
    callTimeoutMs,
    onAddTool,
    capabilities = {},
    lifecycle = new McpPluginLifecycle(),
  } = options

  const pluginLogger = {
    info: (msg: string, meta?: unknown) => baseLogger.info(`[${pluginId}] ${msg}`, meta),
    warn: (msg: string, meta?: unknown) => baseLogger.warn(`[${pluginId}] ${msg}`, meta),
    error: (msg: string, err?: unknown, meta?: unknown) =>
      baseLogger.error(`[${pluginId}] ${msg}`, err, meta),
    debug: (msg: string, meta?: unknown) => baseLogger.debug(`[${pluginId}] ${msg}`, meta),
  }

  function resolveToolName(name: string): string {
    if (!enforcePrefix || !toolNamePrefix)
      return name
    if (name.startsWith(toolNamePrefix))
      return name
    return `${toolNamePrefix}${name}`
  }

  function registerTool(tool: McpTool | ToolDefLike): void {
    lifecycle.assertRegistering()
    if (
      !tool
      || typeof tool !== 'object'
      || typeof tool.name !== 'string'
      || typeof tool.callback !== 'function'
    ) {
      throw new Error('无效的工具定义')
    }

    const name = resolveToolName(tool.name)
    const properties = ensurePropertyList(
      (tool as ToolDefLike).properties as PropertyList | PropDef[] | undefined,
    )

    const mcpTool: McpTool = {
      name,
      description: tool.description || '',
      properties,
      callback: withTimeout(tool.callback, callTimeoutMs, name, lifecycle),
    }

    onAddTool(mcpTool)
  }

  const host: McpHost = {
    pluginId,
    signal: lifecycle.controller.signal,
    onDispose: dispose => lifecycle.onDispose(dispose),

    addTool(tool: McpTool | ToolDefLike): void {
      registerTool(tool)
    },

    tool(name: string, description: string, props?: PropDef[]) {
      return (fn: ToolCallback) => {
        registerTool({
          name,
          description,
          properties: propDefsToPropertyList(props),
          callback: fn,
        })
      }
    },

    get(name: string): unknown {
      lifecycle.assertActive()
      if (!isMcpHostCapability(name) || !allowHostGet.includes(name)) {
        pluginLogger.warn(`host.get 拒绝非白名单键: ${name}`)
        return undefined
      }
      switch (name) {
        case 'logger':
          return pluginLogger
        case 'config_readonly':
          return getConfigReadonlySlice()
        default:
          // media_player / subtitle 等由 capabilities 注入
          if (Object.prototype.hasOwnProperty.call(capabilities, name)) {
            const capability = capabilities[name]
            // Cached SDK handles must become unusable after unload, too.
            if (capability && typeof capability === 'object') {
              return new Proxy(capability, {
                get(target, key) {
                  lifecycle.assertActive()
                  const value = Reflect.get(target, key)
                  return typeof value === 'function'
                    ? (...args: unknown[]) => {
                        lifecycle.assertActive()
                        return value.apply(target, args)
                      }
                    : value
                },
              })
            }
            return capability
          }
          return undefined
      }
    },
  }

  return host
}
