<script setup lang="ts">
import { NForm, NFormItem, NInput, NInputNumber, NSelect, NSwitch } from 'naive-ui'
import { ref } from 'vue'

const message = useMessage()
const enableWakeWord = ref(true)
const wakeWord = ref('小智')
const sensitivity = ref(0.5)
const language = ref('zh-CN')

const languageOptions = [
  { label: '中文（简体）', value: 'zh-CN' },
  { label: '中文（繁体）', value: 'zh-TW' },
  { label: 'English', value: 'en-US' },
  { label: '日本語', value: 'ja-JP' },
]

async function handleSave() {
  console.log('保存唤醒词设置', {
    enableWakeWord: enableWakeWord.value,
    wakeWord: wakeWord.value,
    sensitivity: sensitivity.value,
    language: language.value,
  })
  message.success('保存唤醒词设置')
}

async function handleCustomButton() {
  // 自定义：测试唤醒词
  console.log('测试唤醒词')
  message.success('测试唤醒词')
}

defineExpose({ handleSave, handleCustomButton })
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <NFormItem label="启用唤醒词">
      <NSwitch v-model:value="enableWakeWord" />
    </NFormItem>
    <NFormItem label="唤醒词" :disabled="!enableWakeWord">
      <NInput v-model:value="wakeWord" placeholder="请输入唤醒词" :disabled="!enableWakeWord" />
    </NFormItem>
    <NFormItem label="语言" :disabled="!enableWakeWord">
      <NSelect
        v-model:value="language"
        :options="languageOptions"
        :disabled="!enableWakeWord"
      />
    </NFormItem>
    <NFormItem label="灵敏度" :disabled="!enableWakeWord">
      <NInputNumber
        v-model:value="sensitivity"
        :min="0.1"
        :max="1.0"
        :step="0.1"
        :disabled="!enableWakeWord"
      />
    </NFormItem>
  </NForm>
</template>
