import { createHash, createHmac, randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { machineId } from 'node-machine-id'
import { DatabaseManager } from './database'

interface DeviceFingerprint {
  system: string
  hostname: string
  mac_address: string | null
  machine_id: string
}

/**
 * 设备指纹管理器 (SQLite 版本) - 单例模式
 * 用于生成和管理设备唯一标识
 */
export class DeviceFingerprintManager {
  private static instance: DeviceFingerprintManager | null = null
  private db: DatabaseManager
  private deviceCache: any = null

  private constructor() {
    this.db = DatabaseManager.getInstance()
  }

  /**
   * 初始化（异步）
   */
  private async initialize(): Promise<void> {
    console.log('[DeviceFingerprint] 开始初始化...')
    await this.ensureDeviceInfo()
    console.log('[DeviceFingerprint] 初始化完成')
  }

  static async getInstanceAsync(): Promise<DeviceFingerprintManager> {
    if (!DeviceFingerprintManager.instance) {
      const instance = new DeviceFingerprintManager()
      await instance.initialize()
      DeviceFingerprintManager.instance = instance
    }
    else {
      // 实例存在但可能未初始化，强制初始化
      if (!DeviceFingerprintManager.instance.deviceCache) {
        await DeviceFingerprintManager.instance.initialize()
      }
    }
    return DeviceFingerprintManager.instance
  }

  static getInstance(): DeviceFingerprintManager {
    if (!DeviceFingerprintManager.instance) {
      DeviceFingerprintManager.instance = new DeviceFingerprintManager()
    }
    return DeviceFingerprintManager.instance
  }

  /**
   * 获取设备主机名
   */
  private getHostname(): string {
    return require('node:os').hostname()
  }

  /**
   * 标准化 MAC 地址为小写冒号分隔格式
   */
  private normalizeMacAddress(mac: string): string {
    if (!mac)
      return mac

    // 移除所有非字母数字字符
    const cleanMac = mac.replace(/[^a-fA-F0-9]/g, '')

    // 确保长度为 12
    if (cleanMac.length !== 12) {
      return mac.toLowerCase()
    }

    // 格式化为 xx:xx:xx:xx:xx:xx
    const formatted = cleanMac.match(/.{2}/g)?.join(':') || mac
    return formatted.toLowerCase()
  }

  /**
   * 获取主要网卡的 MAC 地址
   */
  private getMacAddress(): string | null {
    try {
      const nets = networkInterfaces()

      // 优先选择非回环、已启用的网络接口
      for (const name of Object.keys(nets)) {
        const netInfo = nets[name]
        if (!netInfo)
          continue

        // 跳过回环接口
        if (name.toLowerCase().includes('loopback') || name.toLowerCase().includes('lo'))
          continue

        for (const net of netInfo) {
          // 查找 IPv4 且非内部的网络接口
          const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
          if (net.family === familyV4Value && !net.internal && net.mac) {
            const mac = net.mac
            // 过滤无效的 MAC 地址
            if (mac && mac !== '00:00:00:00:00:00') {
              const normalized = this.normalizeMacAddress(mac)
              console.log(`  • 找到 MAC 地址: ${normalized} (${name})`)
              return normalized
            }
          }
        }
      }

      // 如果没有找到，尝试获取任何可用的非回环 MAC 地址
      for (const name of Object.keys(nets)) {
        const netInfo = nets[name]
        if (!netInfo)
          continue

        if (name.toLowerCase().includes('loopback') || name.toLowerCase().includes('lo'))
          continue

        for (const net of netInfo) {
          if (net.mac && net.mac !== '00:00:00:00:00:00') {
            const normalized = this.normalizeMacAddress(net.mac)
            console.log(`  • 找到备用 MAC: ${normalized} (${name})`)
            return normalized
          }
        }
      }

      console.warn('[DeviceFingerprint] 未找到有效的 MAC 地址')
      return null
    }
    catch (error) {
      console.error('[DeviceFingerprint] 获取 MAC 地址失败:', error)
      return null
    }
  }

  /**
   * 获取机器 ID
   */
  private async getMachineId(): Promise<string> {
    try {
      return await machineId()
    }
    catch (error) {
      console.error('获取机器 ID 失败:', error)
      // 备用方案：生成一个随机 ID
      return randomBytes(16).toString('hex')
    }
  }

  /**
   * 生成设备指纹
   */
  private async generateFingerprint(): Promise<DeviceFingerprint> {
    return {
      system: process.platform,
      hostname: this.getHostname(),
      mac_address: this.getMacAddress(),
      machine_id: await this.getMachineId(),
    }
  }

  /**
   * 生成硬件哈希值（用作 HMAC 密钥）
   */
  private async generateHardwareHash(fingerprint?: DeviceFingerprint): Promise<string> {
    const fp = fingerprint || await this.generateFingerprint()

    const identifiers: string[] = []

    if (fp.hostname)
      identifiers.push(fp.hostname)
    if (fp.mac_address)
      identifiers.push(fp.mac_address)
    if (fp.machine_id)
      identifiers.push(fp.machine_id)

    // 如果没有任何标识符，使用系统信息作为备用
    if (identifiers.length === 0) {
      identifiers.push(fp.system)
    }

    const fingerprintStr = identifiers.join('||')
    return createHash('sha256').update(fingerprintStr).digest('hex')
  }

  /**
   * 生成设备序列号
   */
  private async generateSerialNumber(fingerprint?: DeviceFingerprint): Promise<string> {
    const fp = fingerprint || await this.generateFingerprint()

    // 优先使用 MAC 地址
    if (fp.mac_address) {
      const macClean = fp.mac_address.toLowerCase().replace(/:/g, '')
      const shortHash = createHash('md5').update(macClean).digest('hex').substring(0, 8).toUpperCase()
      return `SN-${shortHash}-${macClean}`
    }

    // 备用方案：使用机器 ID 或主机名
    const identifier = fp.machine_id || fp.hostname || 'unknown'
    const shortHash = createHash('md5').update(identifier).digest('hex').substring(0, 8).toUpperCase()
    return `SN-${shortHash}-${identifier.substring(0, 12).toUpperCase()}`
  }

  /**
   * 确保设备信息存在
   */
  private async ensureDeviceInfo(): Promise<void> {
    // 尝试从数据库获取
    let deviceInfo = this.db.getDeviceInfo()

    if (!deviceInfo) {
      console.log('[DeviceFingerprint] 创建新设备身份...')
      const fingerprint = await this.generateFingerprint()

      const serialNumber = await this.generateSerialNumber(fingerprint)
      const hmacKey = await this.generateHardwareHash(fingerprint)

      deviceInfo = this.db.getOrCreateDeviceInfo({
        mac_address: fingerprint.mac_address || '',
        serial_number: serialNumber,
        hmac_key: hmacKey,
        machine_id: fingerprint.machine_id,
        hostname: fingerprint.hostname,
        system: fingerprint.system,
      })

      console.log('[DeviceFingerprint] 设备身份已创建')
    }

    this.deviceCache = deviceInfo
  }

  /**
   * 确保设备身份信息已加载
   * @returns [序列号, HMAC密钥, 激活状态]
   */
  ensureDeviceIdentity(): [string, string, boolean] {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    if (!deviceInfo) {
      throw new Error('设备信息未初始化')
    }

    return [
      deviceInfo.serial_number,
      deviceInfo.hmac_key,
      deviceInfo.activation_status === 1,
    ]
  }

  /**
   * 获取序列号
   */
  getSerialNumber(): string {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    return deviceInfo?.serial_number || ''
  }

  /**
   * 获取 HMAC 密钥
   */
  getHmacKey(): string {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    return deviceInfo?.hmac_key || ''
  }

  /**
   * 获取 MAC 地址
   */
  getMacAddressFromEfuse(): string | null {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    return deviceInfo?.mac_address || null
  }

  /**
   * 获取激活状态
   */
  isActivated(): boolean {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    return deviceInfo ? deviceInfo.activation_status === 1 : false
  }

  /**
   * 设置激活状态
   */
  setActivationStatus(status: boolean): boolean {
    try {
      const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
      if (!deviceInfo) {
        console.error('[DeviceFingerprint] 设备信息不存在，无法设置激活状态')
        return false
      }

      this.db.setActivationStatus(deviceInfo.serial_number, status)

      // 更新缓存
      if (this.deviceCache) {
        this.deviceCache.activation_status = status ? 1 : 0
      }

      console.log(`[DeviceFingerprint] 激活状态已更新: ${status ? '已激活' : '未激活'}`)
      return true
    }
    catch (error) {
      console.error('[DeviceFingerprint] 设置激活状态失败:', error)
      return false
    }
  }

  /**
   * 生成 HMAC 签名
   */
  generateHmacSignature(challenge: string): string {
    const hmacKey = this.getHmacKey()
    if (!hmacKey) {
      throw new Error('未找到 HMAC 密钥')
    }
    return createHmac('sha256', hmacKey).update(challenge).digest('hex')
  }

  /**
   * 获取完整的设备信息
   */
  getDeviceInfo() {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    if (!deviceInfo) {
      return {
        serialNumber: '',
        macAddress: '',
        activationStatus: false,
        deviceFingerprint: {
          system: process.platform,
          hostname: '',
          mac_address: '',
          machine_id: '',
        },
      }
    }

    return {
      serialNumber: deviceInfo.serial_number,
      macAddress: deviceInfo.mac_address,
      activationStatus: deviceInfo.activation_status === 1,
      deviceFingerprint: {
        system: deviceInfo.system,
        hostname: deviceInfo.hostname,
        mac_address: deviceInfo.mac_address,
        machine_id: deviceInfo.machine_id,
      },
    }
  }
}
