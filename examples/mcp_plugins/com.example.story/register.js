/**
 * MCP 外挂示例：com.example.story
 *
 * 演示正确分工（对齐 music search_and_play）：
 *   AI 只传书名等语义参数 → 插件内部「查源」得到 url → media.playUrl
 *
 * 本示例不接真实有声 API，用内置 demo 音源表模拟「查书返回 url」。
 * 需在设置 → MCP 工具 开启「允许外挂使用应用内播放」，或 allowHostGet 含 media_player。
 *
 * @param {import('../../../src/main/mcp/plugins/types').McpHost} host
 */

/** 模拟有声书库：书名关键词 → 可播地址（公开短音频，仅 demo） */
const DEMO_LIBRARY = [
  {
    keys: ['demo', '示例', '测试', 'hello'],
    title: '示例有声（短提示音）',
    // 短 mp3，用于验证应用内播放；可换成你自己的静态资源
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
]

function resolveDemoByTitle(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) {
    return DEMO_LIBRARY[0]
  }
  const hit = DEMO_LIBRARY.find(item =>
    item.keys.some(k => q.includes(k) || k.includes(q)),
  )
  return hit || DEMO_LIBRARY[0]
}

function register(host) {
  const logger = host.get('logger')
  const media = host.get('media_player') || host.get('music_player')

  function needMedia() {
    if (media)
      return null
    return (
      '播放能力未授权：请在设置 → MCP 工具 中开启「允许外挂使用应用内播放」，'
      + '或在 allowHostGet 中加入 media_player 后重载。'
    )
  }

  // —— 面向 AI：只传书名；url 由插件内部解析（此处为 demo 表）——
  host.tool(
    'example.story_play',
    `Play a demo audiobook clip via in-app player (simulates: title → lookup API → play).

中文：按书名播放示例有声。插件内部模拟查书得到播放地址，再走应用内播放；
调用方只需传书名，不要传 CDN/直链 URL。

Use when user wants to try story/audiobook plugin playback.
Examples:
- 「播放示例有声」→ title 示例
- 「play demo story」→ title demo`,
    [
      {
        name: 'title',
        type: 'string',
        defaultValue: '示例',
      },
      {
        name: 'start_position',
        type: 'number',
        defaultValue: 0,
      },
    ],
  )(async (args) => {
    const denied = needMedia()
    if (denied)
      return denied

    const titleArg = typeof args.title === 'string' ? args.title : '示例'
    const startRaw = args.start_position
    const startPosition = typeof startRaw === 'number' && startRaw >= 0 ? startRaw : 0

    // 模拟：查书 API → 可播 url（真实插件在此调喜马/自建接口）
    const book = resolveDemoByTitle(titleArg)
    if (logger && typeof logger.info === 'function') {
      logger.info('example.story_play lookup', {
        query: titleArg,
        resolved: book.title,
        startPosition,
      })
    }

    const result = await media.playUrl(book.url, {
      title: book.title,
      startPosition,
    })
    if (result.success)
      return `正在播放: ${book.title}`
    return result.message || '播放失败'
  })

  host.tool(
    'example.story_pause',
    'Pause current in-app story/media. 中文：暂停当前应用内有声/媒体。',
    [],
  )(async () => {
    const denied = needMedia()
    if (denied)
      return denied
    const result = await media.pause()
    return result.success ? '已暂停' : (result.message || '暂停失败')
  })

  host.tool(
    'example.story_resume',
    'Resume in-app story/media. 中文：继续播放。',
    [],
  )(async () => {
    const denied = needMedia()
    if (denied)
      return denied
    const result = await media.resume()
    return result.success ? '继续播放' : (result.message || '恢复失败')
  })

  host.tool(
    'example.story_stop',
    'Stop in-app story/media. 中文：停止播放。',
    [],
  )(async () => {
    const denied = needMedia()
    if (denied)
      return denied
    const result = await media.stop()
    return result.success ? '已停止' : (result.message || '停止失败')
  })

  host.tool(
    'example.story_seek',
    'Seek current playback to position in seconds. 中文：跳转到指定秒数。',
    [{ name: 'position', type: 'number' }],
  )(async (args) => {
    const denied = needMedia()
    if (denied)
      return denied
    const position = typeof args.position === 'number' ? args.position : Number(args.position)
    if (!Number.isFinite(position) || position < 0)
      return 'position 须为非负数字（秒）'
    const result = await media.seek(position)
    return result.success ? `已跳转到 ${position}s` : (result.message || '跳转失败')
  })

  host.tool(
    'example.story_status',
    'Get in-app media status JSON. 中文：查询播放状态。',
    [],
  )(async () => {
    const denied = needMedia()
    if (denied)
      return denied
    return JSON.stringify(await media.getStatus())
  })
}

module.exports = { register }
module.exports.register = register
module.exports.default = register
