<script setup lang="ts">
import type { McpInstalledPlugin, McpToolCatalogItem } from '@shared/types'
import { NButton, NCheckbox, NEmpty, NPopconfirm, NSpin, NSwitch, useMessage } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import IconCarbonAdd from '~icons/carbon/add'
import IconCarbonFolder from '~icons/carbon/folder'
import IconCarbonRenew from '~icons/carbon/renew'
import IconCarbonTrashCan from '~icons/carbon/trash-can'

const message = useMessage()

/** 服务端 catalog */
const catalog = ref<McpToolCatalogItem[]>([])
const installedPlugins = ref<McpInstalledPlugin[]>([])
/** 本地开关状态：toolName → enabled（true=启用） */
const localEnabled = ref<Record<string, boolean>>({})
/** 上次保存的禁用集合，用于 dirty 判断 */
const savedDisabled = ref<Set<string>>(new Set())

const loading = ref(false)
const importing = ref(false)
const refreshing = ref(false)
/** 外挂是否可使用应用内媒体播放 SDK */
const mediaPlayerAllowed = ref(false)
const mediaPlayerSaving = ref(false)
const subtitleAllowed = ref(false)
const subtitleSaving = ref(false)

interface ToolGroup {
  /** 稳定 key（pluginId 或 builtin domain） */
  key: string
  /** 展示标题 */
  name: string
  tools: McpToolCatalogItem[]
}

const groups = computed<ToolGroup[]>(() => {
  // 按 groupKey 归组，避免不同插件同展示名或同 tool 前缀被并到一组
  const map = new Map<string, McpToolCatalogItem[]>()
  for (const item of catalog.value) {
    const key = item.groupKey || item.pluginId || item.group
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return Array.from(map.entries()).map(([key, tools]) => ({
    key,
    name: tools[0]?.group || key,
    tools,
  }))
})

function isEnabled(name: string): boolean {
  if (name in localEnabled.value)
    return localEnabled.value[name]
  return true
}

function groupStats(group: ToolGroup): { on: number, total: number } {
  const total = group.tools.length
  const on = group.tools.filter(t => isEnabled(t.name)).length
  return { on, total }
}

/**
 * 组头 Switch：仅当组内全部启用为 on；混合/全关为 off
 * 打开 → 全选子项；关闭 → 全不选（真相在子项勾选）
 */
function isGroupAllEnabled(group: ToolGroup): boolean {
  return group.tools.length > 0 && group.tools.every(t => isEnabled(t.name))
}

async function loadInstalledPlugins() {
  installedPlugins.value = await window.api.mcpToolsGetInstalled()
}

function pluginStatusLabel(plugin: McpInstalledPlugin): string {
  return plugin.status === 'loaded' ? `已加载 · ${plugin.toolCount} 个工具` : plugin.status === 'skipped' ? '未加载' : '加载失败'
}

function applyCatalog(items: McpToolCatalogItem[]) {
  catalog.value = items
  const enabledMap: Record<string, boolean> = {}
  const disabled = new Set<string>()
  for (const item of items) {
    enabledMap[item.name] = item.enabled
    if (!item.enabled)
      disabled.add(item.name)
  }
  localEnabled.value = enabledMap
  savedDisabled.value = disabled
}

async function loadCatalog() {
  loading.value = true
  try {
    let items = await window.api.mcpToolsGetCatalog()
    // 启动早期偶发空列表：短延迟后重试一次
    if (items.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 400))
      items = await window.api.mcpToolsGetCatalog()
    }
    applyCatalog(items)
    await loadInstalledPlugins()

    try {
      const cfg = await window.api.mcpToolsGetPluginsConfig()
      mediaPlayerAllowed.value = cfg.allowHostGet.includes('media_player')
      subtitleAllowed.value = cfg.allowHostGet.includes('subtitle')
    }
    catch (cfgErr) {
      console.warn('读取外挂 Host 配置失败', cfgErr)
    }
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '加载 MCP 工具失败')
  }
  finally {
    loading.value = false
  }
}

/**
 * 开关：允许外挂使用应用内媒体播放（host.get('media_player')）
 */
async function handleMediaPlayerAllow(enabled: boolean) {
  mediaPlayerSaving.value = true
  try {
    const cfg = await window.api.mcpToolsGetPluginsConfig()
    const set = new Set(cfg.allowHostGet.filter(k => k !== 'media_player'))
    set.add('logger')
    set.add('config_readonly')
    if (enabled) {
      set.add('media_player')
    }
    const next = await window.api.mcpToolsSetPluginsConfig({
      allowHostGet: Array.from(set),
    })
    mediaPlayerAllowed.value = next.allowHostGet.includes('media_player')
    // 重载后刷新 catalog（新工具可能出现）
    const items = await window.api.mcpToolsGetCatalog()
    const prev = { ...localEnabled.value }
    applyCatalog(items)
    await loadInstalledPlugins()
    const merged = { ...localEnabled.value }
    for (const [k, v] of Object.entries(prev)) {
      if (k in merged)
        merged[k] = v
    }
    localEnabled.value = merged
    message.success(
      enabled
        ? '已允许外挂使用应用内播放（media_player）'
        : '已关闭外挂应用内播放权限',
    )
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败')
    // 回滚 UI
    mediaPlayerAllowed.value = !enabled
  }
  finally {
    mediaPlayerSaving.value = false
  }
}

async function handleSubtitleAllow(enabled: boolean) {
  subtitleSaving.value = true
  try {
    const cfg = await window.api.mcpToolsGetPluginsConfig()
    const allowHostGet = cfg.allowHostGet.filter(k => k !== 'subtitle')
    if (enabled)
      allowHostGet.push('subtitle')
    const next = await window.api.mcpToolsSetPluginsConfig({ allowHostGet })
    await loadInstalledPlugins()
    subtitleAllowed.value = next.allowHostGet.includes('subtitle')
    message.success(enabled ? '已允许外挂显示字幕' : '已关闭外挂字幕权限')
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '保存字幕权限失败')
    // 配置可能已经保存：重新读取实际状态，避免显示错误授权状态。
    const cfg = await window.api.mcpToolsGetPluginsConfig().catch(() => null)
    if (cfg)
      subtitleAllowed.value = cfg.allowHostGet.includes('subtitle')
  }
  finally {
    subtitleSaving.value = false
  }
}

function setToolEnabled(name: string, enabled: boolean) {
  localEnabled.value = { ...localEnabled.value, [name]: enabled }
}

function setGroupEnabled(group: ToolGroup, enabled: boolean) {
  const next = { ...localEnabled.value }
  for (const t of group.tools) {
    next[t.name] = enabled
  }
  localEnabled.value = next
}

function getDisabledNames(): string[] {
  return catalog.value
    .filter(t => !isEnabled(t.name))
    .map(t => t.name)
}

async function handleImport() {
  try {
    const result = await window.api.mcpToolsSelectFolder()
    if (result.canceled || !result.filePaths.length)
      return

    importing.value = true
    const imported = await window.api.mcpToolsImportPlugin(result.filePaths[0])
    message.success(`已导入插件：${imported.name}`)
    // 导入后刷新 catalog（服务端已 reload）
    const items = await window.api.mcpToolsGetCatalog()
    // 保留本地未保存的开关；新工具默认跟随服务端 enabled
    const prev = { ...localEnabled.value }
    applyCatalog(items)
    await loadInstalledPlugins()
    // 合并：已有本地键优先
    const merged = { ...localEnabled.value }
    for (const [k, v] of Object.entries(prev)) {
      if (k in merged)
        merged[k] = v
    }
    localEnabled.value = merged
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '导入插件失败')
  }
  finally {
    importing.value = false
  }
}

async function handleOpenFolder() {
  try {
    await window.api.mcpToolsOpenFolder()
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '打开目录失败')
  }
}

async function handleRefresh() {
  refreshing.value = true
  try {
    const items = await window.api.mcpToolsRefresh()
    applyCatalog(items)
    await loadInstalledPlugins()
    const failures = installedPlugins.value.filter(plugin => plugin.status === 'failed').length
    if (failures)
      message.warning(`已刷新，${failures} 个插件加载失败，请查看插件状态`)
    else
      message.success('已刷新工具列表')
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '刷新失败')
  }
  finally {
    refreshing.value = false
  }
}

const deletingPluginId = ref<string | null>(null)

/**
 * 删除已导入外挂：卸工具 + 删目录，刷新 catalog
 */
async function handleDeletePlugin(directoryName: string) {
  try {
    deletingPluginId.value = directoryName
    const items = await window.api.mcpToolsDeletePlugin(directoryName)
    // 保留其它工具的本地未保存开关
    const prev = { ...localEnabled.value }
    applyCatalog(items)
    await loadInstalledPlugins()
    const merged = { ...localEnabled.value }
    for (const [k, v] of Object.entries(prev)) {
      if (k in merged)
        merged[k] = v
    }
    localEnabled.value = merged
    message.success('插件已删除')
  }
  catch (error) {
    message.error(error instanceof Error ? error.message : '删除插件失败')
  }
  finally {
    deletingPluginId.value = null
  }
}

/**
 * 重置：全部启用（清空本地禁用），不立即落盘
 */
async function handleCustomButton() {
  const next: Record<string, boolean> = {}
  for (const item of catalog.value) {
    next[item.name] = true
  }
  localEnabled.value = next
  message.info('已重置为全部启用，请点击保存生效')
}

/**
 * 保存：DISABLED 落盘 + reconnectKeepingIdle
 */
async function handleSave() {
  const disabled = getDisabledNames()
  // 错误由 SettingsView 底栏统一 toast，避免双重提示
  const result = await window.api.mcpToolsSaveDisabled(disabled)
  savedDisabled.value = new Set(result.disabled)
  // 同步 local 与 saved
  const next: Record<string, boolean> = {}
  for (const item of catalog.value) {
    next[item.name] = !result.disabled.includes(item.name)
  }
  localEnabled.value = next
  message.success(
    result.reconnected
      ? '已保存，工具列表将在重连后对云端生效'
      : '已保存（当前无活跃连接，下次连接生效）',
  )
}

onMounted(() => {
  loadCatalog()
})

defineExpose({
  handleSave,
  handleCustomButton,
})
</script>

<template>
  <div class="mcp-tools-settings min-h-0">
    <!-- 顶栏：导入 / 打开目录 / 刷新（改回修改前布局） -->
    <div class="toolbar mb-4">
      <NButton type="primary" size="small" :loading="importing" @click="handleImport">
        <template #icon>
          <IconCarbonAdd class="w-4 h-4" />
        </template>
        {{ importing ? '导入中...' : '导入插件' }}
      </NButton>
      <NButton quaternary size="small" @click="handleOpenFolder">
        <template #icon>
          <IconCarbonFolder class="w-4 h-4" />
        </template>
        打开目录
      </NButton>
      <NButton quaternary size="small" :loading="refreshing" @click="handleRefresh">
        <template #icon>
          <IconCarbonRenew class="w-4 h-4" />
        </template>
        刷新
      </NButton>
    </div>

    <!-- 外挂 Host：应用内媒体播放（改回卡片样式） -->
    <div class="media-card mb-4">
      <div class="media-card-text min-w-0 flex-1">
        <div class="media-card-title">
          允许外挂使用应用内播放
        </div>
        <div class="media-card-desc">
          开启后，可信 in-process 插件可通过 host.get('media_player') 播放 URL（与内置音乐同一通路）。仅安装可信插件。
        </div>
      </div>
      <NSwitch
        :value="mediaPlayerAllowed"
        :loading="mediaPlayerSaving"
        :disabled="subtitleSaving"
        size="small"
        class="shrink-0"
        @update:value="handleMediaPlayerAllow"
      />
    </div>

    <div class="media-card mb-4">
      <div class="media-card-text min-w-0 flex-1">
        <div class="media-card-title">
          允许外挂显示字幕
        </div>
        <div class="media-card-desc">
          在精灵宠物或 Live2D 旁显示字幕和消息，不保存到聊天记录。更改后立即生效。
        </div>
      </div>
      <NSwitch :value="subtitleAllowed" :loading="subtitleSaving" :disabled="mediaPlayerSaving" size="small" class="shrink-0" @update:value="handleSubtitleAllow" />
    </div>

    <div v-if="installedPlugins.length" class="mb-4">
      <div class="section-title subsection">
        已安装插件
      </div>
      <div v-for="plugin in installedPlugins" :key="plugin.directoryName" class="media-card mb-2">
        <div class="min-w-0 flex-1">
          <div class="media-card-title">
            {{ plugin.name }} <span class="text-sm">{{ plugin.version ? `v${plugin.version}` : '' }}</span>
          </div>
          <div class="media-card-desc">
            {{ pluginStatusLabel(plugin) }}
          </div>
          <div v-if="plugin.reason" class="text-sm break-all" :class="plugin.status === 'failed' ? 'text-red-500' : 'text-gray-500'">
            {{ plugin.reason }}
          </div>
        </div>
        <NPopconfirm positive-text="删除" negative-text="取消" @positive-click="handleDeletePlugin(plugin.directoryName)">
          <template #trigger>
            <NButton text type="error" size="small" :loading="deletingPluginId === plugin.directoryName">
              <template #icon>
                <IconCarbonTrashCan class="w-4 h-4" />
              </template>
              删除
            </NButton>
          </template>
          确定删除插件「{{ plugin.name }}」？将卸载工具并删除本地插件目录。
        </NPopconfirm>
      </div>
    </div>

    <div class="section-title subsection">
      工具列表
    </div>

    <NSpin :show="loading">
      <div v-if="groups.length > 0" class="group-list">
        <div
          v-for="group in groups"
          :key="group.key"
          class="tool-group"
        >
          <div class="group-header">
            <div class="group-title min-w-0">
              <span class="group-name truncate">{{ group.name }}</span>
              <span class="group-count">
                {{ groupStats(group).on }}/{{ groupStats(group).total }}
              </span>
            </div>
            <div class="group-actions shrink-0">
              <NSwitch
                :value="isGroupAllEnabled(group)"
                size="small"
                @update:value="(v: boolean) => setGroupEnabled(group, v)"
              />
            </div>
          </div>

          <div class="tool-rows">
            <div
              v-for="tool in group.tools"
              :key="tool.name"
              class="tool-row"
              @click="setToolEnabled(tool.name, !isEnabled(tool.name))"
            >
              <div class="tool-meta min-w-0 flex-1">
                <div class="tool-label-line">
                  <span class="tool-label truncate">{{ tool.label }}</span>
                  <span v-if="tool.source === 'plugin'" class="tag-plugin">
                    外挂
                  </span>
                </div>
                <div class="tool-id truncate">
                  {{ tool.name }}
                </div>
              </div>
              <NCheckbox
                class="shrink-0"
                :checked="isEnabled(tool.name)"
                @click.stop
                @update:checked="(v: boolean) => setToolEnabled(tool.name, v)"
              />
            </div>
          </div>
        </div>
      </div>

      <NEmpty
        v-else-if="!loading"
        description="暂无 MCP 工具"
        class="mt-6"
      >
        <template #extra>
          <div class="empty-hint">
            <p>内置工具将在应用启动后出现在此列表。</p>
            <p>也可通过「导入插件」加载外挂（需含 manifest.json）。</p>
          </div>
        </template>
      </NEmpty>
    </NSpin>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.media-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
}

:global(.dark) .media-card {
  border-color: rgba(255, 255, 255, 0.12);
}

.media-card-title {
  font-size: 14px;
  font-weight: 500;
  color: inherit;
  line-height: 1.4;
}

.media-card-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: #999;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  margin-bottom: 12px;
}

.section-title.subsection {
  margin-top: 4px;
  margin-bottom: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

:global(.dark) .section-title {
  color: #aaa;
}

:global(.dark) .section-title.subsection {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tool-group {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  padding-bottom: 4px;
}

.tool-group:last-child {
  border-bottom: none;
}

:global(.dark) .tool-group {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0 8px;
}

.group-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.group-name {
  font-size: 14px;
  font-weight: 500;
  color: inherit;
}

.group-count {
  font-size: 12px;
  color: #999;
}

.group-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-rows {
  display: flex;
  flex-direction: column;
}

.tool-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  cursor: pointer;
}

:global(.dark) .tool-row {
  border-top-color: rgba(255, 255, 255, 0.06);
}

.tool-row:hover {
  /* 轻微 hover，与表单页一致 */
  opacity: 0.92;
}

.tool-label-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-label {
  font-size: 14px;
  color: inherit;
}

.tool-id {
  margin-top: 2px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #999;
}

.tag-plugin {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  color: #2080f0;
  background: rgba(32, 128, 240, 0.08);
}

:global(.dark) .tag-plugin {
  background: rgba(32, 128, 240, 0.18);
}

.empty-hint {
  text-align: center;
  font-size: 13px;
  line-height: 1.55;
  color: #999;
  max-width: 320px;
  margin: 0 auto;
}

.empty-hint p {
  margin: 0 0 4px;
}
</style>
