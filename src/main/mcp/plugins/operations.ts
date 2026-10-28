/** Serialize plugin filesystem, configuration and runtime mutations as one operation. */
let pending: Promise<unknown> = Promise.resolve()

export function runMcpPluginOperation<T>(operation: () => T | Promise<T>): Promise<T> {
  const result = pending.then(operation)
  pending = result.catch(() => {})
  return result
}
