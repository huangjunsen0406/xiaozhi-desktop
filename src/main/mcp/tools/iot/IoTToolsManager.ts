import type { PropertyList, PropertyType } from '../../types'
import { ThingManager } from '../../../iot'

/**
 * IoT 工具管理器
 * 负责注册 IoT 相关的 MCP 工具
 */
export class IoTToolsManager {
  private static instance: IoTToolsManager | null = null
  private thingManager: ThingManager

  private constructor() {
    console.log('[IoTToolsManager] IoT 工具管理器初始化')
    this.thingManager = ThingManager.getInstance()
  }

  static getInstance(): IoTToolsManager {
    if (!IoTToolsManager.instance) {
      IoTToolsManager.instance = new IoTToolsManager()
    }
    return IoTToolsManager.instance
  }

  /**
   * 初始化并注册所有 IoT 工具
   */
  async init(
    addTool: (
      name: string,
      description: string,
      properties: PropertyList,
      callback: (args: Record<string, unknown>) => Promise<string>,
    ) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): Promise<void> {
    try {
      console.log('[IoTToolsManager] 开始注册 IoT 工具')

      // 初始化设备
      await this.thingManager.initialize()

      // 注册工具
      this.registerGetDevices(addTool, PropertyListClass, PropertyTypeEnum)
      this.registerGetDeviceState(addTool, PropertyListClass, PropertyTypeEnum)
      this.registerInvokeDeviceMethod(addTool, PropertyListClass, PropertyTypeEnum)

      console.log('[IoTToolsManager] IoT 工具注册完成')
    }
    catch (error) {
      console.error('[IoTToolsManager] IoT 工具注册失败:', error)
      throw error
    }
  }

  /**
   * 注册获取设备列表工具
   */
  private registerGetDevices(
    addTool: (
      name: string,
      description: string,
      properties: PropertyList,
      callback: (args: Record<string, unknown>) => Promise<string>,
    ) => void,
    PropertyListClass: typeof PropertyList,
    _PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([])

    addTool(
      'self.iot.get_devices',
      `获取所有 IoT 设备的描述信息

返回所有已注册的 IoT 设备的详细信息，包括:
- 设备名称和描述
- 设备属性（如灯的开关状态）
- 设备方法（如打开灯、关闭灯）

示例返回:
[
  {
    "name": "Lamp",
    "description": "一个测试用的灯",
    "properties": {
      "power": {
        "description": "灯是否打开",
        "type": "boolean"
      }
    },
    "methods": {
      "TurnOn": {
        "description": "打开灯",
        "parameters": {}
      },
      "TurnOff": {
        "description": "关闭灯",
        "parameters": {}
      }
    }
  }
]`,
      props,
      async () => {
        try {
          const descriptorsJson = await this.thingManager.getDescriptorsJson()
          return descriptorsJson
        }
        catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('[IoTToolsManager] 获取设备列表失败:', errorMsg)
          return JSON.stringify({ error: errorMsg })
        }
      },
    )
  }

  /**
   * 注册获取设备状态工具
   */
  private registerGetDeviceState(
    addTool: (
      name: string,
      description: string,
      properties: PropertyList,
      callback: (args: Record<string, unknown>) => Promise<string>,
    ) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([
      {
        name: 'device_name',
        type: PropertyTypeEnum.STRING,
      },
    ])

    addTool(
      'self.iot.get_device_state',
      `获取指定 IoT 设备的当前状态

参数:
- device_name: 设备名称（如 "Lamp"）

返回指定设备的当前状态，包括所有属性的当前值。

示例:
输入: { "device_name": "Lamp" }
输出: {
  "name": "Lamp",
  "state": {
    "power": false
  }
}`,
      props,
      async (args) => {
        try {
          const deviceName = args.device_name as string

          // 获取所有设备状态
          const { states } = await this.thingManager.getStates(false)

          // 查找指定设备
          const deviceState = states.find(s => s.name === deviceName)

          if (!deviceState) {
            return JSON.stringify({ error: `设备不存在: ${deviceName}` })
          }

          return JSON.stringify(deviceState)
        }
        catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('[IoTToolsManager] 获取设备状态失败:', errorMsg)
          return JSON.stringify({ error: errorMsg })
        }
      },
    )
  }

  /**
   * 注册调用设备方法工具
   */
  private registerInvokeDeviceMethod(
    addTool: (
      name: string,
      description: string,
      properties: PropertyList,
      callback: (args: Record<string, unknown>) => Promise<string>,
    ) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([
      {
        name: 'device_name',
        type: PropertyTypeEnum.STRING,
      },
      {
        name: 'method',
        type: PropertyTypeEnum.STRING,
      },
      {
        name: 'parameters',
        type: PropertyTypeEnum.STRING,
        defaultValue: '{}',
      },
    ])

    addTool(
      'self.iot.invoke_method',
      `调用 IoT 设备的方法

参数:
- device_name: 设备名称（如 "Lamp"）
- method: 方法名称（如 "TurnOn", "TurnOff"）
- parameters: 方法参数（JSON 字符串格式，默认为 "{}"）

用于控制 IoT 设备，执行设备支持的各种操作。

示例:
1. 打开灯:
   输入: {
     "device_name": "Lamp",
     "method": "TurnOn",
     "parameters": "{}"
   }
   输出: {
     "status": "success",
     "message": "灯已打开"
   }

2. 关闭灯:
   输入: {
     "device_name": "Lamp",
     "method": "TurnOff",
     "parameters": "{}"
   }
   输出: {
     "status": "success",
     "message": "灯已关闭"
   }`,
      props,
      async (args) => {
        try {
          const deviceName = args.device_name as string
          const method = args.method as string
          const parametersStr = (args.parameters as string) || '{}'

          // 解析参数
          let parameters: Record<string, unknown> = {}
          try {
            parameters = JSON.parse(parametersStr)
          }
          catch (parseError) {
            const parseErrorMsg = parseError instanceof Error ? parseError.message : String(parseError)
            return JSON.stringify({ error: `参数格式错误，必须是有效的 JSON 字符串: ${parseErrorMsg}` })
          }

          // 调用设备方法
          const result = await this.thingManager.invoke({
            name: deviceName,
            method,
            parameters,
          })

          return JSON.stringify(result)
        }
        catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('[IoTToolsManager] 调用设备方法失败:', errorMsg)
          return JSON.stringify({ error: errorMsg })
        }
      },
    )
  }
}
