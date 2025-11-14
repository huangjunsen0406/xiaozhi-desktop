<script setup lang="ts">
import {
  NButton,
  NLayout,
  NLayoutContent,
  NLayoutSider,
  NMenu,
  NSpace,
  useMessage,
} from 'naive-ui'
import { computed, h, ref } from 'vue'

// 图标
import IconCarbonCamera from '~icons/carbon/camera'
import IconCarbonHeadphones from '~icons/carbon/headphones'
import IconCarbonKeyboard from '~icons/carbon/keyboard'
import IconCarbonMicrophone from '~icons/carbon/microphone'
import IconCarbonSettings from '~icons/carbon/settings'

// 子面板
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

/** 右侧面板映射 */
const Panels: Record<Key, any> = {
  system: SystemSettings,
  wake: WakeWordSettings,
  camera: CameraSettings,
  audio: AudioSettings,
  hotkey: HotkeySettings,
}
type MaybePromise<T> = T | Promise<T>
export interface PanelExposed {
  handleSave: () => MaybePromise<void>
  handleCustomButton?: () => MaybePromise<void>
}

const panelRef = ref<PanelExposed | null>(null)
const message = useMessage()

const customButtonTextByKey: Record<Key, string | undefined> = {
  system: '重置',
  wake: '测试',
  camera: '测试',
  audio: '刷新设备',
  hotkey: '重置所有',
}
const customText = computed(() => customButtonTextByKey[selected.value])

const saveLoading = ref(false)
const customLoading = ref(false)

async function onSaveClick() {
  if (!panelRef.value?.handleSave)
    return
  saveLoading.value = true
  try {
    await panelRef.value.handleSave()
  }
  catch (e: any) {
    message.error(e?.message || '保存失败')
  }
  finally {
    saveLoading.value = false
  }
}

async function onCustomClick() {
  if (!panelRef.value?.handleCustomButton)
    return
  customLoading.value = true
  try {
    await panelRef.value.handleCustomButton()
  }
  catch (e: any) {
    message.error(e?.message || '操作失败')
  }
  finally {
    customLoading.value = false
  }
}
</script>

<template>
  <!-- 整页容器 -->
  <div class="h-screen flex flex-col bg-white dark:bg-custom-dark">
    <!-- 标题栏拖拽区（固定高度） -->
    <div class="h-[28px] shrink-0" style="-webkit-app-region: drag" />

    <!-- 左右分栏 -->
    <NLayout has-sider class="flex-1 min-h-0">
      <NLayoutSider
        width="200"
        bordered
        collapse-mode="width"
        show-trigger
        :native-scrollbar="false"
      >
        <NMenu v-model:value="selected" :options="menuOptions" :indent="12" />
      </NLayoutSider>

      <!-- 右侧内容外层：锁边界/可收缩 -->
      <NLayoutContent class="p-4 min-h-0 overflow-hidden">
        <!-- 用 Grid 明确三行：标题（auto）/ 中间（1fr）/ 按钮（auto） -->
        <div class="grid grid-rows-[auto_1fr_auto] gap-4 h-full min-h-0">
          <!-- 标题：固定行 -->
          <div class="shrink-0">
            {{ menuOptions.find(o => o.key === selected)?.label }}
          </div>

          <!-- 中部：唯一滚动区（双层隔离，任何子组件都顶不破） -->
          <div class="min-h-0 overflow-hidden rounded">
            <div class="h-full min-h-0 overflow-auto">
              <!-- 也可换成 <n-scrollbar class="h-full" trigger="none" :size="0"> ... </n-scrollbar> -->
              <n-scrollbar class="h-full pr-[20px] box-border">
                <component :is="Panels[selected]" ref="panelRef" :key="selected" />
              </n-scrollbar>
            </div>
          </div>

          <!-- 底部按钮：固定行 -->
          <div class="shrink-0">
            <NSpace justify="end">
              <NButton v-if="customText" :loading="customLoading" @click="onCustomClick">
                {{ customText }}
              </NButton>
              <NButton type="primary" :loading="saveLoading" @click="onSaveClick">
                保存
              </NButton>
            </NSpace>
          </div>
        </div>
      </NLayoutContent>
    </NLayout>
  </div>
</template>
