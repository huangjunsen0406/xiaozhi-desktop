import axios, { AxiosError } from 'axios'
import { DeviceFingerprintManager } from './deviceFingerprintDB'
import { getConfigManager } from './configManagerDB'

interface ActivationData {
  challenge: string
  code: string
  message?: string
}

interface ActivationPayload {
  Payload: {
    algorithm: string
    serial_number: string
    challenge: string
    hmac: string
  }
}

/**
 * 设备激活管理器
 * 处理设备激活流程和轮询验证
 */
export class ActivationManager {
  private static instance: ActivationManager | null = null
  private deviceFingerprint: DeviceFingerprintManager
  private configManager: ReturnType<typeof getConfigManager>
  private isActivating = false
  private abortController: AbortController | null = null

  private constructor() {
    this.deviceFingerprint = DeviceFingerprintManager.getInstance()
    this.configManager = getConfigManager()
  }

  static getInstance(): ActivationManager {
    if (!ActivationManager.instance) {
      ActivationManager.instance = new ActivationManager()
    }
    return ActivationManager.instance
  }

  /**
   * 处理激活流程
   */
  async processActivation(activationData: ActivationData): Promise<boolean> {
    const { challenge, code } = activationData

    if (!challenge || !code) {
      console.error('[激活] 激活数据缺少必要字段')
      return false
    }

    console.log('[激活] 开始激活流程')
    console.log(`  • 验证码: ${code}`)
    console.log(`  • 挑战字符串: ${challenge}`)

    // 执行激活
    return await this.activate(challenge, code)
  }

  /**
   * 激活设备
   */
  async activate(challenge: string, _code: string): Promise<boolean> {
    try {
      this.isActivating = true
      this.abortController = new AbortController()

      const serialNumber = this.deviceFingerprint.getSerialNumber()
      if (!serialNumber) {
        console.error('[激活] 设备没有序列号，无法完成激活')
        return false
      }

      // 计算 HMAC 签名
      const hmacSignature = this.deviceFingerprint.generateHmacSignature(challenge)

      // 构建请求负载
      const payload: ActivationPayload = {
        Payload: {
          algorithm: 'hmac-sha256',
          serial_number: serialNumber,
          challenge,
          hmac: hmacSignature,
        },
      }

      // 获取激活 URL
      const otaUrl = this.configManager.getOtaVersionUrl()
      if (!otaUrl) {
        console.error('[激活] 未找到 OTA URL 配置')
        return false
      }

      const activateUrl = otaUrl.endsWith('/') ? `${otaUrl}activate` : `${otaUrl}/activate`
      console.log(`[激活] 激活端点: ${activateUrl}`)

      // 构建请求头
      const headers = {
        'Activation-Version': '2',
        'Device-Id': this.configManager.getDeviceId(),
        'Client-Id': this.configManager.getClientId(),
        'Content-Type': 'application/json',
      }

      console.log('[激活] 请求信息:')
      console.log(`  • 序列号: ${serialNumber}`)
      console.log(`  • 算法: hmac-sha256`)
      console.log(`  • HMAC: ${hmacSignature.substring(0, 16)}...`)

      // 重试逻辑
      const maxRetries = 60 // 最多 5 分钟
      const retryInterval = 5000 // 5 秒

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log(`[激活] 尝试激活 ${attempt + 1}/${maxRetries}...`)

          const response = await axios.post(activateUrl, payload, {
            headers,
            timeout: 10000,
            signal: this.abortController.signal,
          })

          // HTTP 200 - 激活成功
          if (response.status === 200) {
            console.log('[激活] 设备激活成功!')
            this.deviceFingerprint.setActivationStatus(true)
            return true
          }

          // HTTP 202 - 等待用户输入验证码
          if (response.status === 202) {
            console.log('[激活] 等待用户输入验证码...')
            await this.delay(retryInterval)
            continue
          }

          // 其他状态码 - 记录但继续重试
          console.warn(`[激活] 服务器返回状态码 ${response.status}，继续重试...`)
          await this.delay(retryInterval)
        }
        catch (error) {
          // 被取消
          if (axios.isCancel(error)) {
            console.log('[激活] 激活流程被取消')
            return false
          }

          // 网络错误或超时 - 继续重试
          if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError
            if (axiosError.response) {
              console.warn(`[激活] 服务器错误 (HTTP ${axiosError.response.status})`)
            }
            else if (axiosError.request) {
              console.warn('[激活] 网络请求失败，重试中...')
            }
            else {
              console.warn('[激活] 请求配置错误:', axiosError.message)
            }
          }
          else {
            console.error('[激活] 未知错误:', error)
          }

          await this.delay(retryInterval)
        }
      }

      // 达到最大重试次数
      console.error(`[激活] 激活失败，达到最大重试次数 (${maxRetries})`)
      return false
    }
    catch (error) {
      console.error('[激活] 激活过程中发生异常:', error)
      return false
    }
    finally {
      this.isActivating = false
      this.abortController = null
    }
  }

  /**
   * 取消激活流程
   */
  cancelActivation(): void {
    if (this.abortController) {
      console.log('[激活] 正在取消激活任务')
      this.abortController.abort()
      this.abortController = null
    }
    this.isActivating = false
  }

  /**
   * 检查是否正在激活
   */
  isActivatingNow(): boolean {
    return this.isActivating
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 获取设备激活状态
   */
  isActivated(): boolean {
    return this.deviceFingerprint.isActivated()
  }

  /**
   * 获取设备信息
   */
  getDeviceInfo() {
    return this.deviceFingerprint.getDeviceInfo()
  }
}
