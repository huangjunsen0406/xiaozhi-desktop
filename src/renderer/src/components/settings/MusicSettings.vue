<script setup lang="ts">
import type { MusicConfig } from '@shared/types'
import type { SettingsPanelHandle } from '../../types/settings'
import { NForm, NFormItem, NInput, NSelect, useMessage } from 'naive-ui'
import { onMounted, ref } from 'vue'

const message = useMessage()

// 表单数据
const searchUrl = ref('http://search.kuwo.cn/r.s')
const urlApi = ref('https://lxmusicapi.onrender.com')
const urlApiKey = ref('share-v3')
const urlResponsePath = ref('data.url')
const lyricsUrl = ref('http://m.kuwo.cn/newh5/singles/songinfoandlrc')
const defaultSource = ref('kw')
const defaultQuality = ref('320k')

// 选项配置
const sourceOptions = [
  { label: '酷我', value: 'kw' },
  { label: '网易云', value: 'wy' },
  { label: '咪咕', value: 'mg' },
]

const qualityOptions = [
  { label: '128k', value: '128k' },
  { label: '320k', value: '320k' },
  { label: '无损', value: 'flac' },
]

/**
 * 加载音乐配置
 */
async function loadConfig(): Promise<void> {
  try {
    const config = await window.api.musicGetConfig()
    searchUrl.value = config.searchUrl || 'http://search.kuwo.cn/r.s'
    urlApi.value = config.urlApi || 'https://lxmusicapi.onrender.com'
    urlApiKey.value = config.urlApiKey || 'share-v3'
    urlResponsePath.value = config.urlResponsePath || 'data.url'
    lyricsUrl.value = config.lyricsUrl || 'http://m.kuwo.cn/newh5/singles/songinfoandlrc'
    defaultSource.value = config.defaultSource || 'kw'
    defaultQuality.value = config.defaultQuality || '320k'
  }
  catch {
    message.error('加载音乐配置失败')
  }
}

/**
 * 保存配置
 */
async function handleSave(): Promise<void> {
  try {
    const config: Partial<MusicConfig> = {
      searchUrl: searchUrl.value,
      urlApi: urlApi.value,
      urlApiKey: urlApiKey.value,
      urlResponsePath: urlResponsePath.value,
      lyricsUrl: lyricsUrl.value,
      defaultSource: defaultSource.value,
      defaultQuality: defaultQuality.value,
    }
    await window.api.musicUpdateConfig(config)
    message.success('音乐设置已保存')
  }
  catch {
    message.error('保存失败')
  }
}

// 组件挂载时初始化
onMounted(async () => {
  await loadConfig()
})

// 导出方法供父组件调用
const panel = {
  persistence: 'explicit',
  save: handleSave,
} satisfies SettingsPanelHandle

defineExpose(panel)
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <NFormItem label="搜索 API">
      <NInput
        v-model:value="searchUrl"
        placeholder="请输入歌曲搜索接口地址"
        style="width: 400px"
      />
    </NFormItem>

    <NFormItem label="直链 API">
      <NInput
        v-model:value="urlApi"
        placeholder="请输入音频直链解析服务地址"
        style="width: 400px"
      />
    </NFormItem>

    <NFormItem label="API 密钥">
      <NInput
        v-model:value="urlApiKey"
        placeholder="请输入直链服务的认证密钥"
        style="width: 400px"
      />
    </NFormItem>

    <NFormItem label="响应路径">
      <div style="display: flex; flex-direction: column; gap: 4px">
        <NInput
          v-model:value="urlResponsePath"
          placeholder="data.url"
          style="width: 400px"
        />
        <span style="color: #999; font-size: 12px">
          从直链 API 响应 JSON 中提取播放地址的路径，如 data.url、url、result.data.playUrl
        </span>
      </div>
    </NFormItem>

    <NFormItem label="歌词 API">
      <NInput
        v-model:value="lyricsUrl"
        placeholder="请输入歌词获取接口地址"
        style="width: 400px"
      />
    </NFormItem>

    <NFormItem label="默认平台">
      <NSelect
        v-model:value="defaultSource"
        :options="sourceOptions"
        style="width: 300px"
      />
    </NFormItem>

    <NFormItem label="默认音质">
      <NSelect
        v-model:value="defaultQuality"
        :options="qualityOptions"
        style="width: 300px"
      />
    </NFormItem>

    <NFormItem label=" " :show-label="false">
      <div style="color: #666; font-size: 12px">
        提示：修改音乐配置后，下次播放音乐时将使用新的配置
      </div>
    </NFormItem>
  </NForm>
</template>
