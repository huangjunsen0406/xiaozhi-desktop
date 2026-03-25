<script setup lang="ts">
import type { ActivationData } from '../../../preload/index.d'
import { computed, onMounted, ref } from 'vue'

// 设备信息
const serialNumber = ref('--')
const macAddress = ref('--')
const activationCode = ref('')
const activationStatus = ref('检查中...')
const statusColor = ref('#6c757d')
const isActivating = ref(false)

// 激活数据
let activationData: ActivationData | null = null

// 初始化
onMounted(async () => {
  try {
    // 获取设备信息
    const deviceInfo = await window.api.activationGetDeviceInfo()
    if (deviceInfo) {
      serialNumber.value = deviceInfo.serialNumber || '--'
      macAddress.value = deviceInfo.macAddress || '--'

      // 更新激活状态显示
      if (deviceInfo.activationStatus) {
        activationStatus.value = '已激活'
        statusColor.value = '#28a745'
      }
      else {
        activationStatus.value = '未激活'
        statusColor.value = '#dc3545'
      }
    }

    // 获取激活数据
    activationData = await window.api.activationGetActivationData()
    if (activationData && activationData.code) {
      activationCode.value = activationData.code
      // 自动开始激活流程
      startActivation()
    }
  }
  catch (error) {
    console.error('初始化失败:', error)
  }
})

// 开始激活
async function startActivation() {
  if (!activationData || isActivating.value) {
    return
  }

  try {
    isActivating.value = true
    activationStatus.value = '激活中...'
    statusColor.value = '#ff9900'

    const result = await window.api.activationStart(activationData)

    if (result.success) {
      activationStatus.value = '已激活'
      statusColor.value = '#28a745'
      console.log('激活成功')

      // 激活成功后延迟关闭窗口
      setTimeout(() => {
        closeWindow()
      }, 1500)
    }
    else {
      activationStatus.value = '激活失败'
      statusColor.value = '#dc3545'
      console.error('激活失败:', result.error)
    }
  }
  catch (error) {
    console.error('激活过程出错:', error)
    activationStatus.value = '激活失败'
    statusColor.value = '#dc3545'
  }
  finally {
    isActivating.value = false
  }
}

// 复制验证码
async function copyCode() {
  try {
    await window.api.clipboardWriteText(activationCode.value)
    console.log('验证码已复制')
  }
  catch (error) {
    console.error('复制失败:', error)
  }
}

// 跳转激活页面
async function jump() {
  try {
    // 从配置中获取授权 URL
    const config = await window.api.systemGetConfig()
    const authUrl = config.authorization_url || 'https://xiaozhi.me/'
    window.api.openExternal(authUrl)
  }
  catch (error) {
    console.error('获取授权 URL 失败:', error)
    // 降级到默认 URL
    window.api.openExternal('https://xiaozhi.me/')
  }
}

// 关闭窗口
function closeWindow() {
  // 取消激活流程
  window.api.activationCancel()
  window.api.close()
}

// 状态文本
const statusText = computed(() => activationStatus.value)

// 验证码数组（用于 OTP 输入框）
const codeArray = computed(() => {
  if (activationCode.value && activationCode.value.length === 6) {
    return activationCode.value.split('')
  }
  return []
})
</script>

<template>
  <!-- 透明窗口一体 UI：窗口 500x330，内部居中卡片 -->
  <div class="w-full h-screen gap-4 p-5 overflow-hidden bg-white dark:bg-custom-dark">
    <!-- 拖拽 -->
    <div class="fixed top-0 left-0 right-0 w-full h-7" style="-webkit-app-region: drag" />
    <!-- 激活状态栏 -->
    <div class="flex items-center justify-between">
      <div class="text-gray-700 dark:text-gray-300 !font-bold">
        设备激活
      </div>
      <div class="flex items-center gap-2" style="-webkit-app-region: no-drag">
        <!-- 小圆点 -->
        <div class="flex items-center gap-2 text-[11px] text-base text-gray-700 dark:text-gray-300">
          <div class="w-2 h-2 rounded-full" :style="{ backgroundColor: statusColor }" />
          {{ statusText }}
        </div>
        <!-- 关闭 -->
        <icon-carbon-close class="w-4 h-4 text-gray-700 dark:text-white cursor-pointer" @click="closeWindow" />
      </div>
    </div>
    <!-- 设备信息 -->
    <div class="text-[11px] text-base text-gray-700 dark:text-gray-300 mt-[20px] bg-[#f2f3f5] dark:bg-[#1d2129] p-[10px] box-border rounded-lg">
      <div class="text-gray-700 dark:text-gray-300 font-bold text-[12px]">
        设备信息
      </div>
      <div class="flex gap-15 mt-[10px] text-[#1d2129] dark:text-[#f2f3f5]">
        <div class="">
          <div class="text-[#86909c] dark:text-[#86909c]">
            设备序列号
          </div>
          <div>{{ serialNumber }}</div>
        </div>
        <div class="">
          <div class="text-[#86909c] dark:text-[#86909c]">
            MAC 地址
          </div>
          <div>{{ macAddress }}</div>
        </div>
      </div>
    </div>
    <!-- 激活验证码 -->
    <div class="flex justify-between items-center text-[11px] text-base text-gray-700 dark:text-gray-300 mt-[20px] bg-[#f2f3f5] dark:bg-[#1d2129] p-[10px] box-border rounded-lg">
      <div class="text-gray-700 dark:text-gray-300 font-bold text-[12px]">
        激活验证码
      </div>
      <n-input-otp v-if="codeArray.length > 0" :default-value="codeArray" readonly />
      <div v-else class="text-gray-400 text-[12px]">
        等待验证码...
      </div>
      <div class=" bg-[#165dff] dark:bg-[#1d2129] border border-transparent dark:border-white/60 py-[10px] px-[30px] box-border rounded-lg text-white text-center cursor-pointer" style="-webkit-app-region: no-drag" @click="copyCode">
        复制
      </div>
    </div>
    <!-- 复制按钮 -->
    <div class="text-[11px] mt-[20px] bg-[#165dff] dark:bg-[#1d2129] p-[10px] box-border rounded-lg text-white text-center cursor-pointer" style="-webkit-app-region: no-drag" @click="jump">
      跳转激活
    </div>
  </div>
</template>

<style>
html, body { background: transparent !important; }
</style>
