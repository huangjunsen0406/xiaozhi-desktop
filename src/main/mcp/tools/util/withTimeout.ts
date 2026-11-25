/**
 * 给 Promise 包一层超时保护，超时后抛 TimeoutError（或自定义 Error）。
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
  labelOrError: string | (() => Error) = 'operation',
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = typeof labelOrError === 'function'
            ? labelOrError()
            : new TimeoutError(`${labelOrError} timed out after ${ms}ms`)
          reject(err)
        }, ms)
      }),
    ])
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}
