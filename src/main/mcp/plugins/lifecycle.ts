import type { McpPluginDispose } from './types'

/** Tracks one plugin generation. Cancellation is cooperative for in-process code. */
export class McpPluginLifecycle {
  readonly controller = new AbortController()
  private disposers = new Set<McpPluginDispose>()
  private disposedResources = new Map<McpPluginDispose, Promise<void>>()
  private disposal: Promise<void> | null = null
  private registering = true

  assertActive(): void {
    this.controller.signal.throwIfAborted()
  }

  assertRegistering(): void {
    this.assertActive()
    if (!this.registering)
      throw new Error('插件注册阶段已结束')
  }

  finishRegistration(): void {
    this.registering = false
  }

  onDispose(dispose: McpPluginDispose): void {
    this.assertActive()
    this.disposers.add(dispose)
  }

  disposeResource(dispose: McpPluginDispose): Promise<void> {
    const existing = this.disposedResources.get(dispose)
    if (existing)
      return existing
    const result = Promise.resolve().then(dispose)
    this.disposedResources.set(dispose, result)
    return result
  }

  dispose(timeoutMs = 3000): Promise<void> {
    if (this.disposal)
      return this.disposal
    this.registering = false
    this.controller.abort(new Error('插件已卸载或加载失败'))
    this.disposal = runWithDeadline(
      async () => {
        const results = await Promise.allSettled(
          Array.from(this.disposers).reverse().map(dispose => this.disposeResource(dispose)),
        )
        this.disposers.clear()
        const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (errors.length)
          throw new AggregateError(errors.map(result => result.reason), '插件资源清理失败')
      },
      timeoutMs,
      '插件资源清理超时',
    )
    return this.disposal
  }
}

export async function runWithDeadline<T>(
  work: () => T | Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}
