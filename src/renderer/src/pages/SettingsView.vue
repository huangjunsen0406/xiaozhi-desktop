<script setup lang="ts">
import {
  NCard,
  NLayout,
  NLayoutContent,
  NLayoutSider,
  NMenu,
} from 'naive-ui'
import { h, ref } from 'vue'
import IconCarbonCamera from '~icons/carbon/camera' // 摄像头
import IconCarbonHeadphones from '~icons/carbon/headphones' // 音频设备
import IconCarbonKeyboard from '~icons/carbon/keyboard' // 快捷键
import IconCarbonMicrophone from '~icons/carbon/microphone' // 唤醒词（语音）
import IconCarbonSettings from '~icons/carbon/settings' // 系统选项
import AudioSettings from '../components/settings/AudioSettings.vue'
import CameraSettings from '../components/settings/CameraSettings.vue'
import HotkeySettings from '../components/settings/HotkeySettings.vue'
import SystemSettings from '../components/settings/SystemSettings.vue'
import WakeWordSettings from '../components/settings/WakeWordSettings.vue'

type Key = 'system' | 'wake' | 'camera' | 'audio' | 'hotkey'

const selected = ref<Key>('system')
const withIcon = (Comp: any) => () => h(Comp, { class: 'w-4 h-4' })

const menuOptions = [
  { label: '系统选项', key: 'system', icon: withIcon(IconCarbonSettings) },
  { label: '唤醒词', key: 'wake', icon: withIcon(IconCarbonMicrophone) },
  { label: '摄像头', key: 'camera', icon: withIcon(IconCarbonCamera) },
  { label: '音频设备', key: 'audio', icon: withIcon(IconCarbonHeadphones) },
  { label: '快捷键', key: 'hotkey', icon: withIcon(IconCarbonKeyboard) },
] satisfies { label: string, key: Key, icon: () => any }[]

/** 右侧不同面板组件映射 */
const Panels: Record<Key, () => any> = {
  system: () => h(SystemSettings),
  wake: () => h(WakeWordSettings),
  camera: () => h(CameraSettings),
  audio: () => h(AudioSettings),
  hotkey: () => h(HotkeySettings),
}
</script>

<template>
  <div class="h-screen flex flex-col bg-white dark:bg-custom-dark">
    <!-- 标题栏拖拽区域（固定高度，禁止拉伸） -->
    <div class="h-[28px] shrink-0" style="-webkit-app-region: drag" />

    <!-- 填满剩余空间的布局，允许在 Flex 中收缩 -->
    <NLayout has-sider class="flex-1 min-h-0">
      <!-- ← 去掉 mt-[10px]，加 min-h-0 -->
      <NLayoutSider width="200" bordered collapse-mode="width" show-trigger :native-scrollbar="false">
        <NMenu v-model:value="selected" :options="menuOptions" :indent="12" />
      </NLayoutSider>

      <!-- 右侧内容：同样允许收缩；内部滚动条占满高度 -->
      <NLayoutContent class="p-4 min-h-0">
        <!-- ← 加 min-h-0 -->
        <n-scrollbar class="h-full" trigger="none" :size="0">
          <component :is="Panels[selected]" />
        </n-scrollbar>
      </NLayoutContent>
    </NLayout>
  </div>
</template>
