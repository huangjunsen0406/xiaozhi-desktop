<script setup lang="ts">
import { NForm, NFormItem, NInput, NInputNumber, NSelect, NSwitch } from 'naive-ui'
import { onMounted, ref, watch } from 'vue'

const message = useMessage()
const loading = ref(false)

// 配置项
const enableWakeWord = ref(true)
const wakeWord = ref('小智')
const threshold = ref(0.2)
const language = ref('zh')

const languageOptions = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
]

// 监听语言变化，自动切换唤醒词
watch(language, async (newLanguage, oldLanguage) => {
  if (newLanguage !== oldLanguage && oldLanguage !== undefined) {
    console.log('语言切换:', oldLanguage, '->', newLanguage)
    try {
      loading.value = true
      // 先保存语言切换到后端
      const result = await window.api.wakeWordUpdateConfig({
        language: newLanguage,
      })

      if (result.success) {
        // 重新加载配置以获取对应语言的唤醒词
        await loadConfig()
      }
      else {
        console.error('切换语言失败:', result.error)
        message.error(`切换语言失败: ${result.error}`)
      }
    }
    catch (error) {
      console.error('切换语言异常:', error)
      message.error('切换语言异常')
    }
    finally {
      loading.value = false
    }
  }
})

/**
 * 加载配置
 */
async function loadConfig() {
  try {
    loading.value = true
    const result = await window.api.wakeWordGetConfig()

    if (result.success && result.data) {
      enableWakeWord.value = result.data.enabled
      wakeWord.value = result.data.keyword
      threshold.value = result.data.threshold
      language.value = result.data.language
    }
    else {
      console.error('加载唤醒词配置失败:', result.error)
      message.error('加载配置失败')
    }
  }
  catch (error) {
    console.error('加载唤醒词配置异常:', error)
    message.error('加载配置异常')
  }
  finally {
    loading.value = false
  }
}

/**
 * 保存配置
 */
async function handleSave() {
  try {
    loading.value = true

    const result = await window.api.wakeWordUpdateConfig({
      enabled: enableWakeWord.value,
      keyword: wakeWord.value,
      threshold: threshold.value,
      language: language.value,
    })

    if (result.success) {
      message.success('保存成功')
    }
    else {
      console.error('保存唤醒词配置失败:', result.error)
      message.error(`保存失败: ${result.error}`)
    }
  }
  catch (error) {
    console.error('保存唤醒词配置异常:', error)
    message.error('保存异常')
  }
  finally {
    loading.value = false
  }
}

/**
 * 测试唤醒词
 */
async function handleCustomButton() {
  try {
    loading.value = true

    const result = await window.api.wakeWordTest()

    if (result.success) {
      message.success(`测试成功！模拟检测到唤醒词: ${result.keyword}`)
    }
    else {
      console.error('测试唤醒词失败:', result.error)
      message.error(`测试失败: ${result.error}`)
    }
  }
  catch (error) {
    console.error('测试唤醒词异常:', error)
    message.error('测试异常')
  }
  finally {
    loading.value = false
  }
}

// 组件挂载时加载配置
onMounted(() => {
  loadConfig()
})

defineExpose({ handleSave, handleCustomButton })
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <NFormItem label="启用唤醒词">
      <NSwitch v-model:value="enableWakeWord" :disabled="loading" />
    </NFormItem>
    <NFormItem label="唤醒词">
      <NInput
        v-model:value="wakeWord"
        placeholder="请输入唤醒词"
        :disabled="!enableWakeWord || loading"
      />
    </NFormItem>
    <NFormItem label="语言">
      <NSelect
        v-model:value="language"
        :options="languageOptions"
        :disabled="!enableWakeWord || loading"
      />
    </NFormItem>
    <NFormItem label="灵敏度（阈值）">
      <NInputNumber
        v-model:value="threshold"
        :min="0.1"
        :max="1.0"
        :step="0.05"
        :disabled="!enableWakeWord || loading"
      />
      <div style="margin-left: 8px; color: #888; font-size: 12px">
        值越小越灵敏，但误触发率越高
      </div>
    </NFormItem>
  </NForm>
</template>
