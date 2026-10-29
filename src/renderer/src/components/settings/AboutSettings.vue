<script setup lang="ts">
/**
 * 关于页：应用介绍 + 应用内更新
 * 布局与系统选项 / 关怀等页一致：NForm 左标签
 */
import type { UpdateCheckResult, UpdateDownloadProgress } from '@shared/types'
import type { SettingsPanelHandle } from '../../types/settings'
import { stripReleaseNotesHtml } from '@shared/releaseNotes'
import { NButton, NForm, NFormItem, NProgress, NSpace, NSwitch, useDialog, useMessage } from 'naive-ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const message = useMessage()
const dialog = useDialog()
const resetting = ref(false)

const appVersion = ref('')
const isPackaged = ref(false)
const updateAutoCheck = ref(true)
const updateChecking = ref(false)
const updateInstalling = ref(false)
const updateInfo = ref<UpdateCheckResult | null>(null)
const updateError = ref('')
const downloadPct = ref(0)
const downloadLabel = ref('')
const processVersions = ref<{ electron?: string, chrome?: string, node?: string }>({})
const analyticsAvailable = ref(false)
const analyticsEnabled = ref(false)
const releaseNotesText = computed(() => stripReleaseNotesHtml(updateInfo.value?.releaseNotes))

let offProgress: (() => void) | null = null
let offDownloaded: (() => void) | null = null
let offError: (() => void) | null = null

async function loadUpdateState() {
  try {
    const status = await window.api.updateGetStatus()
    appVersion.value = status.currentVersion
    isPackaged.value = status.isPackaged
    updateAutoCheck.value = status.prefs.autoCheck
    if (status.lastCheck) {
      updateInfo.value = status.lastCheck
    }
    else if (status.prefs.availableVersion) {
      updateInfo.value = {
        available: true,
        currentVersion: status.currentVersion,
        version: status.prefs.availableVersion,
        releaseNotes: '',
      }
    }
  }
  catch (error) {
    console.warn('加载更新状态失败', error)
  }
}

async function loadAnalyticsState() {
  try {
    const status = await window.api.analyticsGetStatus()
    analyticsAvailable.value = status.available
    analyticsEnabled.value = status.enabled
  }
  catch (error) {
    console.warn('加载分析状态失败', error)
  }
}

async function toggleAnalyticsEnabled(v: boolean) {
  try {
    const status = await window.api.analyticsSetEnabled(v)
    analyticsEnabled.value = status.enabled
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '设置失败')
    analyticsEnabled.value = !v
  }
}

async function toggleUpdateAutoCheck(v: boolean) {
  try {
    const prefs = await window.api.updateSetAutoCheck(v)
    updateAutoCheck.value = prefs.autoCheck
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '设置失败')
    updateAutoCheck.value = !v
  }
}

async function handleCheckUpdate() {
  updateChecking.value = true
  updateError.value = ''
  try {
    const info = await window.api.updateCheck()
    updateInfo.value = info
    if (info.available) {
      message.success(`发现新版本 v${info.version}`)
    }
    else if (info.skipped) {
      message.info(`已忽略 v${info.version}，当前 v${info.currentVersion}`)
    }
    else if (!isPackaged.value) {
      message.info(`开发态不检查远程更新（当前 v${info.currentVersion}）`)
    }
    else {
      message.success(`当前已是最新版本 v${info.currentVersion}`)
    }
  }
  catch (error) {
    updateError.value = error instanceof Error ? error.message : String(error)
    message.error(updateError.value)
  }
  finally {
    updateChecking.value = false
  }
}

async function handleInstallUpdate() {
  if (!updateInfo.value?.available)
    return
  updateInstalling.value = true
  updateError.value = ''
  downloadPct.value = 0
  downloadLabel.value = '正在准备下载…'
  try {
    await window.api.updateCheckDownloadInstall()
  }
  catch (error) {
    updateError.value = error instanceof Error ? error.message : String(error)
    message.error(`${updateError.value}（可打开官网手动下载）`)
    updateInstalling.value = false
    downloadLabel.value = ''
  }
}

async function handleSkipVersion() {
  if (!updateInfo.value?.version)
    return
  try {
    await window.api.updateSkipVersion(updateInfo.value.version)
    message.info(`已忽略 v${updateInfo.value.version}`)
    updateInfo.value = {
      ...updateInfo.value,
      available: false,
      skipped: true,
    }
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '操作失败')
  }
}

async function handleOpenReleases() {
  try {
    await window.api.updateOpenReleases()
  }
  catch {
    message.error('无法打开浏览器')
  }
}

async function handleOpenRepo() {
  try {
    await window.api.updateOpenRepo()
  }
  catch {
    message.error('无法打开浏览器')
  }
}

function handleResetUserData() {
  dialog.warning({
    title: '清除本地配置',
    content: '将删除本机数据库、唤醒词、日志和缓存，应用会立即重启。卸载重装不会清这些数据。对话记录也会一并删除。',
    positiveText: '清除并重启',
    negativeText: '取消',
    onPositiveClick: async () => {
      resetting.value = true
      try {
        await window.api.resetUserData()
      }
      catch (error) {
        resetting.value = false
        message.error(error instanceof Error ? error.message : '清除失败')
      }
    },
  })
}

onMounted(() => {
  try {
    processVersions.value = window.api.getProcessVersions?.() || {}
  }
  catch { /* ignore */ }

  loadUpdateState()
  loadAnalyticsState()
  offProgress = window.api.updateOnDownloadProgress((p: UpdateDownloadProgress) => {
    downloadPct.value = Math.min(99, Math.round(p.percent))
    const mb = (p.transferred / 1024 / 1024).toFixed(1)
    const totalMb = p.total > 0 ? (p.total / 1024 / 1024).toFixed(1) : '?'
    downloadLabel.value = `下载中 ${downloadPct.value}% · ${mb}/${totalMb} MB`
  })
  offDownloaded = window.api.updateOnDownloaded(() => {
    downloadPct.value = 100
    downloadLabel.value = '下载完成，正在安装并重启…'
  })
  offError = window.api.updateOnError((payload) => {
    updateInstalling.value = false
    downloadLabel.value = ''
    updateError.value = payload.message
    message.error(payload.message)
  })
})

onUnmounted(() => {
  offProgress?.()
  offDownloaded?.()
  offError?.()
})

const panel = {
  persistence: 'immediate',
} satisfies SettingsPanelHandle

defineExpose(panel)
</script>

<template>
  <div class="about-settings min-h-0">
    <NForm label-placement="left" :label-width="140">
      <div class="section-title">
        应用信息
      </div>

      <NFormItem label="应用名称">
        <span class="field-text">小智桌面</span>
      </NFormItem>

      <NFormItem label="当前版本">
        <span class="field-text">
          v{{ appVersion || '…' }}
          <span v-if="!isPackaged" class="hint-inline">（开发态）</span>
        </span>
      </NFormItem>

      <NFormItem label="作者">
        <NButton text type="primary" @click="handleOpenRepo">
          huangjunsen
        </NButton>
      </NFormItem>

      <NFormItem label="简介">
        <p class="field-desc">
          基于 Electron + Vue 的智能桌面助手，支持语音对话、Live2D / 精灵宠物、MCP 工具与系统能力扩展。
        </p>
      </NFormItem>

      <NFormItem label="运行环境">
        <span class="field-text muted">
          Electron {{ processVersions.electron || '—' }}
          · Chrome {{ processVersions.chrome || '—' }}
          · Node {{ processVersions.node || '—' }}
        </span>
      </NFormItem>

      <NFormItem label="发布页">
        <NButton size="small" secondary @click="handleOpenReleases">
          打开官网
        </NButton>
      </NFormItem>

      <div class="section-title subsection">
        使用数据
      </div>

      <NFormItem label="分享使用数据">
        <div class="analytics-row">
          <NSwitch
            :value="analyticsEnabled"
            :disabled="!analyticsAvailable"
            @update:value="toggleAnalyticsEnabled"
          />
          <p v-if="analyticsAvailable" class="hint">
            仅统计启动/退出时长与显示模式等匿名使用情况，不含对话内容。用于改进产品。
          </p>
          <p v-else class="hint">
            此版本未启用使用数据统计。
          </p>
        </div>
      </NFormItem>

      <div class="section-title subsection">
        应用更新
      </div>

      <NFormItem label="启动时检查更新">
        <NSwitch
          :value="updateAutoCheck"
          @update:value="toggleUpdateAutoCheck"
        />
      </NFormItem>

      <NFormItem label="检查与安装">
        <div class="update-actions">
          <NSpace>
            <NButton
              size="small"
              :loading="updateChecking"
              :disabled="updateInstalling"
              @click="handleCheckUpdate"
            >
              检查更新
            </NButton>
            <NButton
              v-if="updateInfo?.available"
              type="primary"
              size="small"
              :loading="updateInstalling"
              @click="handleInstallUpdate"
            >
              下载并安装 v{{ updateInfo.version }}
            </NButton>
            <NButton
              v-if="updateInfo?.available"
              size="small"
              quaternary
              :disabled="updateInstalling"
              @click="handleSkipVersion"
            >
              忽略此版本
            </NButton>
          </NSpace>

          <p
            v-if="updateInfo?.available && !updateInstalling"
            class="hint"
          >
            发现新版本 v{{ updateInfo.version }}（当前 v{{ updateInfo.currentVersion }}）
          </p>
          <p
            v-if="releaseNotesText && updateInfo?.available"
            class="hint notes"
          >
            {{ releaseNotesText }}
          </p>

          <div v-if="updateInstalling" class="progress-block">
            <NProgress
              type="line"
              :percentage="downloadPct"
              indicator-placement="inside"
              processing
            />
            <p class="hint">
              {{ downloadLabel }}
            </p>
          </div>

          <p v-if="updateError" class="hint error">
            {{ updateError }}
          </p>

          <p class="hint">
            通过官网分发安装包；应用内更新需能访问更新通道。开发态不检查远程。
          </p>
        </div>
      </NFormItem>

      <div class="section-title subsection">
        本地数据
      </div>

      <NFormItem label="清除本地配置">
        <div class="update-actions">
          <NButton
            size="small"
            type="error"
            ghost
            :loading="resetting"
            @click="handleResetUserData"
          >
            清除并重启
          </NButton>
          <p class="hint">
            改唤醒词后打不开、卸载重装仍异常时用这个。配置在用户数据目录，不随卸载删除。打不开时也可在终端加参数启动：
            <code>--reset-data</code>
          </p>
        </div>
      </NFormItem>
    </NForm>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  margin-bottom: 12px;
  margin-top: 4px;
}

.section-title.subsection {
  margin-top: 20px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

:global(.dark) .section-title {
  color: #aaa;
}

:global(.dark) .section-title.subsection {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.field-text {
  font-size: 14px;
  color: inherit;
  line-height: 1.5;
}

.field-text.muted {
  color: #666;
  font-size: 13px;
}

:global(.dark) .field-text.muted {
  color: #999;
}

.field-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #666;
  max-width: 420px;
}

:global(.dark) .field-desc {
  color: #999;
}

.hint-inline {
  margin-left: 6px;
  font-size: 12px;
  color: #999;
}

.update-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 420px;
}

.analytics-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 420px;
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #999;
}

.hint.notes {
  max-height: 96px;
  overflow-y: auto;
  white-space: pre-wrap;
}

.hint.error {
  color: #e34d59;
}

.progress-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
