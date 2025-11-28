import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'
import { ThingManager } from '../iot'

/**
 * IoT IPC 处理器
 * 提供前端与 IoT 设备交互的接口
 */
export class IoTIpc {
  private thingManager: ThingManager

  constructor() {
    this.thingManager = ThingManager.getInstance()
    this.registerHandlers()
  }

  private registerHandlers(): void {
    // 获取所有设备描述符
    ipcMain.handle('iot:get-devices', async (_event: IpcMainInvokeEvent) => {
      try {
        const descriptors = await this.thingManager.getDescriptors()
        return { success: true, data: descriptors }
      }
      catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[IoTIpc] 获取设备列表失败:', errorMsg)
        return { success: false, error: errorMsg }
      }
    })

    // 获取所有设备状态
    ipcMain.handle('iot:get-states', async (_event: IpcMainInvokeEvent) => {
      try {
        const { states } = await this.thingManager.getStates(false)
        return { success: true, data: states }
      }
      catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[IoTIpc] 获取设备状态失败:', errorMsg)
        return { success: false, error: errorMsg }
      }
    })

    // 获取指定设备状态
    ipcMain.handle(
      'iot:get-device-state',
      async (_event: IpcMainInvokeEvent, deviceName: string) => {
        try {
          const { states } = await this.thingManager.getStates(false)
          const deviceState = states.find(s => s.name === deviceName)

          if (!deviceState) {
            return { success: false, error: `设备不存在: ${deviceName}` }
          }

          return { success: true, data: deviceState }
        }
        catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('[IoTIpc] 获取设备状态失败:', errorMsg)
          return { success: false, error: errorMsg }
        }
      },
    )

    // 调用设备方法
    ipcMain.handle(
      'iot:invoke-method',
      async (
        _event: IpcMainInvokeEvent,
        deviceName: string,
        method: string,
        parameters?: Record<string, unknown>,
      ) => {
        try {
          const result = await this.thingManager.invoke({
            name: deviceName,
            method,
            parameters: parameters || {},
          })

          return { success: true, data: result }
        }
        catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('[IoTIpc] 调用设备方法失败:', errorMsg)
          return { success: false, error: errorMsg }
        }
      },
    )

    console.log('[IoTIpc] IPC 处理器注册完成')
  }
}
