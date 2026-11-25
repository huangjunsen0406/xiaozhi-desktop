<script setup lang="ts">
import type { SettingsPanelHandle } from '../../types/settings'
import { NForm, NFormItem, NInput, NInputNumber, NSelect, NSwitch, useMessage } from 'naive-ui'
import { onMounted, reactive, ref } from 'vue'

const message = useMessage()
const loading = ref(false)

const form = reactive({
  enabled: true,
  greet: false,
  keyword: '小智',
  threshold: 0.2,
  language: 'zh',
})

const languageOptions = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
]

async function fetchConfig() {
  const config = await window.api.wakeWordGetConfig()
  form.enabled = config.enabled
  form.greet = config.greet ?? false
  form.keyword = config.keyword ?? ''
  form.threshold = config.threshold ?? 0.2
  form.language = config.language
}

async function loadConfig() {
  loading.value = true
  try {
    await fetchConfig()
  }
  catch (error) {
    console.error('加载唤醒词配置异常:', error)
    message.error(`加载配置异常: ${error instanceof Error ? error.message : '未知错误'}`)
  }
  finally {
    loading.value = false
  }
}

async function handleLanguageChange(newLanguage: string) {
  if (newLanguage === form.language)
    return
  loading.value = true
  try {
    await window.api.wakeWordUpdateConfig({ language: newLanguage })
    await fetchConfig()
  }
  catch (error) {
    console.error('切换语言异常:', error)
    message.error(`切换语言异常: ${error instanceof Error ? error.message : '未知错误'}`)
  }
  finally {
    loading.value = false
  }
}

async function handleSave() {
  loading.value = true
  try {
    await window.api.wakeWordUpdateConfig({
      enabled: form.enabled,
      greet: form.greet,
      keyword: form.keyword,
      threshold: form.threshold,
      language: form.language,
    })
    message.success('保存成功')
  }
  finally {
    loading.value = false
  }
}

async function testWakeWord() {
  loading.value = true
  try {
    const keyword = await window.api.wakeWordTest()
    message.success(keyword ? `测试成功！模拟检测到唤醒词: ${keyword}` : '测试成功！')
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadConfig()
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
      <NSwitch v-model:value="form.enabled" :disabled="loading" />
    </NFormItem>
    <NFormItem label="唤醒后问候">
      <div style="display: flex; align-items: center; gap: 8px">
        <NSwitch v-model:value="form.greet" :disabled="!form.enabled || loading" />
        <span style="color: #999; font-size: 12px">
          关闭时唤醒后只进入聆听；开启后小智会主动打招呼
        </span>
      </div>
    </NFormItem>
    <NFormItem label="唤醒词">
      <div class="wake-word-field">
        <NInput
          v-model:value="form.keyword"
          :placeholder="form.language === 'en' ? 'e.g. Hello Moss' : '例如 你好小智'"
          :disabled="!form.enabled || loading"
          :maxlength="form.language === 'en' ? 40 : 12"
        />
        <p class="wake-word-hint">
          中文模型只能用汉字（如「你好小智」），英文模型只能用字母。中英混写（如「你好moss」）会导致无法启动。
        </p>
      </div>
    </NFormItem>
    <NFormItem label="语言">
      <NSelect
        :value="form.language"
        :options="languageOptions"
        :disabled="!form.enabled || loading"
        @update:value="handleLanguageChange"
      />
    </NFormItem>
    <NFormItem label="灵敏度（阈值）">
      <NInputNumber
        v-model:value="form.threshold"
        :min="0.1"
        :max="1.0"
        :step="0.05"
        :disabled="!form.enabled || loading"
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
