/**
 * 图片处理工具函数
 */

/**
 * 将二进制数据转换为 Uint8Array
 * 支持多种输入格式：Uint8Array, Buffer 对象, 数组等
 * @param imageData - 图片二进制数据
 * @returns Uint8Array 或 null（如果格式无法识别）
 */
export function convertToUint8Array(imageData: Uint8Array | any): Uint8Array | null {
  if (imageData instanceof Uint8Array) {
    return imageData
  }
  else if (imageData?.data && Array.isArray(imageData.data)) {
    // 如果是 {type: 'Buffer', data: [...]} 格式
    return new Uint8Array(imageData.data)
  }
  else if (Array.isArray(imageData)) {
    // 如果是数组格式
    return new Uint8Array(imageData)
  }
  else if (imageData?.buffer) {
    // 如果有 buffer 属性
    return new Uint8Array(imageData.buffer)
  }

  console.error('[imageUtils] 无法识别的图片数据格式:', typeof imageData, imageData)
  return null
}

/**
 * 检测图片格式（PNG 或 JPEG）
 * @param buffer - 图片二进制数据
 * @returns MIME 类型
 */
export function detectImageMimeType(buffer: Uint8Array): string {
  // 检查 PNG 头：89 50 4E 47
  const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
  return isPNG ? 'image/png' : 'image/jpeg'
}

/**
 * 将 Uint8Array 转换为 base64 字符串
 * @param buffer - 二进制数据
 * @returns base64 字符串
 */
export function uint8ArrayToBase64(buffer: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i])
  }
  return btoa(binary)
}

/**
 * 将 base64 字符串转换为 Uint8Array
 * @param base64 - base64 字符串
 * @returns Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * 将图片数据转换为 data URL
 * @param imageData - 图片二进制数据（支持多种格式）
 * @returns data URL 或空字符串（如果转换失败）
 */
export function imageDataToDataURL(imageData: Uint8Array | any): string {
  try {
    // 转换为 Uint8Array
    const buffer = convertToUint8Array(imageData)
    if (!buffer || buffer.length === 0) {
      console.error('[imageUtils] 图片数据为空或无效')
      return ''
    }

    // 检测 MIME 类型
    const mimeType = detectImageMimeType(buffer)

    // 转换为 base64 并返回 data URL
    const base64 = uint8ArrayToBase64(buffer)
    return `data:${mimeType};base64,${base64}`
  }
  catch (error) {
    console.error('[imageUtils] 转换图片失败:', error)
    return ''
  }
}
