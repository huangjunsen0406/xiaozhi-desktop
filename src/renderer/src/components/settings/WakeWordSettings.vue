<script setup lang="ts">
import { NButton, NForm, NFormItem, NInput, NInputNumber, NSelect, NSpace, NSwitch } from 'naive-ui'
import { ref } from 'vue'

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

function handleSave() {
  // TODO: 实现保存逻辑
  console.log('保存唤醒词设置', {
    enableWakeWord: enableWakeWord.value,
    wakeWord: wakeWord.value,
    sensitivity: sensitivity.value,
    language: language.value,
  })
}

function handleTest() {
  // TODO: 实现测试唤醒词功能
  console.log('测试唤醒词')
}
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
    <NSpace justify="end">
      <NButton secondary :disabled="!enableWakeWord" @click="handleTest">
        <template #icon>
          <icon-carbon-send-alt class="w-4 h-4" />
        </template>
        测试
      </NButton>
      <NButton type="primary" @click="handleSave">
        <template #icon>
          <icon-carbon-save class="w-4 h-4" />
        </template>
        保存
      </NButton>
    </NSpace>
  </NForm>
</template>
