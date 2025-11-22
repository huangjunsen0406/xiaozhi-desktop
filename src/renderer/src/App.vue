<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { darkTheme, lightTheme, NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { computed, onMounted, onUnmounted } from 'vue'
import { useCallStore } from './stores/call'
import { themeOverrides } from './theme/naiveTheme'
import { captureFromWebcam } from './utils/camera'

const mode = useColorMode({
  selector: 'html',
  attribute: 'class',
  modes: {
    light: 'light',
    dark: 'dark',
    auto: '', // auto 模式时不添加 class，由系统决定
  },
})

// 判断当前是否为暗色模式（包括 auto 模式下系统为暗色的情况）
const isDark = computed(() => {
  if (mode.value === 'dark')
    return true
  if (mode.value === 'light')
    return false
  // auto 模式时，检查系统偏好
  return window.matchMedia('(prefers-color-scheme: dark)').matches
})
const theme = computed(() => (isDark.value ? darkTheme : lightTheme))

// 初始化通话状态 Store
const callStore = useCallStore()

onMounted(async () => {
  console.log('[App] 初始化应用状态')

  try {
    // 获取初始状态
    const state = await window.api.appGetState()
    console.log('[App] 初始状态:', state)

    // 更新 Store
    callStore.updateState({
      deviceState: state.device_state,
      channelOpen: state.audio_opened,
    })

    // 监听状态变化
    window.api.appOnStateChanged((state) => {
      console.log('[App] 状态更新:', state)
      callStore.updateState({
        deviceState: state.deviceState,
        channelOpen: state.channelOpen,
      })
    })

    // 监听摄像头捕获请求
    const removeCameraListener = window.api.cameraOnCaptureRequest(async () => {
      console.log('[App] 收到摄像头捕获请求')
      try {
        const imageBlob = await captureFromWebcam()
        const arrayBuffer = await imageBlob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        window.api.cameraSendCaptureResult(true, uint8Array)
        console.log('[App] 摄像头捕获成功，已发送结果')
      }
      catch (error) {
        console.error('[App] 摄像头捕获失败:', error)
        window.api.cameraSendCaptureResult(
          false,
          undefined,
          error instanceof Error ? error.message : '摄像头捕获失败',
        )
      }
    })

    // 保存清理函数
    onUnmounted(() => {
      removeCameraListener()
    })
  }
  catch (error) {
    console.error('[App] 初始化应用状态失败:', error)
  }
})

onUnmounted(() => {
  console.log('[App] 清理状态监听器')
  window.api.appRemoveStateChangedListener()
})
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <NDialogProvider>
        <router-view />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped></style>
