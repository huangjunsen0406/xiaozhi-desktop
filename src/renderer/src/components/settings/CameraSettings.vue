<script setup lang="ts">
import type { SettingsPanelHandle } from '../../types/settings'
import type { CameraDevice } from '../../utils/camera'
import { NButton, NForm, NFormItem, NInput, NSelect, NSpace, NSwitch, useMessage } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCameraDevices } from '../../utils/camera'

const message = useMessage()

// 基础配置
const enableCamera = ref(true)
const deviceId = ref('')
const deviceLabel = ref('')

// 视觉服务配置
const useLocalVision = ref(false)
const vlApiKey = ref('')
const vlUrl = ref('')
const vlModel = ref('glm-4v-plus')

// 捕获设置
const captureWidth = ref(1280)
const captureHeight = ref(720)

// 摄像头设备列表
const cameraDevices = ref<CameraDevice[]>([])
const cameraDeviceOptions = computed(() => {
  return cameraDevices.value.map(device => ({
    label: device.label,
    value: device.deviceId,
  }))
})

// 分辨率选项
const resolutionOptions = [
  { label: '640x480 (SD)', value: '640x480' },
  { label: '1280x720 (HD)', value: '1280x720' },
  { label: '1920x1080 (Full HD)', value: '1920x1080' },
]

// 模型选项
const modelOptions = [
  { label: 'glm-4v-plus', value: 'glm-4v-plus' },
  { label: 'glm-4v', value: 'glm-4v' },
]

// 预览相关
const isPreviewing = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
let mediaStream: MediaStream | null = null

// 计算分辨率字符串
const resolution = computed({
  get: () => `${captureWidth.value}x${captureHeight.value}`,
  set: (value: string) => {
    const [w, h] = value.split('x').map(Number)
    captureWidth.value = w
    captureHeight.value = h
  },
})

/**
 * 加载配置
 */
async function loadConfig() {
  try {
    const config = await window.api.cameraConfigGetConfig()
    enableCamera.value = config.enabled
    deviceId.value = config.deviceId
    deviceLabel.value = config.deviceLabel
    useLocalVision.value = config.useLocalVision
    vlApiKey.value = config.vlApiKey
    vlUrl.value = config.vlUrl
    vlModel.value = config.vlModel
    captureWidth.value = config.captureWidth
    captureHeight.value = config.captureHeight
  }
  catch (error) {
    console.error('加载配置失败', error)
    message.error('加载摄像头配置失败')
  }
}

/**
 * 扫描摄像头设备
 */
async function scanDevices() {
  try {
    const devices = await getCameraDevices()
    cameraDevices.value = devices
    console.log('扫描到设备:', devices)

    // 如果当前选中的设备不在列表中，选择第一个
    if (devices.length > 0 && !devices.some(d => d.deviceId === deviceId.value)) {
      deviceId.value = devices[0].deviceId
      deviceLabel.value = devices[0].label
    }
  }
  catch (error) {
    console.error('扫描设备失败', error)
    message.error('扫描摄像头设备失败')
  }
}

/**
 * 开始预览摄像头
 */
async function startPreview() {
  if (isPreviewing.value || !enableCamera.value) {
    return
  }

  try {
    // 如果已有媒体流，先停止
    stopPreview()

    // 构建约束条件
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: captureWidth.value },
        height: { ideal: captureHeight.value },
      },
      audio: false,
    }

    // 如果指定了设备ID，添加到约束中
    if (deviceId.value) {
      constraints.video = {
        ...(constraints.video as MediaTrackConstraints),
        deviceId: { exact: deviceId.value },
      }
    }

    // 获取媒体流
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints)

    // 设置video元素的源
    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream
      await videoRef.value.play()
      isPreviewing.value = true
      console.log('预览已启动')
    }
  }
  catch (error) {
    console.error('启动预览失败', error)

    let errorMessage = '启动摄像头预览失败'
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        errorMessage = '摄像头权限被拒绝，请允许访问摄像头'
      }
      else if (error.name === 'NotFoundError') {
        errorMessage = '未找到摄像头设备'
      }
      else if (error.name === 'NotReadableError') {
        errorMessage = '摄像头被其他应用占用'
      }
    }

    message.error(errorMessage)
    isPreviewing.value = false
  }
}

/**
 * 停止预览摄像头
 */
function stopPreview() {
  if (mediaStream) {
    // 停止所有轨道
    mediaStream.getTracks().forEach(track => track.stop())
    mediaStream = null
  }

  if (videoRef.value) {
    videoRef.value.srcObject = null
  }

  isPreviewing.value = false
  console.log('预览已停止')
}

/**
 * 重启预览（参数变化时）
 */
async function restartPreview() {
  if (isPreviewing.value) {
    stopPreview()
    // 稍微延迟后重启，确保资源释放
    await new Promise(resolve => setTimeout(resolve, 100))
    await startPreview()
  }
}

/**
 * 保存配置
 */
async function handleSave() {
  try {
    // 查找设备标签
    const device = cameraDevices.value.find(d => d.deviceId === deviceId.value)

    await window.api.cameraConfigUpdateConfig({
      enabled: enableCamera.value,
      deviceId: deviceId.value,
      deviceLabel: device?.label || deviceLabel.value,
      useLocalVision: useLocalVision.value,
      vlApiKey: vlApiKey.value,
      vlUrl: vlUrl.value,
      vlModel: vlModel.value,
      captureWidth: captureWidth.value,
      captureHeight: captureHeight.value,
    })

    message.success('摄像头配置已保存')
    console.log('配置已保存')
  }
  catch (error) {
    console.error('保存失败', error)
    message.error('保存摄像头配置失败')
  }
}

// 监听设备ID变化，自动重启预览
watch(deviceId, () => {
  restartPreview()
})

// 监听分辨率变化，自动重启预览
watch([captureWidth, captureHeight], () => {
  restartPreview()
})

// 组件挂载时加载配置和扫描设备
onMounted(async () => {
  await loadConfig()
  await scanDevices()
})

// 组件卸载时停止预览
onBeforeUnmount(() => {
  stopPreview()
})

// 暴露方法给父组件
const panel = {
  persistence: 'explicit',
  save: handleSave,
} satisfies SettingsPanelHandle

defineExpose(panel)
</script>

<template>
  <NForm label-placement="left" :label-width="120">
    <!-- 基础设置 -->
    <NFormItem label="启用摄像头">
      <NSwitch v-model:value="enableCamera" />
    </NFormItem>

    <NFormItem label="摄像头设备" :disabled="!enableCamera">
      <NSelect
        v-model:value="deviceId"
        :options="cameraDeviceOptions"
        placeholder="请选择摄像头设备"
        :disabled="!enableCamera"
      />
    </NFormItem>

    <NFormItem label="分辨率" :disabled="!enableCamera">
      <NSelect
        v-model:value="resolution"
        :options="resolutionOptions"
        :disabled="!enableCamera"
      />
    </NFormItem>

    <!-- 摄像头预览区域 -->
    <NFormItem label="摄像头预览">
      <div class="w-full">
        <!-- 预览视频区域 -->
        <div
          class="preview-container mb-3"
          :style="{
            minWidth: '320px',
            maxWidth: '480px',
            minHeight: '240px',
            maxHeight: '360px',
            aspectRatio: `${captureWidth} / ${captureHeight}`,
            border: '2px solid var(--n-border-color)',
            borderRadius: '8px',
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }"
        >
          <video
            v-show="isPreviewing"
            ref="videoRef"
            autoplay
            playsinline
            muted
            style="width: 100%; height: 100%; object-fit: contain;"
          />
          <div
            v-show="!isPreviewing"
            style="color: #999; text-align: center; padding: 20px;"
          >
            <div style="font-size: 14px; margin-bottom: 8px;">
              摄像头预览区域
            </div>
            <div style="font-size: 12px;">
              点击"开始预览"按钮查看摄像头画面
            </div>
          </div>
        </div>

        <!-- 预览控制按钮 -->
        <NSpace>
          <NButton
            :disabled="!enableCamera || isPreviewing"
            @click="startPreview"
          >
            开始预览
          </NButton>
          <NButton
            :disabled="!isPreviewing"
            @click="stopPreview"
          >
            停止预览
          </NButton>
        </NSpace>
      </div>
    </NFormItem>

    <!-- 视觉服务配置 -->
    <NFormItem label="使用本地 Vision API">
      <NSwitch v-model:value="useLocalVision" />
    </NFormItem>

    <NFormItem
      v-if="useLocalVision"
      label="API Key"
    >
      <NInput
        v-model:value="vlApiKey"
        type="password"
        show-password-on="click"
        placeholder="请输入智谱 AI API Key"
      />
    </NFormItem>

    <NFormItem
      v-if="useLocalVision"
      label="API URL"
    >
      <NInput
        v-model:value="vlUrl"
        placeholder="例如：https://open.bigmodel.cn/api/paas/v4"
      />
    </NFormItem>

    <NFormItem
      v-if="useLocalVision"
      label="模型"
    >
      <NSelect
        v-model:value="vlModel"
        :options="modelOptions"
      />
    </NFormItem>
  </NForm>
</template>
