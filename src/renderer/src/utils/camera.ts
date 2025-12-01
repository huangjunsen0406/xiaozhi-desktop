/**
 * 摄像头捕获工具
 * 在渲染进程中使用 getUserMedia API 捕获图像
 */

/**
 * 捕获摄像头图像
 * @param width - 画面宽度
 * @param height - 画面高度
 * @returns 图像 Blob
 */
export async function captureFromWebcam(
  width = 640,
  height = 480,
): Promise<Blob> {
  let stream: MediaStream | null = null

  try {
    console.log('请求摄像头权限...')

    // 请求摄像头权限
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: width },
        height: { ideal: height },
      },
      audio: false,
    })

    console.log('摄像头权限已获取')

    // 创建 video 元素
    const video = document.createElement('video')
    video.srcObject = stream
    video.autoplay = true
    video.muted = true

    // 等待视频准备好
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play()
          .then(() => resolve())
          .catch(reject)
      }
      video.onerror = reject
    })

    // 等待一小段时间让摄像头稳定
    await new Promise(resolve => setTimeout(resolve, 100))

    console.log('视频流已准备好，捕获帧...')

    // 创建 canvas 并捕获当前帧
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('无法获取 canvas context')
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // 转换为 Blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          }
          else {
            reject(new Error('Failed to convert canvas to blob'))
          }
        },
        'image/jpeg',
        0.9,
      )
    })

    console.log(`[Camera] 图像捕获成功，大小: ${blob.size} 字节`)
    return blob
  }
  catch (error) {
    console.error('捕获图像失败', error)
    throw error
  }
  finally {
    // 停止摄像头
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      console.log('摄像头已关闭')
    }
  }
}

/**
 * 摄像头设备信息
 */
export interface CameraDevice {
  deviceId: string
  label: string
  groupId: string
}

/**
 * 获取可用的摄像头设备列表
 */
export async function getCameraDevices(): Promise<CameraDevice[]> {
  try {
    // 先请求权限，这样才能获取到设备的 label
    await navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => stream.getTracks().forEach(track => track.stop()))
      .catch(() => {
        // 忽略权限拒绝错误，继续枚举设备
      })

    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter(device => device.kind === 'videoinput')

    return videoDevices.map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `摄像头 ${index + 1}`,
      groupId: device.groupId,
    }))
  }
  catch (error) {
    console.error('获取摄像头设备列表失败', error)
    return []
  }
}
