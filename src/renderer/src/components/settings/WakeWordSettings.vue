<script setup lang="ts">
import type { SettingsPanelHandle } from '../../types/settings'
import { NForm, NFormItem, NInput, NInputNumber, NSelect, NSwitch, useMessage } from 'naive-ui'
import { onMounted, ref, watch } from 'vue'

const message = useMessage()
const loading = ref(false)

const isUpdatingLanguage = ref(false)

// 配置项
const enableWakeWord = ref(true)
const greetOnWake = ref(false)
const wakeWord = ref('小智')
const threshold = ref(0.2)
const language = ref('zh')

const languageOptions = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
]

// 监听语言变化，自动切换唤醒词
watch(language, async (newLanguage, oldLanguage) => {
  // 避免初始化触发和递归触发
  if (newLanguage !== oldLanguage && oldLanguage !== undefined && !isUpdatingLanguage.value) {
    console.log('语言切换:', oldLanguage, '->', newLanguage)
    try {
      loading.value = true
      isUpdatingLanguage.value = true

      // 先保存语言切换到后端
      await window.api.wakeWordUpdateConfig({
        language: newLanguage,
      })

      // 重新加载配置以获取对应语言的唤醒词
      await loadConfig()
    }
    catch (error) {
      console.error('切换语言异常:', error)
      message.error(`切换语言异常: ${error instanceof Error ? error.message : '未知错误'}`)
    }
    finally {
      loading.value = false
      isUpdatingLanguage.value = false
    }
  }
})

/**
 * 加载配置
 */
async function loadConfig() {
  try {
    loading.value = true
    const config = await window.api.wakeWordGetConfig()
    enableWakeWord.value = config.enabled
    greetOnWake.value = config.greet ?? false
    wakeWord.value = config.keyword ?? ''
    threshold.value = config.threshold ?? 0.2
    language.value = config.language
  }
  catch (error) {
    console.error('加载唤醒词配置异常:', error)
    message.error(`加载配置异常: ${error instanceof Error ? error.message : '未知错误'}`)
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

    await window.api.wakeWordUpdateConfig({
      enabled: enableWakeWord.value,
      greet: greetOnWake.value,
      keyword: wakeWord.value,
      threshold: threshold.value,
      language: language.value,
    })

    message.success('保存成功')
  }
  catch (error) {
    console.error('保存唤醒词配置异常:', error)
    message.error(`保存异常: ${error instanceof Error ? error.message : '未知错误'}`)
  }
  finally {
    loading.value = false
  }
}

/**
 * 测试唤醒词
 */
async function testWakeWord() {
  try {
    loading.value = true

    const keyword = await window.api.wakeWordTest()
    message.success(keyword ? `测试成功！模拟检测到唤醒词: ${keyword}` : '测试成功！')
  }
  catch (error) {
    console.error('测试唤醒词异常:', error)
    message.error(`测试异常: ${error instanceof Error ? error.message : '未知错误'}`)
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  loadConfig()
})

const panel = {
  persistence: 'explicit',
  save: handleSave,
  actions: { testWakeWord: { label: '测试', run: testWakeWord } },
} satisfies SettingsPanelHandle

defineExpose(panel)
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <NFormItem label="启用唤醒词">
      <NSwitch v-model:value="enableWakeWord" :disabled="loading" />
    </NFormItem>
    <NFormItem label="唤醒后问候">
      <div style="display: flex; align-items: center; gap: 8px">
        <NSwitch v-model:value="greetOnWake" :disabled="!enableWakeWord || loading" />
        <span style="color: #999; font-size: 12px">
          关闭时唤醒后只进入聆听；开启后小智会主动打招呼
        </span>
      </div>
    </NFormItem>
    <NFormItem label="唤醒词">
      <div class="wake-word-field">
        <NInput
          v-model:value="wakeWord"
          :placeholder="language === 'en' ? 'e.g. Hello Moss' : '例如 你好小智'"
          :disabled="!enableWakeWord || loading"
          :maxlength="language === 'en' ? 40 : 12"
        />
        <p class="wake-word-hint">
          中文模型只能用汉字（如「你好小智」），英文模型只能用字母。中英混写（如「你好moss」）会导致无法启动。
        </p>
      </div>
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

<style scoped>
.wake-word-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.wake-word-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #999;
}
</style>
