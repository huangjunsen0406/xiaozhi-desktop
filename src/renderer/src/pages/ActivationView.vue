<script setup lang="ts">
// 示例数据：后续可通过 IPC 注入
const serialNumber = 'SN-AEE4B617-7ee956a48610'
const macAddress = '7e:e9:56:a4:86:10'
const code = '686071'

async function copyCode() {
  await navigator.clipboard.writeText(code)
}

function jump() {
  // 这里保留空实现，后续可改为 openExternal 到你的激活页
  window.api.openExternal('https://xiaozhi.me/')
}

function closeWindow() {
  console.log('closeWindow')
  window.api.close()
}

// 激活（#28a745）未激活（#dc3545）
const isActivated = ref(true)
</script>

<template>
  <!-- 透明窗口一体 UI：窗口 500x330，内部居中卡片 -->
  <div class="w-full h-screen gap-4 p-5 overflow-hidden bg-white dark:bg-custom-dark">
    <!-- 拖拽 -->
    <div class="fixed top-0 left-0 right-0 w-full h-[10px]" style="-webkit-app-region: drag" />
    <!-- 激活状态栏 -->
    <div class="flex items-center justify-between">
      <div class="text-gray-700 dark:text-gray-300 !font-bold">
        设备激活
      </div>
      <div class="flex items-center gap-2">
        <!-- 小圆点 -->
        <div class="flex items-center gap-2 text-[11px] text-base text-gray-700 dark:text-gray-300">
          <div class="w-2 h-2 rounded-full" :class="isActivated ? 'bg-[#28a745]' : 'bg-[#dc3545]'" />
          状态不一致(需重新激活)
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
      <n-input-otp :default-value="code.split('')" readonly />
      <div class=" bg-[#165dff] dark:bg-[#1d2129] py-[10px] px-[30px] box-border rounded-lg text-white text-center cursor-pointer" @click="copyCode">
        复制
      </div>
    </div>
    <!-- 复制按钮 -->
    <div class="text-[11px] mt-[20px] bg-[#165dff] dark:bg-[#1d2129] p-[10px] box-border rounded-lg text-white text-center cursor-pointer" @click="jump">
      跳转激活
    </div>
  </div>
</template>

<style>
html, body { background: transparent !important; }
</style>
