/**
 * MCP 外挂示例：com.example.radio
 *
 * 演示应用内 HLS 播放 + 字幕条：
 *   media_player.playUrl(m3u8)  → 后台音频窗 hls.js 播放（m3u8 自动识别）
 *   bubble.show(text)           → 桌宠旁字幕条（复用关怀气泡通道，不进聊天历史）
 *
 * 授权：设置 → MCP 工具 开启 allowHostGet 含 media_player 与 bubble
 * （或直接使用别名 subtitle）。
 *
 * 播放 HLS 说明：playUrl 传 .m3u8 URL 即可，应用内自动走 hls.js；
 * 本地文件 / 普通 http(s) 音频也支持，无需区分。
 *
 * @param {import('../../../src/main/mcp/plugins/types').McpHost} host
 */

/** 内置电台表（演示用，可替换为真实电台 m3u8）。全部为公开 HLS 流。 */
const STATIONS = [
  {
    id: 'apple-demo',
    name: 'Apple Demo (bipbop)',
    // 音视频 HLS 演示流；真实电台请换成音频 m3u8
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8',
  },
]

function resolveStation(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) {
    return STATIONS[0]
  }
  const hit = STATIONS.find(item =>
    item.id.includes(q) || item.name.toLowerCase().includes(q),
  )
  return hit || STATIONS[0]
}

function register(host) {
  const logger = host.get('logger')
  const media = host.get('media_player')
  // bubble 与 subtitle 是同一 SDK 的两个键，取其一即可
  const bubble = host.get('bubble') || host.get('subtitle')

  function needMedia() {
    if (media)
      return null
    return (
      '播放能力未授权：请在设置 → MCP 工具 的 allowHostGet 中加入 media_player 后重载。'
    )
  }

  function needBubble() {
    if (bubble)
      return null
    return '字幕能力未授权：请在 allowHostGet 中加入 bubble（或 subtitle）后重载。'
  }

  // —— 播放：AI 传频道名或直接传 m3u8 URL，应用内 HLS 播放 + 字幕提示 ——
  host.tool(
    'example.radio_play',
    `Play a HLS (m3u8) stream via in-app player, with a subtitle bubble.

中文：播放电台/有声 HLS 流。支持两种方式：
1. 传 station 频道名（内置表）
2. 直接传 url（任意 http(s) 的 .m3u8 流，应用内自动走 HLS 播放）
播放同时会在桌宠旁弹字幕条（不进聊天历史）。

Use when user wants to play a radio / HLS stream or a storytelling clip.
Examples:
- 「播放演示电台」→ station=apple-demo
- 「播放这个流 https://example.com/radio.m3u8」→ url=...`,
    [
      {
        name: 'station',
        type: 'string',
        defaultValue: 'apple-demo',
      },
      {
        name: 'url',
        type: 'string',
        defaultValue: '',
      },
      {
        name: 'title',
        type: 'string',
        defaultValue: '',
      },
    ],
  )(async (args) => {
    const denied = needMedia()
    if (denied)
      return denied

    // 显式 url 优先；否则按频道名查内置表
    let target = null
    let title = ''
    if (typeof args.url === 'string' && args.url.trim()) {
      target = args.url.trim()
      title = typeof args.title === 'string' && args.title.trim()
        ? args.title.trim()
        : '自定义流'
    }
    else {
      const stationArg = typeof args.station === 'string' ? args.station : 'apple-demo'
      const station = resolveStation(stationArg)
      target = station.url
      title = station.name
    }

    if (logger && typeof logger.info === 'function') {
      logger.info('example.radio_play', { target, title })
    }

    const result = await media.playUrl(target, { title })
    if (!result.success) {
      return result.message || '播放失败'
    }

    // 播放成功后弹字幕（未授权时静默跳过，不阻塞播放）
    const subtitle = `正在播放：${title}`
    if (bubble) {
      const bubbleResult = await bubble.show(subtitle, { durationMs: 5000 })
      if (!bubbleResult.success && logger) {
        logger.warn('example.radio bubble.show 未成功', { message: bubbleResult.message })
      }
    }
    return `正在播放: ${title}（HLS 流，应用内 hls.js 播放）`
  })

  // —— 字幕：单独弹字幕条（说书场景：逐句显示台词）——
  host.tool(
    'example.radio_subtitle',
    `Show a subtitle bubble near the desktop pet (not saved to chat history).

中文：在桌宠旁弹字幕条（如说书台词/电台节目信息），不进聊天历史。
依赖 pets / live2d 模式（无桌宠时返回错误提示）。

Use when plugin playback needs synchronized subtitles.`,
    [
      {
        name: 'text',
        type: 'string',
      },
      {
        name: 'duration_ms',
        type: 'number',
        defaultValue: 5000,
      },
    ],
  )(async (args) => {
    const denied = needBubble()
    if (denied)
      return denied

    const text = typeof args.text === 'string' ? args.text.trim() : ''
    if (!text) {
      return 'text 不能为空'
    }
    let durationMs = 5000
    if (typeof args.duration_ms === 'number' && Number.isFinite(args.duration_ms) && args.duration_ms > 0) {
      durationMs = Math.floor(args.duration_ms)
    }

    const result = await bubble.show(text, { durationMs })
    return result.success ? '字幕已展示' : (result.message || '字幕展示失败')
  })

  // —— 停止：停止播放并隐藏字幕 ——
  host.tool(
    'example.radio_stop',
    'Stop HLS playback and hide the subtitle bubble. 中文：停止播放并隐藏字幕。',
    [],
  )(async () => {
    let output = '已停止'
    if (media) {
      const result = await media.stop()
      if (!result.success)
        output = result.message || '停止失败'
    }
    if (bubble)
      await bubble.hide()
    return output
  })

  // —— 状态 ——
  host.tool(
    'example.radio_status',
    'Get in-app media status JSON. 中文：查询播放状态。',
    [],
  )(async () => {
    if (!media)
      return '播放能力未授权'
    return JSON.stringify(await media.getStatus())
  })
}

module.exports = { register }
module.exports.register = register
module.exports.default = register
