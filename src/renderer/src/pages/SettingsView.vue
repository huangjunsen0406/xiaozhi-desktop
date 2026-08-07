<script setup lang="ts">
import type { Component } from 'vue'
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
import IconCarbonPet from '~icons/carbon/bot'
import IconCarbonCamera from '~icons/carbon/camera'
import IconCarbonFaceActivated from '~icons/carbon/face-activated'
import IconCarbonFavorite from '~icons/carbon/favorite'
import IconCarbonHeadphones from '~icons/carbon/headphones'
import IconCarbonInformation from '~icons/carbon/information'
import IconCarbonKeyboard from '~icons/carbon/keyboard'
import IconCarbonMicrophone from '~icons/carbon/microphone'
import IconCarbonMusic from '~icons/carbon/music'
import IconCarbonSettings from '~icons/carbon/settings'
import IconCarbonTools from '~icons/carbon/tools'
import IconCarbonUser from '~icons/carbon/user'
import IconCarbonView from '~icons/carbon/view'

// 子面板
import AboutSettings from '../components/settings/AboutSettings.vue'
import AppearanceSettings from '../components/settings/AppearanceSettings.vue'
import AudioSettings from '../components/settings/AudioSettings.vue'
import CameraSettings from '../components/settings/CameraSettings.vue'
import CareReminderSettings from '../components/settings/CareReminderSettings.vue'
import EmotionSettings from '../components/settings/EmotionSettings.vue'
import HotkeySettings from '../components/settings/HotkeySettings.vue'
import McpToolsSettings from '../components/settings/McpToolsSettings.vue'
import ModelSettings from '../components/settings/ModelSettings.vue'
import MusicSettings from '../components/settings/MusicSettings.vue'
import PetsSettings from '../components/settings/PetsSettings.vue'
import SystemSettings from '../components/settings/SystemSettings.vue'
import WakeWordSettings from '../components/settings/WakeWordSettings.vue'
import TitleBar from '../components/TitleBar.vue'

type Key = 'system' | 'appearance' | 'model' | 'pets' | 'care' | 'emotion' | 'wake' | 'camera' | 'music' | 'audio' | 'hotkey' | 'mcp' | 'about'
const selected = ref<Key>('system')
const withIcon = (Comp: Component) => () => h(Comp, { class: 'w-4 h-4' })
const showTitleBar = window.api.getPlatform() !== 'darwin'

const menuOptions = [
  { label: '系统选项', key: 'system', icon: withIcon(IconCarbonSettings) },
  { label: '外观', key: 'appearance', icon: withIcon(IconCarbonView) },
  { label: '模型', key: 'model', icon: withIcon(IconCarbonUser) },
  { label: '精灵宠物', key: 'pets', icon: withIcon(IconCarbonPet) },
  { label: '关怀', key: 'care', icon: withIcon(IconCarbonFavorite) },
  { label: '表情', key: 'emotion', icon: withIcon(IconCarbonFaceActivated) },
  { label: '唤醒词', key: 'wake', icon: withIcon(IconCarbonMicrophone) },
  { label: '摄像头', key: 'camera', icon: withIcon(IconCarbonCamera) },
  { label: '音乐', key: 'music', icon: withIcon(IconCarbonMusic) },
  { label: '音频设备', key: 'audio', icon: withIcon(IconCarbonHeadphones) },
  { label: '快捷键', key: 'hotkey', icon: withIcon(IconCarbonKeyboard) },
  { label: 'MCP 工具', key: 'mcp', icon: withIcon(IconCarbonTools) },
  { label: '关于', key: 'about', icon: withIcon(IconCarbonInformation) },
] satisfies { label: string, key: Key, icon: () => ReturnType<typeof h> }[]

type MaybePromise<T> = T | Promise<T>
export interface PanelExposed {
  handleSave: () => MaybePromise<void>
  handleCustomButton?: () => MaybePromise<void>
}

// 使用字典存储每个面板的引用
const panelRefs = ref<Record<Key, PanelExposed | null>>({
  system: null,
  appearance: null,
  model: null,
  pets: null,
  care: null,
  emotion: null,
  wake: null,
  camera: null,
  music: null,
  audio: null,
  hotkey: null,
  mcp: null,
  about: null,
})

// 设置面板引用的辅助函数
function setPanelRef(key: Key) {
  return (el: unknown) => {
    panelRefs.value[key] = el as PanelExposed | null
  }
}

// 获取当前选中面板的引用
const currentPanelRef = computed(() => panelRefs.value[selected.value])

const message = useMessage()

const customButtonTextByKey: Record<Key, string | undefined> = {
  system: '重置',
  appearance: undefined,
  model: '刷新列表',
  pets: '刷新列表',
  care: undefined,
  emotion: undefined, // 表情设置没有自定义按钮
  wake: '测试',
  camera: undefined, // 摄像头改为内嵌预览，不需要自定义按钮
  music: undefined,
  audio: '刷新设备',
  hotkey: '重置所有',
  mcp: '重置',
  about: undefined,
}
const customText = computed(() => customButtonTextByKey[selected.value])

const saveLoading = ref(false)
const customLoading = ref(false)

async function onSaveClick() {
  if (!currentPanelRef.value?.handleSave)
    return
  saveLoading.value = true
  try {
    await currentPanelRef.value.handleSave()
  }
  catch (e) {
    const errorMessage = e instanceof Error ? e.message : '保存失败'
    message.error(errorMessage)
  }
  finally {
    saveLoading.value = false
  }
}

async function onCustomClick() {
  if (!currentPanelRef.value?.handleCustomButton)
    return
  customLoading.value = true
  try {
    await currentPanelRef.value.handleCustomButton()
  }
  catch (e) {
    const errorMessage = e instanceof Error ? e.message : '操作失败'
    message.error(errorMessage)
  }
  finally {
    customLoading.value = false
  }
}
</script>

<template>
  <!-- 整页容器 -->
  <div class="h-screen flex flex-col bg-white dark:bg-custom-dark">
    <!-- 标题栏：Win/Linux 自定义三键；mac 用系统红绿灯 + 拖拽区 -->
    <TitleBar v-if="showTitleBar" />
    <div
      v-else
      class="h-11 shrink-0 flex items-stretch"
      style="-webkit-app-region: drag"
    >
      <div class="w-[76px] shrink-0" style="-webkit-app-region: no-drag" />
      <div class="flex-1" />
    </div>

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
                <!-- 使用 v-show 保持组件实例，避免每次切换都重新挂载 -->
                <SystemSettings v-show="selected === 'system'" :ref="setPanelRef('system')" />
                <AppearanceSettings v-show="selected === 'appearance'" :ref="setPanelRef('appearance')" />
                <ModelSettings v-show="selected === 'model'" :ref="setPanelRef('model')" />
                <PetsSettings v-show="selected === 'pets'" :ref="setPanelRef('pets')" />
                <CareReminderSettings v-show="selected === 'care'" :ref="setPanelRef('care')" />
                <EmotionSettings v-show="selected === 'emotion'" :ref="setPanelRef('emotion')" />
                <WakeWordSettings v-show="selected === 'wake'" :ref="setPanelRef('wake')" />
                <CameraSettings v-show="selected === 'camera'" :ref="setPanelRef('camera')" />
                <MusicSettings v-show="selected === 'music'" :ref="setPanelRef('music')" />
                <AudioSettings v-show="selected === 'audio'" :ref="setPanelRef('audio')" />
                <HotkeySettings v-show="selected === 'hotkey'" :ref="setPanelRef('hotkey')" />
                <McpToolsSettings v-show="selected === 'mcp'" :ref="setPanelRef('mcp')" />
                <AboutSettings v-show="selected === 'about'" :ref="setPanelRef('about')" />
              </n-scrollbar>
            </div>
          </div>

          <!-- 底部按钮：固定行（外观 / 关于 不显示保存栏） -->
          <div v-if="selected !== 'appearance' && selected !== 'about'" class="shrink-0">
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
