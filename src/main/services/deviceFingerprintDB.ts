import type { DbDeviceInfo } from '../types/database'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { hostname, networkInterfaces } from 'node:os'
import process from 'node:process'
import { machineId } from 'node-machine-id'
import { getLogger } from '../utils/logger'
import { DatabaseManager } from './database'

interface DeviceFingerprint {
  system: string
  hostname: string
  mac_address: string | null
  machine_id: string
}

export class DeviceFingerprintManager {
  private static instance: DeviceFingerprintManager | null = null
  private db: DatabaseManager
  private deviceCache: DbDeviceInfo | null = null
  private logger = getLogger('DeviceFingerprintDB') // 移到类内部

  private constructor() {
    this.db = DatabaseManager.getInstance()
  }

  private async initialize(): Promise<void> {
    this.logger.info('开始初始化...')
    await this.ensureDeviceInfo()
    this.logger.info('初始化完成')
  }

  static async getInstanceAsync(): Promise<DeviceFingerprintManager> {
    if (!DeviceFingerprintManager.instance) {
      const instance = new DeviceFingerprintManager()
      await instance.initialize()
      DeviceFingerprintManager.instance = instance
    }
    else {
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

  private getHostname(): string {
    return hostname()
  }

  private normalizeMacAddress(mac: string): string {
    if (!mac)
      return mac

    const cleanMac = mac.replace(/[^a-f0-9]/gi, '')

    if (cleanMac.length !== 12) {
      return mac.toLowerCase()
    }

    const formatted = cleanMac.match(/.{2}/g)?.join(':') || mac
    return formatted.toLowerCase()
  }

  private getMacAddress(): string | null {
    try {
      const nets = networkInterfaces()

      // 排除虚拟网卡的关键词
      const virtualAdapterPatterns = [
        /vpn/i,
        /virtual/i,
        /vethernet/i,
        /vmware/i,
        /virtualbox/i,
        /hyperv/i,
        /hyper-v/i,
        /wsl/i,
        /docker/i,
        /vbox/i,
        /tap/i,
        /tun/i,
      ]

      const isVirtualAdapter = (name: string): boolean => {
        return virtualAdapterPatterns.some(pattern => pattern.test(name))
      }

      // 第一轮: 查找物理网卡的 IPv4 地址
      for (const name of Object.keys(nets)) {
        const netInfo = nets[name]
        if (!netInfo)
          continue

        if (name.toLowerCase().includes('loopback') || name.toLowerCase().includes('lo'))
          continue

        // 跳过虚拟网卡
        if (isVirtualAdapter(name))
          continue

        for (const net of netInfo) {
          const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
          if (net.family === familyV4Value && !net.internal && net.mac) {
            const mac = net.mac
            if (mac && mac !== '00:00:00:00:00:00') {
              const normalized = this.normalizeMacAddress(mac)
              this.logger.info(`  • 找到物理 MAC 地址: ${normalized} (${name})`)
              return normalized
            }
          }
        }
      }

      // 第二轮: 查找任何非虚拟的网卡
      for (const name of Object.keys(nets)) {
        const netInfo = nets[name]
        if (!netInfo)
          continue

        if (name.toLowerCase().includes('loopback') || name.toLowerCase().includes('lo'))
          continue

        // 跳过虚拟网卡
        if (isVirtualAdapter(name))
          continue

        for (const net of netInfo) {
          if (net.mac && net.mac !== '00:00:00:00:00:00') {
            const normalized = this.normalizeMacAddress(net.mac)
            this.logger.info(`  • 找到备用 MAC: ${normalized} (${name})`)
            return normalized
          }
        }
      }

      this.logger.warn('未找到有效的物理 MAC 地址,将基于 machine-id 生成虚拟 MAC')
      return null
    }
    catch (error) {
      this.logger.error('获取 MAC 地址失败', error)
      return null
    }
  }

  private async getMachineId(): Promise<string> {
    try {
      return await machineId()
    }
    catch (error) {
      this.logger.error('获取机器 ID 失败:', error)
      return randomBytes(16).toString('hex')
    }
  }

  /**
   * 基于 machine-id 生成一个稳定的虚拟 MAC 地址
   * 使用本地管理地址范围，确保不与真实硬件冲突
   */
  private generateVirtualMacFromMachineId(machineIdValue: string): string {
    // 使用 SHA256 对 machine-id 进行哈希
    const hash = createHash('sha256').update(machineIdValue).digest('hex')

    // 取前 12 个字符作为 MAC 地址
    const macHex = hash.substring(0, 12)

    // 格式化为 MAC 地址格式 (xx:xx:xx:xx:xx:xx)
    const macParts = macHex.match(/.{2}/g) || []

    // 设置本地管理地址标志位 (第一个字节的第二位设为 1)
    // 这样生成的 MAC 地址不会与真实硬件冲突
    if (macParts.length > 0 && macParts[0]) {
      const firstByte = Number.parseInt(macParts[0], 16)
      macParts[0] = (firstByte | 0x02).toString(16).padStart(2, '0')
    }

    const virtualMac = macParts.join(':')
    this.logger.info(`  • 基于 machine-id 生成虚拟 MAC: ${virtualMac}`)

    return virtualMac
  }

  private async generateFingerprint(): Promise<DeviceFingerprint> {
    const machineIdValue = await this.getMachineId()
    let macAddress = this.getMacAddress()

    // 如果获取不到真实 MAC 地址，基于 machine-id 生成虚拟 MAC
    if (!macAddress) {
      macAddress = this.generateVirtualMacFromMachineId(machineIdValue)
    }

    return {
      system: process.platform,
      hostname: this.getHostname(),
      mac_address: macAddress,
      machine_id: machineIdValue,
    }
  }

  private async generateHardwareHash(fingerprint?: DeviceFingerprint): Promise<string> {
    const fp = fingerprint || await this.generateFingerprint()

    const identifiers: string[] = []

    if (fp.hostname)
      identifiers.push(fp.hostname)
    if (fp.mac_address)
      identifiers.push(fp.mac_address)
    if (fp.machine_id)
      identifiers.push(fp.machine_id)

    if (identifiers.length === 0) {
      identifiers.push(fp.system)
    }

    const fingerprintStr = identifiers.join('||')
    return createHash('sha256').update(fingerprintStr).digest('hex')
  }

  private async generateSerialNumber(fingerprint?: DeviceFingerprint): Promise<string> {
    const fp = fingerprint || await this.generateFingerprint()

    if (fp.mac_address) {
      const macClean = fp.mac_address.toLowerCase().replace(/:/g, '')
      const shortHash = createHash('md5').update(macClean).digest('hex').substring(0, 8).toUpperCase()
      return `SN-${shortHash}-${macClean}`
    }

    const identifier = fp.machine_id || fp.hostname || 'unknown'
    const shortHash = createHash('md5').update(identifier).digest('hex').substring(0, 8).toUpperCase()
    return `SN-${shortHash}-${identifier.substring(0, 12).toUpperCase()}`
  }

  private async ensureDeviceInfo(): Promise<void> {
    let deviceInfo = this.db.getDeviceInfo()

    if (!deviceInfo) {
      this.logger.info('创建新设备身份...')
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

      this.logger.info('设备身份已创建')
    }

    this.deviceCache = deviceInfo
  }

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

  getSerialNumber(): string {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    return deviceInfo?.serial_number || ''
  }

  getHmacKey(): string {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    return deviceInfo?.hmac_key || ''
  }

  getMacAddressFromEfuse(): string | null {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    return deviceInfo?.mac_address || null
  }

  isActivated(): boolean {
    const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
    return deviceInfo ? deviceInfo.activation_status === 1 : false
  }

  setActivationStatus(status: boolean): boolean {
    try {
      const deviceInfo = this.deviceCache || this.db.getDeviceInfo()
      if (!deviceInfo) {
        this.logger.error('设备信息不存在,无法设置激活状态')
        return false
      }

      this.db.setActivationStatus(deviceInfo.serial_number, status)

      if (this.deviceCache) {
        this.deviceCache.activation_status = status ? 1 : 0
      }

      this.logger.info(`激活状态已更新: ${status ? '已激活' : '未激活'}`)
      return true
    }
    catch (error) {
      this.logger.error('设置激活状态失败', error)
      return false
    }
  }

  generateHmacSignature(challenge: string): string {
    const hmacKey = this.getHmacKey()
    if (!hmacKey) {
      throw new Error('未找到 HMAC 密钥')
    }
    return createHmac('sha256', hmacKey).update(challenge).digest('hex')
  }

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
