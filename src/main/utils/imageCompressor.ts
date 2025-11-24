/**
 * 图片压缩工具
 * 用于将图片压缩为缩略图，存储到聊天记录数据库
 */
import { Buffer } from 'node:buffer'
import sharp from 'sharp'

export interface CompressOptions {
  maxDimension?: number // 最大尺寸，默认 320
  quality?: number // JPEG 质量，默认 80
}

/**
 * 压缩图片为缩略图
 * 用于存储到聊天记录数据库
 */
export async function compressImageForChat(
  imageBuffer: Buffer,
  options: CompressOptions = {},
): Promise<Buffer> {
  const maxDimension = options.maxDimension ?? 320
  const quality = options.quality ?? 80

  try {
    const compressed = await sharp(imageBuffer)
      .resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality })
      .toBuffer()

    console.log(
      `[ImageCompressor] 压缩完成: ${imageBuffer.length} → ${compressed.length} 字节`,
    )
    return compressed
  }
  catch (error) {
    console.error('[ImageCompressor] 压缩失败:', error)
    throw error
  }
}

/**
 * 从 base64 字符串压缩
 */
export async function compressBase64ForChat(
  base64: string,
  options: CompressOptions = {},
): Promise<Buffer> {
  const buffer = Buffer.from(base64, 'base64')
  return compressImageForChat(buffer, options)
}
