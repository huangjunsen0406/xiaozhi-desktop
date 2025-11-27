<script setup lang="ts">
import type { DeviceState, ListeningMode } from './stores/app'
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
      deviceState: state.device_state as DeviceState,
      listeningMode: state.listening_mode as ListeningMode,
      channelOpen: state.audio_opened,
    })

    // 监听状态变化
    window.api.appOnStateChanged((state) => {
      console.log('[App] 状态更新:', state)
      appStore.updateState({
        deviceState: state.deviceState as DeviceState,
        listeningMode: state.listeningMode as ListeningMode,
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

    // 补偿当前的流式状态（避免新窗口错过已播出的内容）
    const streamingSnapshot = await window.api.chatGetStreamingState()
    appStore.hydrateStreamingState(streamingSnapshot)

    // 监听流式增量和完成事件
    window.api.chatOnStreamingUpdate((data) => {
      void appStore.handleStreamingUpdate(data)
    })
    window.api.chatOnStreamingFinalize((data) => {
      void appStore.handleStreamingFinalize(data)
    })

    // 监听图片捕获事件
    window.api.chatOnImageCaptured((data: { imageBase64: string }) => {
      appStore.handleImageCaptured(data.imageBase64)
    })

    // 监听单条消息添加事件
    window.api.chatOnMessageAdded((data) => {
      console.log('[App] 收到消息添加事件:', data)

      // 仅在 AI 流式过程中跳过 AI 消息，用户消息仍需刷新
      if (appStore.isStreaming && data.role === 'assistant') {
        console.log('[App] AI 正在流式，跳过覆盖消息列表')
        // 只刷新会话列表（更新消息计数）
        appStore.loadSessions()
        return
      }

      // 对齐当前会话到事件会话，避免忽略新会话
      if (appStore.currentSessionId !== data.sessionId) {
        appStore.currentSessionId = data.sessionId
        appStore.sessions.forEach((s) => {
          s.active = s.sessionId === data.sessionId
        })
      }

      appStore.loadMessages(data.sessionId)
      // 刷新会话列表（更新消息计数）
      appStore.loadSessions()
    })

    // 监听批量消息添加事件（图片+文本）
    window.api.chatOnMessagesBatchAdded((data) => {
      console.log('[App] 收到批量消息添加事件:', data)

      // 如果 AI 正在流式，等待 finalize 后的刷新
      if (appStore.isStreaming) {
        console.log('[App] AI 正在流式，跳过覆盖消息列表')
        // 只刷新会话列表（更新消息计数）
        appStore.loadSessions()
        return
      }

      if (appStore.currentSessionId !== data.sessionId) {
        appStore.currentSessionId = data.sessionId
        appStore.sessions.forEach((s) => {
          s.active = s.sessionId === data.sessionId
        })
      }

      appStore.loadMessages(data.sessionId)
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
      window.api.chatRemoveStreamingListeners()
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
