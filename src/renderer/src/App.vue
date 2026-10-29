<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { darkTheme, lightTheme, NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { computed, onUnmounted, ref } from 'vue'
import { useAppEventBridge } from './composables/useAppEventBridge'
import { useCameraCaptureRequests } from './composables/useCameraCaptureRequests'
import { themeOverrides } from './theme/naiveTheme'

const mode = useColorMode({
  selector: 'html',
  attribute: 'class',
  modes: {
    light: 'light',
    dark: 'dark',
    auto: '',
  },
})

const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemIsDark = ref(systemDarkQuery.matches)
function onSystemThemeChange(event: MediaQueryListEvent): void {
  systemIsDark.value = event.matches
}
systemDarkQuery.addEventListener('change', onSystemThemeChange)
onUnmounted(() => systemDarkQuery.removeEventListener('change', onSystemThemeChange))

const removeThemeListener = window.api.themeOnChange((theme) => {
  if (theme === 'light' || theme === 'dark' || theme === 'auto')
    mode.value = theme
})
onUnmounted(removeThemeListener)

const isDark = computed(() => mode.value === 'auto' ? systemIsDark.value : mode.value === 'dark')
const theme = computed(() => isDark.value ? darkTheme : lightTheme)

useAppEventBridge()
useCameraCaptureRequests()
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
