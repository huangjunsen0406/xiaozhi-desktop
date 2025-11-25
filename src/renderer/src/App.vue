<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { darkTheme, lightTheme, NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { computed, onMounted, onUnmounted } from 'vue'
import { useAppStore } from './stores/app'
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

// 初始化应用状态 Store
const appStore = useAppStore()

onMounted(async () => {
  console.log('[App] 初始化应用状态')

  try {
    // 获取初始状态
    const state = await window.api.appGetState()
    console.log('[App] 初始状态:', state)

    // 更新 Store
    appStore.updateState({
      deviceState: state.device_state,
      listeningMode: state.listening_mode,
      channelOpen: state.audio_opened,
    })

    // 监听状态变化
    window.api.appOnStateChanged((state) => {
      console.log('[App] 状态更新:', state)
      appStore.updateState({
        deviceState: state.deviceState,
        listeningMode: state.listeningMode,
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

    // 监听主题变更（来自 MCP 工具）
    const removeThemeListener = window.api.themeOnChange((theme: string) => {
      console.log('[App] 收到主题变更请求:', theme)
      if (['light', 'dark', 'auto'].includes(theme)) {
        mode.value = theme as 'light' | 'dark' | 'auto'
      }
    })

    // 监听服务器消息
    window.api.appOnServerMessage((message) => {
      appStore.handleServerMessage(message)
    })

    // 监听图片捕获事件
    window.api.chatOnImageCaptured((data: { imageBase64: string }) => {
      appStore.handleImageCaptured(data.imageBase64)
    })

    // 监听单条消息添加事件
    window.api.chatOnMessageAdded((data) => {
      console.log('[App] 收到消息添加事件:', data)
      // 如果是当前会话的消息，刷新消息列表
      if (data.sessionId === appStore.currentSessionId) {
        appStore.loadMessages(data.sessionId)
      }
      // 无论如何都刷新会话列表（更新消息计数）
      appStore.loadSessions()
    })

    // 监听批量消息添加事件（图片+文本）
    window.api.chatOnMessagesBatchAdded((data) => {
      console.log('[App] 收到批量消息添加事件:', data)
      // 如果是当前会话的消息，刷新消息列表
      if (data.sessionId === appStore.currentSessionId) {
        appStore.loadMessages(data.sessionId)
      }
      // 刷新会话列表
      appStore.loadSessions()
    })

    // 保存清理函数
    onUnmounted(() => {
      removeCameraListener()
      removeThemeListener()
      window.api.appRemoveServerMessageListener()
      window.api.chatRemoveImageCapturedListener()
      window.api.chatRemoveMessageAddedListener()
      window.api.chatRemoveMessagesBatchAddedListener()
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
