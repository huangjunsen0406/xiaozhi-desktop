import type { DbDeviceInfo } from '../types/database'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { getLogger } from '../utils/logger'
import { DatabaseManager } from './database'

export class DeviceFingerprintManager {
  private static instance: DeviceFingerprintManager | null = null
  private db: DatabaseManager
  private deviceCache: DbDeviceInfo | null = null
  private logger = getLogger('DeviceFingerprint')

  private constructor() {
    this.db = DatabaseManager.getInstance()
    this.ensureDeviceInfo()
  }

  static getInstance(): DeviceFingerprintManager {
    if (!DeviceFingerprintManager.instance) {
      DeviceFingerprintManager.instance = new DeviceFingerprintManager()
    }
    return DeviceFingerprintManager.instance
  }

  private ensureDeviceInfo(): void {
    const existing = this.db.getDeviceInfo()
    if (existing && existing.serial_number && existing.hmac_key) {
      this.deviceCache = existing
      this.logger.info('已加载设备身份信息')
      return
    }

    // 首次启动：生成新的设备身份
    this.logger.info('创建新设备身份...')
    const mac = this.getSimpleMac()
    const serialNumber = `SN-${randomUUID()}`
    const hmacKey = randomBytes(32).toString('hex')

    this.db.getOrCreateDeviceInfo({
      serial_number: serialNumber,
      hmac_key: hmacKey,
      mac_address: mac || serialNumber,
      machine_id: '',
    })

    this.deviceCache = this.db.getDeviceInfo() || null
    this.logger.info('设备身份已创建')
  }

  private getSimpleMac(): string | null {
    const nets = networkInterfaces()
    for (const [name, addrs] of Object.entries(nets)) {
      if (name.startsWith('lo'))
        continue
      for (const addr of addrs || []) {
        if (addr.mac && addr.mac !== '00:00:00:00:00:00' && !addr.internal) {
          return addr.mac
        }
      }
    }
    return null
  }

  getSerialNumber(): string {
    return this.deviceCache?.serial_number || ''
  }

  getHmacKey(): string {
    return this.deviceCache?.hmac_key || ''
  }

  getDeviceId(): string {
    return this.deviceCache?.mac_address || this.deviceCache?.serial_number || ''
  }

  getMacAddressFromEfuse(): string | null {
    return this.deviceCache?.mac_address || null
  }

  generateHmacSignature(challenge: string): string {
    const hmacKey = this.getHmacKey()
    if (!hmacKey) {
      throw new Error('未找到 HMAC 密钥')
    }
    return createHmac('sha256', hmacKey).update(challenge).digest('hex')
  }

  isActivated(): boolean {
    return this.deviceCache?.activation_status === 1
  }

  setActivationStatus(status: boolean): boolean {
    try {
      if (!this.deviceCache) {
        this.logger.error('设备信息不存在,无法设置激活状态')
        return false
      }

      this.db.setActivationStatus(this.deviceCache.serial_number, status)
      this.deviceCache.activation_status = status ? 1 : 0

      this.logger.info(`激活状态已更新: ${status ? '已激活' : '未激活'}`)
      return true
    }
    catch (error) {
      this.logger.error('设置激活状态失败', error)
      return false
    }
  }

  ensureDeviceIdentity(): [string, string, boolean] {
    if (!this.deviceCache) {
      throw new Error('设备信息未初始化')
    }
    return [
      this.deviceCache.serial_number,
      this.deviceCache.hmac_key,
      this.deviceCache.activation_status === 1,
    ]
  }

  getDeviceInfo() {
    return {
      serialNumber: this.getSerialNumber(),
      macAddress: this.getMacAddressFromEfuse() || '',
      activationStatus: this.isActivated(),
    }
  }
}
