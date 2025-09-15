<script setup lang="ts">
import { useDark } from '@vueuse/core'
import { darkTheme, lightTheme, NConfigProvider, NMessageProvider } from 'naive-ui'
import { computed } from 'vue'
import { themeOverrides } from './theme/naiveTheme'

const isDark = useDark({ selector: 'html', attribute: 'class', valueDark: 'dark' })
const theme = computed(() => (isDark.value ? darkTheme : lightTheme))
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <router-view />
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped></style>
