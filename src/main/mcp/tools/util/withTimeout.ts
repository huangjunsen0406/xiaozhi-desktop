/**
 * 工具：给 Promise 包一个超时保护，超时后抛 TimeoutError
 *
 * 用于防止扫描类工具（如 scan_installed / list_running）因为系统问题或
 * 罕见网络驱动器永久挂死，阻塞 MCP 调用链。
 */

export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message)
    this.name = 'TimeoutError'
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new TimeoutError(`${label} timed out after ${ms}ms`)),
          ms,
        )
      }),
    ])
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}
