export type AudioCommand = 'initialize' | 'switchDevices' | 'updateConfig' | 'reinitialize' | 'cleanup' | 'suspend' | 'recover'

/** Serialize resource changes; sleep discards changes that recovery will reload. */
export class AudioCommandQueue {
  private commands: AudioCommand[] = []
  private processing = false
  private sleeping = false
  private closed = false

  constructor(
    private readonly execute: (command: AudioCommand) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  enqueue(command: AudioCommand): void {
    if (this.closed)
      return
    if (command === 'cleanup') {
      this.closed = true
      this.commands = [command]
    }
    else if (command === 'suspend') {
      this.sleeping = true
      this.commands = [command]
    }
    else if (command === 'recover') {
      this.sleeping = false
      if (!this.commands.includes(command))
        this.commands.push(command)
    }
    else if (!this.sleeping) {
      if (!this.commands.includes(command))
        this.commands.push(command)
    }
    void this.process()
  }

  private async process(): Promise<void> {
    if (this.processing)
      return
    this.processing = true
    try {
      while (this.commands.length) {
        const command = this.commands.shift()!
        try {
          await this.execute(command)
        }
        catch (error) {
          this.onError(error)
        }
      }
    }
    finally {
      this.processing = false
    }
  }
}
