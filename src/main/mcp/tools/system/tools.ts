/**
 * 系统信息工具定义
 */

import * as os from 'node:os'
import { app } from 'electron'
import { getLogger } from '../../../utils/logger'
import { PropertyList } from '../../types'
import { defineTool } from '../registry'

const logger = getLogger('SystemTools')

/**
 * 获取系统信息
 */
defineTool({
  name: 'self.system.get_info',
  description: `Get detailed system information including OS, hardware, and application details.

Use this tool when:
1. User asks about system specs or computer information
2. User wants to know OS version, CPU, memory details
3. User asks "what's my system info?", "系统信息", "电脑配置"
4. Troubleshooting or diagnostic purposes

Returns comprehensive JSON with:
- OS information (platform, version, architecture)
- Hardware details (CPU model, cores, memory)
- Application information (version, Electron version, Node version)
- System uptime and performance metrics

Examples:
- "我的电脑配置是什么?" -> Returns full system info
- "What OS am I running?" -> Returns OS details
- "How much RAM do I have?" -> Returns memory info`,
  properties: new PropertyList([]),
  callback: async (_args: Record<string, unknown>): Promise<string> => {
    try {
      logger.info('获取系统信息')

      // eslint-disable-next-line node/prefer-global/process
      const processVersions = process.versions

      const cpus = os.cpus()
      const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown'
      const cpuCores = cpus.length

      let totalIdle = 0
      let totalTick = 0
      cpus.forEach((cpu) => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type as keyof typeof cpu.times]
        }
        totalIdle += cpu.times.idle
      })
      const cpuUsage = Math.round(100 - (totalIdle / totalTick) * 100)

      const totalMemory = os.totalmem()
      const freeMemory = os.freemem()
      const usedMemory = totalMemory - freeMemory
      const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100)

      const uptimeSeconds = os.uptime()
      const uptimeDays = Math.floor(uptimeSeconds / 86400)
      const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600)
      const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60)

      const networkInterfaces = os.networkInterfaces()
      const activeInterfaces = Object.entries(networkInterfaces)
        .filter(([_, addrs]) => addrs && addrs.length > 0)
        .map(([name, addrs]) => ({
          name,
          addresses: addrs!.filter(addr => !addr.internal).map(addr => ({
            address: addr.address,
            family: addr.family,
            mac: addr.mac,
          })),
        }))
        .filter(iface => iface.addresses.length > 0)

      const systemInfo = {
        success: true,
        os: {
          platform: os.platform(),
          type: os.type(),
          release: os.release(),
          version: os.version(),
          arch: os.arch(),
          hostname: os.hostname(),
          uptime: {
            seconds: uptimeSeconds,
            formatted: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`,
          },
        },
        hardware: {
          cpu: {
            model: cpuModel,
            cores: cpuCores,
            usage: `${cpuUsage}%`,
            speed: cpus[0]?.speed ? `${cpus[0].speed} MHz` : 'Unknown',
          },
          memory: {
            total: `${Math.round(totalMemory / 1024 / 1024 / 1024)} GB`,
            free: `${Math.round(freeMemory / 1024 / 1024 / 1024)} GB`,
            used: `${Math.round(usedMemory / 1024 / 1024 / 1024)} GB`,
            usage: `${memoryUsagePercent}%`,
            totalBytes: totalMemory,
            freeBytes: freeMemory,
          },
        },
        application: {
          name: app.getName(),
          version: app.getVersion(),
          electronVersion: processVersions.electron,
          chromeVersion: processVersions.chrome,
          nodeVersion: processVersions.node,
          v8Version: processVersions.v8,
        },
        network: {
          interfaces: activeInterfaces,
        },
        user: {
          homedir: os.homedir(),
          tmpdir: os.tmpdir(),
          username: os.userInfo().username,
        },
      }

      logger.info('系统信息获取成功')
      return JSON.stringify(systemInfo, null, 2)
    }
    catch (error) {
      logger.error('获取系统信息失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '获取系统信息失败',
      })
    }
  },
})
