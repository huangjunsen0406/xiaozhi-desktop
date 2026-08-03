<script setup lang="ts">
import { NButton, NForm, NFormItem, NSwitch, useMessage } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'

const message = useMessage()
const loading = ref(false)
const demoLoading = ref(false)

/** 总开关 */
const enabled = ref(true)
/** 提醒类型 */
const water = ref(true)
const walk = ref(true)
const eyes = ref(true)
const sleep = ref(true)

/** 类型开关在总关时禁用（视觉） */
const typesDisabled = computed(() => !enabled.value || loading.value)

/**
 * 加载配置
 */
async function loadConfig(): Promise<void> {
  try {
    loading.value = true
    const config = await window.api.careReminderGetConfig()
    enabled.value = config.enabled
    water.value = config.water
    walk.value = config.walk
    eyes.value = config.eyes
    sleep.value = config.sleep
  }
  catch (error) {
    console.error('加载关怀提醒配置失败', error)
    message.error(`加载失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
  finally {
    loading.value = false
  }
}

/**
 * 保存配置（热生效：主进程重建调度）
 */
async function handleSave(): Promise<void> {
  try {
    loading.value = true
    await window.api.careReminderUpdateConfig({
      enabled: enabled.value,
      water: water.value,
      walk: walk.value,
      eyes: eyes.value,
      sleep: sleep.value,
    })
    message.success('保存成功')
  }
  catch (error) {
    console.error('保存关怀提醒配置失败', error)
    message.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
  finally {
    loading.value = false
  }
}

/**
 * 演示一轮：water → walk → eyes → sleep，各约 5 秒
 * 再次点击会从 water 重开
 */
async function handleDemo(): Promise<void> {
  try {
    demoLoading.value = true
    const result = await window.api.careReminderDemo()
    if (result.started)
      message.success(result.message)
    else
      message.warning(result.message)
  }
  catch (error) {
    console.error('启动关怀提醒演示失败', error)
    message.error(`演示失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
  finally {
    demoLoading.value = false
  }
}

onMounted(() => {
  void loadConfig()
})

defineExpose({
  handleSave,
})
</script>

<template>
  <div class="care-reminder-settings">
    <NForm label-placement="left" label-width="140" :disabled="loading">
      <div class="section-title">
        桌宠提醒
      </div>

      <NFormItem label="开启关怀提醒">
        <NSwitch v-model:value="enabled" />
      </NFormItem>

      <div class="demo-row">
        <NButton
          size="small"
          secondary
          :loading="demoLoading"
          :disabled="loading"
          @click="handleDemo"
        >
          演示一轮
        </NButton>
        <p class="hint demo-hint">
          依次预览四类提醒文案，各约 5 秒
        </p>
      </div>

      <div class="section-title subsection">
        提醒类型
      </div>

      <NFormItem label="喝水">
        <NSwitch v-model:value="water" :disabled="typesDisabled" />
      </NFormItem>
      <NFormItem label="起来活动">
        <NSwitch v-model:value="walk" :disabled="typesDisabled" />
      </NFormItem>
      <NFormItem label="用眼休息">
        <NSwitch v-model:value="eyes" :disabled="typesDisabled" />
      </NFormItem>
      <NFormItem label="休息睡觉（夜间）">
        <NSwitch v-model:value="sleep" :disabled="typesDisabled" />
      </NFormItem>

      <p class="hint">
        仅桌宠模式展示，不写入对话、无声音
      </p>
    </NForm>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--n-text-color);
}

.section-title.subsection {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 500;
  opacity: 0.9;
}

.demo-row {
  margin: -4px 0 16px 140px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--n-text-color-3, #999);
}

.demo-hint {
  margin: 0;
}
</style>
