<script setup lang="ts">
import { NForm, NFormItem, NSwitch, useMessage } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import ShortcutRecorder from '../ShortcutRecorder.vue'

interface ShortcutConfig {
  id: number
  action: string
  name: string
  category: string
  accelerator: string | null
  enabled: number
  is_global: number
}

const message = useMessage()

const enableGlobalHotkeys = ref(true)
const shortcuts = ref<ShortcutConfig[]>([])

// 按分类分组
const groupedShortcuts = computed(() => {
  const groups = {
    window: [] as ShortcutConfig[],
    conversation: [] as ShortcutConfig[],
    quick: [] as ShortcutConfig[],
  }

  shortcuts.value.forEach((s: ShortcutConfig) => {
    if (s.category in groups) {
      groups[s.category as keyof typeof groups].push(s)
    }
  })

  return [
    { key: 'window', title: '窗口控制', items: groups.window },
    { key: 'conversation', title: '对话控制', items: groups.conversation },
    { key: 'quick', title: '快速操作', items: groups.quick },
  ].filter(g => g.items.length > 0)
})

// 加载快捷键列表
async function loadShortcuts() {
  try {
    shortcuts.value = await window.api.shortcutGetAll()
  }
  catch (error) {
    console.error('加载失败', error)
    message.error('加载快捷键配置失败')
  }
}

// 更新快捷键
async function updateShortcut(action: string, accelerator: string | null) {
  try {
    await window.api.shortcutUpdate(action, accelerator)

    // Update local state instead of reloading all shortcuts
    const index = shortcuts.value.findIndex(s => s.action === action)
    if (index !== -1) {
      shortcuts.value[index].accelerator = accelerator
    }

    message.success('快捷键已更新')
  }
  catch (error) {
    console.error('更新失败', error)
    message.error(`更新快捷键失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 冲突提示
function handleConflict(name: string) {
  message.warning(`快捷键冲突:已被「${name}」使用`)
}

// 处理错误
function handleError(errorMessage: string) {
  message.error(errorMessage)
}

// 重置为默认
async function resetToDefaults() {
  try {
    await window.api.shortcutReset()
    message.success('已重置为默认快捷键')
    await loadShortcuts()
  }
  catch (error) {
    console.error('重置失败', error)
    message.error(`重置失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 保存（预留,目前是实时保存）
async function handleSave() {
  message.success('快捷键配置已保存')
}

// 自定义按钮（重置）
async function handleCustomButton() {
  await resetToDefaults()
}

onMounted(() => {
  loadShortcuts()
})

defineExpose({ handleSave, handleCustomButton })
</script>

<template>
  <div class="min-h-0">
    <NForm label-placement="left" :label-width="120">
      <NFormItem label="启用全局快捷键">
        <div class="flex flex-col gap-1">
          <NSwitch v-model:value="enableGlobalHotkeys" />
        </div>
      </NFormItem>

      <template v-for="group in groupedShortcuts" :key="group.key">
        <div class="group-title">
          {{ group.title }}
        </div>

        <NFormItem
          v-for="shortcut in group.items"
          :key="shortcut.action"
          :label="shortcut.name"
        >
          <ShortcutRecorder
            :model-value="shortcut.accelerator"
            :disabled="!enableGlobalHotkeys"
            @update:model-value="(val) => updateShortcut(shortcut.action, val)"
            @conflict="handleConflict"
            @error="handleError"
          />
        </NFormItem>
      </template>
    </NForm>
  </div>
</template>

<style scoped>
.group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--n-text-color-1);
  margin: 24px 0 16px 0;
  padding-left: 4px;
  border-left: 3px solid var(--n-primary-color);
  line-height: 1;
}

/* 调整 ShortcutRecorder 的宽度以匹配其他输入框 */
:deep(.shortcut-recorder) {
  width: 300px;
}
</style>
