<script setup lang="ts">
import type { EmotionType } from '../../types/emotion'
import { NButton, useDialog, useMessage } from 'naive-ui'
import { onMounted, ref } from 'vue'
import IconCarbonClose from '~icons/carbon/close'
import { EMOTION_METADATA } from '../../types/emotion'

const message = useMessage()
const dialog = useDialog()

// 上传中的表情类型
const uploadingEmotions = ref<Set<EmotionType>>(new Set())

// 每个表情的显示信息
interface EmotionDisplay {
  url: string // 图片 URL
  isCustom: boolean // 是否为自定义图片
}

const emotionImages = ref<Record<EmotionType, EmotionDisplay>>({} as Record<EmotionType, EmotionDisplay>)

/**
 * 获取默认图片 URL
 */
function getDefaultImageUrl(emotionType: EmotionType): string {
  return new URL(`../../assets/emoji/${emotionType}.png`, import.meta.url).href
}

/**
 * 加载所有表情
 */
async function loadEmotions() {
  try {
    const customMapping = await window.api.emotionGetMapping()

    for (const emotion of EMOTION_METADATA) {
      if (customMapping[emotion.type]) {
        // 有自定义：加载自定义图片
        const customUrl = await window.api.emotionGetCustomPath(emotion.type)
        if (customUrl) {
          emotionImages.value[emotion.type] = {
            url: customUrl,
            isCustom: true,
          }
        }
        else {
          // 自定义图片不存在，回退到默认
          emotionImages.value[emotion.type] = {
            url: getDefaultImageUrl(emotion.type),
            isCustom: false,
          }
        }
      }
      else {
        // 没有自定义：加载默认图片
        emotionImages.value[emotion.type] = {
          url: getDefaultImageUrl(emotion.type),
          isCustom: false,
        }
      }
    }
  }
  catch (error) {
    console.error('加载表情失败', error)
    message.error('加载表情失败')
  }
}

/**
 * 上传自定义图片
 */
async function handleUpload(emotionType: EmotionType) {
  try {
    // 1. 打开文件选择器
    const result = await window.api.emotionSelectImage()
    if (result.canceled || !result.filePaths.length) {
      return
    }

    const sourcePath = result.filePaths[0]

    // 2. 设置加载状态
    uploadingEmotions.value.add(emotionType)

    // 3. 上传到主进程
    await window.api.emotionUploadCustom(emotionType, sourcePath)

    // 4. 刷新显示
    const customUrl = await window.api.emotionGetCustomPath(emotionType)
    if (customUrl) {
      emotionImages.value[emotionType] = {
        url: customUrl,
        isCustom: true,
      }
      message.success('上传成功')
    }
  }
  catch (error) {
    console.error('上传失败', error)
    message.error('上传失败')
  }
  finally {
    // 5. 移除加载状态
    uploadingEmotions.value.delete(emotionType)
  }
}

/**
 * 重置为默认图片
 */
async function handleReset(emotionType: EmotionType) {
  // 显示确认对话框
  dialog.warning({
    title: '确认重置',
    content: `确定要删除「${EMOTION_METADATA.find(e => e.type === emotionType)?.label}」的自定义图片吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        // 1. 删除自定义图片
        await window.api.emotionReset(emotionType)

        // 2. 恢复默认图片
        emotionImages.value[emotionType] = {
          url: getDefaultImageUrl(emotionType),
          isCustom: false,
        }
        message.success('已恢复默认')
      }
      catch (error) {
        console.error('重置失败', error)
        message.error('重置失败')
      }
    },
  })
}

// 初始化
onMounted(() => {
  loadEmotions()
})

// 暴露方法给父组件（表情设置不需要保存按钮，上传即生效）
defineExpose({
  handleSave: async () => {
    message.success('表情设置已自动保存')
  },
})
</script>

<template>
  <div class="emotion-settings">
    <!-- 说明文字 -->
    <div class="text-sm text-gray-600 dark:text-gray-400 mb-4">
      点击下方按钮上传自定义表情图片，支持 PNG、JPG、GIF、WebP 格式，最大 5MB。
    </div>

    <!-- 表情网格 -->
    <div class="emotion-grid">
      <div
        v-for="emotion in EMOTION_METADATA"
        :key="emotion.type"
        class="emotion-item"
      >
        <!-- 图片预览区域 -->
        <div class="preview-container">
          <img
            v-if="emotionImages[emotion.type]"
            :src="emotionImages[emotion.type].url"
            :alt="emotion.label"
            class="preview-image"
          >
          <div
            v-else
            class="preview-placeholder"
          >
            加载中...
          </div>

          <!-- 删除按钮（仅自定义图片显示） -->
          <NButton
            v-if="emotionImages[emotion.type]?.isCustom"
            circle
            size="tiny"
            class="delete-btn"
            @click="handleReset(emotion.type)"
          >
            <template #icon>
              <IconCarbonClose class="w-3 h-3" />
            </template>
          </NButton>
        </div>

        <!-- 中文标签 -->
        <div class="label">
          {{ emotion.label }}
        </div>

        <!-- 上传按钮 -->
        <NButton
          size="small"
          :loading="uploadingEmotions.has(emotion.type)"
          :disabled="uploadingEmotions.has(emotion.type)"
          @click="handleUpload(emotion.type)"
        >
          {{ uploadingEmotions.has(emotion.type) ? '上传中...' : '点击上传' }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.emotion-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

.emotion-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  transition: all 0.2s;
}

.emotion-item:hover {
  border-color: #40a9ff;
  box-shadow: 0 2px 8px rgba(64, 169, 255, 0.1);
}

.preview-container {
  position: relative;
  width: 80px;
  height: 80px;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
  background: #fafafa;
}

.preview-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #999;
  font-size: 12px;
}

.delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

html.dark .emotion-item {
  border-color: #434343;
}

html.dark .emotion-item:hover {
  border-color: #177ddc;
  box-shadow: 0 2px 8px rgba(23, 125, 220, 0.1);
}

html.dark .preview-container {
  border-color: #303030;
  background: #1a1a1a;
}

html.dark .label {
  color: #e8e8e8;
}
</style>
