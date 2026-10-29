/** Small value readers for IPC boundaries; domain rules stay with each handler. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function parseObject(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value))
    throw new Error('参数必须是普通对象')
  return value
}

export function optionalString(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key]
  if (value === undefined)
    return undefined
  if (typeof value !== 'string')
    throw new Error(`${key} 必须是字符串`)
  return value
}

export function optionalBoolean(object: Record<string, unknown>, key: string): boolean | undefined {
  const value = object[key]
  if (value === undefined)
    return undefined
  if (typeof value !== 'boolean')
    throw new Error(`${key} 必须是布尔值`)
  return value
}

export function optionalNumber(
  object: Record<string, unknown>,
  key: string,
  limits: { min?: number, max?: number, integer?: boolean } = {},
): number | undefined {
  const value = object[key]
  if (value === undefined)
    return undefined
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${key} 必须是有限数字`)
  if (limits.integer && !Number.isInteger(value))
    throw new Error(`${key} 必须是整数`)
  if (limits.min !== undefined && value < limits.min)
    throw new Error(`${key} 不能小于 ${limits.min}`)
  if (limits.max !== undefined && value > limits.max)
    throw new Error(`${key} 不能大于 ${limits.max}`)
  return value
}
