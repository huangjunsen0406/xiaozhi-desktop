<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { darkTheme, lightTheme, NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemIsDark = ref(systemDarkQuery.matches)
function onSystemThemeChange(e: MediaQueryListEvent) {
  systemIsDark.value = e.matches
}
systemDarkQuery.addEventListener('change', onSystemThemeChange)
onUnmounted(() => systemDarkQuery.removeEventListener('change', onSystemThemeChange))

const isDark = computed(() => {
  if (mode.value === 'dark')
    return true
  if (mode.value === 'light')
    return false
  // auto 模式时，响应系统主题变化
  return systemIsDark.value
})
const theme = computed(() => (isDark.value ? darkTheme : lightTheme))

// 初始化应用状态 Store
const appStore = useAppStore()

onMounted(async () => {
  console.log('初始化应用状态')

  try {
    // 获取初始状态
    const state = await window.api.appGetState()
    console.log('初始状态:', state)

    // 更新 Store
    appStore.updateState({
      deviceState: state.deviceState,
      listeningMode: state.listeningMode,
      keepListening: state.keepListening,
      channelOpen: state.channelOpen,
    })

    // 监听状态变化
    const removeStateListener = window.api.appOnStateChanged((state) => {
      console.log('状态更新:', state)
      appStore.updateState({
        deviceState: state.deviceState,
        listeningMode: state.listeningMode,
        keepListening: state.keepListening,
        channelOpen: state.channelOpen,
      })
    })

    // 监听摄像头捕获请求
    const removeCameraListener = window.api.cameraOnCaptureRequest(async () => {
      console.log('收到摄像头捕获请求')
      try {
        // 获取摄像头配置
        const config = await window.api.cameraConfigGetConfig()
        console.log('使用摄像头配置:', {
          deviceId: config.deviceId,
          width: config.captureWidth,
          height: config.captureHeight,
        })

        // 使用配置的参数捕获图像
        const imageBlob = await captureFromWebcam(
          config.captureWidth || 640,
          config.captureHeight || 480,
          config.deviceId || undefined,
        )

        const arrayBuffer = await imageBlob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        window.api.cameraSendCaptureResult(true, uint8Array)
        console.log('摄像头捕获成功，已发送结果')
      }
      catch (error) {
        console.error('摄像头捕获失败', error)
        window.api.cameraSendCaptureResult(
          false,
          undefined,
          error instanceof Error ? error.message : '摄像头捕获失败',
        )
      }
    })

    // 监听主题变更（来自 MCP 工具）
    const removeThemeListener = window.api.themeOnChange((theme: string) => {
      console.log('收到主题变更请求:', theme)
      if (['light', 'dark', 'auto'].includes(theme)) {
        mode.value = theme as 'light' | 'dark' | 'auto'
      }
    })

    // 监听服务器消息
    const removeServerMessageListener = window.api.appOnServerMessage((message) => {
      appStore.handleServerMessage(message)
    })

    // 监听单条消息添加事件
    const removeMessageAddedListener = window.api.chatOnMessageAdded((data) => {
      console.log('收到消息添加事件:', data)

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
    const removeMessagesBatchAddedListener = window.api.chatOnMessagesBatchAdded((data) => {
      console.log('收到批量消息添加事件:', data)

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

    // 监听会话创建事件（跨天自动创建新会话）
    const removeSessionCreatedListener = window.api.chatOnSessionCreated((data) => {
      console.log('收到会话创建事件:', data)
      // 刷新会话列表以显示新会话
      appStore.loadSessions()
      // 如果当前没有会话，自动切换到新会话
      if (!appStore.currentSessionId) {
        appStore.switchSession(data.sessionId)
      }
    })

    // 保存清理函数
    onUnmounted(() => {
      removeStateListener()
      removeCameraListener()
      removeThemeListener()
      removeServerMessageListener()
      removeMessageAddedListener()
      removeMessagesBatchAddedListener()
      removeSessionCreatedListener()
    })
  }
  catch (error) {
    console.error('初始化应用状态失败', error)
  }
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
