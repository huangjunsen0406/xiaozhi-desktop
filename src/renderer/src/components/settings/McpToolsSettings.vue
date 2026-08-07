<script setup lang="ts">
import type { McpToolCatalogItem } from '@shared/types'
import { NButton, NCheckbox, NEmpty, NPopconfirm, NSpin, NSwitch, useMessage } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import IconCarbonAdd from '~icons/carbon/add'
import IconCarbonFolder from '~icons/carbon/folder'
import IconCarbonRenew from '~icons/carbon/renew'
import IconCarbonTrashCan from '~icons/carbon/trash-can'

const message = useMessage()

/** 服务端 catalog */
const catalog = ref<McpToolCatalogItem[]>([])
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

/** 外挂组：取该组 pluginId（同组工具应一致） */
function groupPluginId(group: ToolGroup): string | undefined {
  return group.tools.find(t => t.source === 'plugin' && t.pluginId)?.pluginId
}

function isPluginGroup(group: ToolGroup): boolean {
  return group.tools.some(t => t.source === 'plugin')
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

    try {
      const cfg = await window.api.mcpToolsGetPluginsConfig()
      mediaPlayerAllowed.value = cfg.allowHostGet.includes('media_player')
        || cfg.allowHostGet.includes('music_player')
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
    const set = new Set(cfg.allowHostGet.filter(k => k !== 'media_player' && k !== 'music_player'))
    set.add('logger')
    set.add('config_readonly')
    if (enabled) {
      set.add('media_player')
      set.add('music_player')
    }
    const next = await window.api.mcpToolsSetPluginsConfig({
      allowHostGet: Array.from(set),
    })
    mediaPlayerAllowed.value = next.allowHostGet.includes('media_player')
      || next.allowHostGet.includes('music_player')
    // 重载后刷新 catalog（新工具可能出现）
    const items = await window.api.mcpToolsGetCatalog()
    const prev = { ...localEnabled.value }
    applyCatalog(items)
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
async function handleDeletePlugin(pluginId: string) {
  try {
    deletingPluginId.value = pluginId
    const items = await window.api.mcpToolsDeletePlugin(pluginId)
    // 保留其它工具的本地未保存开关
    const prev = { ...localEnabled.value }
    applyCatalog(items)
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
  <div>
    <!-- 顶栏：导入 / 打开目录 / 刷新 -->
    <div class="flex items-center gap-2 mb-4 flex-wrap">
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

    <!-- 外挂 Host：应用内媒体播放 SDK -->
    <div
      class="mb-4 flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5"
    >
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium text-gray-800 dark:text-gray-100">
          允许外挂使用应用内播放
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          开启后，可信 in-process 插件可通过 host.get('media_player') 播放 URL（与内置音乐同一通路）。仅安装可信插件。
        </div>
      </div>
      <NSwitch
        :value="mediaPlayerAllowed"
        :loading="mediaPlayerSaving"
        size="small"
        class="shrink-0 mt-0.5"
        @update:value="handleMediaPlayerAllow"
      />
    </div>

    <NSpin :show="loading">
      <div v-if="groups.length > 0" class="flex flex-col gap-4">
        <div
          v-for="group in groups"
          :key="group.key"
          class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <!-- 分组头：名称 + 计数；右侧 Switch 总闸 + 外挂删除 -->
          <div
            class="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                {{ group.name }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                {{ groupStats(group).on }}/{{ groupStats(group).total }}
              </span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <NSwitch
                :value="isGroupAllEnabled(group)"
                size="small"
                @update:value="(v: boolean) => setGroupEnabled(group, v)"
              />
              <NPopconfirm
                v-if="isPluginGroup(group) && groupPluginId(group)"
                positive-text="删除"
                negative-text="取消"
                @positive-click="handleDeletePlugin(groupPluginId(group)!)"
              >
                <template #trigger>
                  <NButton
                    quaternary
                    size="tiny"
                    type="error"
                    :loading="deletingPluginId === groupPluginId(group)"
                  >
                    <template #icon>
                      <IconCarbonTrashCan class="w-3.5 h-3.5" />
                    </template>
                    删除
                  </NButton>
                </template>
                确定删除外挂「{{ group.name }}」？将卸载其工具并删除本地插件目录。
              </NPopconfirm>
            </div>
          </div>

          <!-- 工具行：文案在左，勾选在右（与组头 Switch 同侧对齐） -->
          <div class="divide-y divide-gray-100 dark:divide-gray-800">
            <div
              v-for="tool in group.tools"
              :key="tool.name"
              class="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50/80 dark:hover:bg-gray-800/40 cursor-pointer"
              @click="setToolEnabled(tool.name, !isEnabled(tool.name))"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-900 dark:text-gray-100 truncate">
                    {{ tool.label }}
                  </span>
                  <span
                    v-if="tool.source === 'plugin'"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300 shrink-0"
                  >
                    外挂
                  </span>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 font-mono truncate mt-0.5">
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
        class="mt-8"
      >
        <template #extra>
          <div class="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm mx-auto">
            <p>内置工具将在应用启动后出现在此列表。</p>
            <p class="mt-1">
              也可通过「导入插件」加载外挂（需含 manifest.json）。
            </p>
          </div>
        </template>
      </NEmpty>
    </NSpin>
  </div>
</template>
