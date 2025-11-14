<script setup lang="ts">
import { NButton, NCard, NForm, NFormItem, NSwitch, NTag } from 'naive-ui'
import { ref } from 'vue'

const enableGlobalHotkeys = ref(true)
const hotkeys = ref([
  {
    id: 'toggle-window',
    name: '显示/隐藏主窗口',
    combination: 'Cmd+Shift+X',
    enabled: true,
  },
  {
    id: 'start-recording',
    name: '开始/停止录音',
    combination: 'Cmd+Shift+R',
    enabled: true,
  },
  {
    id: 'open-settings',
    name: '打开设置',
    combination: 'Cmd+,',
    enabled: true,
  },
  {
    id: 'toggle-mini',
    name: '切换迷你模式',
    combination: 'Cmd+Shift+M',
    enabled: false,
  },
])

const isRecording = ref(false)
const recordingTarget = ref('')

async function handleSave() {
  console.log('保存快捷键设置', {
    enableGlobalHotkeys: enableGlobalHotkeys.value,
    hotkeys: hotkeys.value,
  })
}

function startRecordingHotkey(hotkeyId: string) {
  isRecording.value = true
  recordingTarget.value = hotkeyId
  // TODO: 实现快捷键录制逻辑
  console.log('开始录制快捷键:', hotkeyId)
}

function resetHotkey(hotkeyId: string) {
  const hotkey = hotkeys.value.find(h => h.id === hotkeyId)
  if (hotkey) {
    hotkey.combination = ''
  }
}

function resetAllHotkeys() {
  // 重置为默认值
  hotkeys.value = [
    {
      id: 'toggle-window',
      name: '显示/隐藏主窗口',
      combination: 'Cmd+Shift+X',
      enabled: true,
    },
    {
      id: 'start-recording',
      name: '开始/停止录音',
      combination: 'Cmd+Shift+R',
      enabled: true,
    },
    {
      id: 'open-settings',
      name: '打开设置',
      combination: 'Cmd+,',
      enabled: true,
    },
    {
      id: 'toggle-mini',
      name: '切换迷你模式',
      combination: 'Cmd+Shift+M',
      enabled: false,
    },
  ]
}

async function handleCustomButton() {
  // 自定义：重置所有
  resetAllHotkeys()
}

defineExpose({ handleSave, handleCustomButton })
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <NFormItem label="启用全局快捷键">
      <NSwitch v-model:value="enableGlobalHotkeys" />
    </NFormItem>

    <NFormItem label="快捷键配置">
      <div class="w-full space-y-3">
        <NCard
          v-for="hotkey in hotkeys"
          :key="hotkey.id"
          size="small"
          :bordered="false"
          class="bg-gray-50 dark:bg-gray-800"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <NSwitch
                v-model:value="hotkey.enabled"
                :disabled="!enableGlobalHotkeys"
                size="small"
              />
              <span class="font-medium">{{ hotkey.name }}</span>
            </div>
            <div class="flex items-center space-x-2">
              <NTag
                v-if="hotkey.combination"
                type="info"
                size="small"
                class="font-mono"
              >
                {{ hotkey.combination }}
              </NTag>
              <NButton
                size="small"
                secondary
                :disabled="!enableGlobalHotkeys || !hotkey.enabled"
                @click="startRecordingHotkey(hotkey.id)"
              >
                <template #icon>
                  <icon-carbon-send-alt class="w-3 h-3" />
                </template>
                {{ isRecording && recordingTarget === hotkey.id ? '按键中...' : '设置' }}
              </NButton>
              <NButton
                size="small"
                quaternary
                :disabled="!enableGlobalHotkeys || !hotkey.enabled"
                @click="resetHotkey(hotkey.id)"
              >
                <template #icon>
                  <icon-carbon-close class="w-3 h-3" />
                </template>
              </NButton>
            </div>
          </div>
        </NCard>
      </div>
    </NFormItem>
  </NForm>
</template>
