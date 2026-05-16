<script setup lang="ts">
import type { ModelInfo } from '@shared/types'
import { NButton, NEmpty, NPopconfirm, NSpin, NTooltip, useMessage } from 'naive-ui'
import { onMounted, ref } from 'vue'
import IconCarbonAdd from '~icons/carbon/add'
import IconCarbonCheckmark from '~icons/carbon/checkmark'
import IconCarbonFolder from '~icons/carbon/folder'
import IconCarbonTrashCan from '~icons/carbon/trash-can'

const message = useMessage()

// 模型列表
const models = ref<ModelInfo[]>([])
// 当前选中的模型
const currentModelId = ref<string>('')
// 加载状态
const loading = ref(false)
// 导入中状态
const importing = ref(false)
// 删除中的模型 ID
const deletingModelId = ref<string | null>(null)

/**
 * 加载模型列表
 */
async function loadModels() {
  loading.value = true
  try {
    const [list, current] = await Promise.all([
      window.api.modelGetList(),
      window.api.modelGetCurrent(),
    ])
    models.value = list
    currentModelId.value = current
  }
  catch (error) {
    console.error('加载模型列表失败', error)
    message.error('加载模型列表失败')
  }
  finally {
    loading.value = false
  }
}

/**
 * 切换模型
 */
async function handleSelectModel(modelId: string) {
  if (modelId === currentModelId.value)
    return

  try {
    await window.api.modelSetCurrent(modelId)
    currentModelId.value = modelId
    message.success('模型已切换，重启后生效')
  }
  catch (error) {
    console.error('切换模型失败', error)
    message.error('切换模型失败')
  }
}

/**
 * 导入模型
 */
async function handleImport() {
  try {
    // 1. 打开文件夹选择器
    const result = await window.api.modelSelectFolder()
    if (result.canceled || !result.filePaths.length) {
      return
    }

    const sourcePath = result.filePaths[0]
    importing.value = true

    // 2. 导入模型
    const modelId = await window.api.modelImport(sourcePath)
    message.success(modelId ? `模型 "${modelId}" 导入成功` : '模型导入成功')

    // 3. 刷新列表
    await loadModels()
  }
  catch (error) {
    console.error('导入模型失败', error)
    message.error('导入模型失败')
  }
  finally {
    importing.value = false
  }
}

/**
 * 删除模型
 */
async function handleDelete(modelId: string) {
  try {
    deletingModelId.value = modelId

    await window.api.modelDelete(modelId)
    message.success('模型已删除')

    // 刷新列表
    await loadModels()
  }
  catch (error) {
    console.error('删除模型失败', error)
    message.error('删除模型失败')
  }
  finally {
    deletingModelId.value = null
  }
}

/**
 * 打开模型目录
 */
async function handleOpenFolder() {
  try {
    await window.api.modelOpenFolder()
  }
  catch (error) {
    console.error('打开目录失败', error)
    message.error('打开目录失败')
  }
}

// 初始化
onMounted(() => {
  loadModels()
})

// 暴露方法给父组件
defineExpose({
  handleSave: async () => {
    message.success('模型设置已保存')
  },
  handleCustomButton: async () => {
    await loadModels()
    message.success('已刷新模型列表')
  },
})
</script>

<template>
  <div>
    <!-- 说明文字 -->
    <div class="text-sm text-gray-600 dark:text-gray-400 mb-4">
      管理 Live2D 模型，点击模型卡片切换当前使用的模型。支持导入自定义模型（需包含 model.json 配置文件）。
    </div>

    <!-- 加载状态 -->
    <NSpin :show="loading">
      <!-- 模型网格 -->
      <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
        <!-- 导入按钮卡片 -->
        <div
          class="flex flex-col items-center justify-center min-h-[120px] gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          :class="{ 'opacity-60 cursor-not-allowed': importing }"
          @click="!importing && handleImport()"
        >
          <IconCarbonAdd class="w-8 h-8 text-gray-400" />
          <span class="text-sm text-gray-400">{{ importing ? '导入中...' : '导入模型' }}</span>
        </div>

        <!-- 模型卡片列表 -->
        <div
          v-for="model in models"
          :key="model.id"
          class="group flex flex-col items-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition-all bg-gray-50 dark:bg-gray-800/50 hover:border-blue-400 hover:shadow-lg hover:-translate-y-0.5"
          :class="model.id === currentModelId ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'"
          @click="handleSelectModel(model.id)"
        >
          <!-- 预览图 -->
          <div class="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
            <img
              v-if="model.preview"
              :src="model.preview"
              :alt="model.name"
              class="block w-full h-full object-cover"
            >
            <div v-else class="flex items-center justify-center w-full h-full bg-gradient-to-br from-purple-400 to-purple-600 text-white text-[32px] font-bold">
              <span>{{ model.name.charAt(0).toUpperCase() }}</span>
            </div>

            <!-- 选中标记 -->
            <div
              v-if="model.id === currentModelId"
              class="absolute top-2 left-2 w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center"
            >
              <IconCarbonCheckmark class="w-3 h-3" />
            </div>

            <!-- 删除按钮 -->
            <NPopconfirm
              placement="top"
              positive-text="确定"
              negative-text="取消"
              @positive-click="handleDelete(model.id)"
            >
              <template #trigger>
                <NButton
                  circle
                  size="tiny"
                  type="error"
                  class="!absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  :loading="deletingModelId === model.id"
                  @click.stop
                >
                  <template #icon>
                    <IconCarbonTrashCan class="w-3 h-3" />
                  </template>
                </NButton>
              </template>
              确定要删除模型 "{{ model.name }}" 吗？
            </NPopconfirm>
          </div>

          <!-- 模型名称 -->
          <div class="text-sm font-medium text-gray-800 dark:text-gray-200 text-center max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
            {{ model.name }}
          </div>

          <!-- 模型信息 -->
          <div class="flex gap-1 flex-wrap justify-center">
            <NTooltip trigger="hover">
              <template #trigger>
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {{ model.expressionCount }} 表情
                </span>
              </template>
              {{ model.hasExpressions ? `${model.expressionCount} 个表情` : '无表情' }}
            </NTooltip>
            <NTooltip trigger="hover">
              <template #trigger>
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {{ model.motionCount }} 动作
                </span>
              </template>
              {{ model.hasMotions ? `${model.motionCount} 个动作` : '无动作' }}
            </NTooltip>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <NEmpty
        v-if="!loading && models.length === 0"
        description="暂无模型"
        class="mt-8"
      >
        <template #extra>
          <div class="text-sm text-gray-500 dark:text-gray-400 text-center">
            <p>请将 Live2D 模型文件夹复制到模型目录</p>
            <p class="mt-1">
              或点击上方"导入模型"按钮
            </p>
          </div>
        </template>
      </NEmpty>
    </NSpin>

    <!-- 底部操作 -->
    <div class="mt-6 flex items-center gap-2">
      <NButton quaternary size="small" @click="handleOpenFolder">
        <template #icon>
          <IconCarbonFolder class="w-4 h-4" />
        </template>
        打开模型目录
      </NButton>
    </div>
  </div>
</template>
