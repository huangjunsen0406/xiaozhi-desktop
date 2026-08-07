# com.example.story — 应用内有声示例

演示 **正确的 AI ↔ 插件 ↔ 播放** 分工（对齐内置 music）：

```text
AI 只传书名 title
  → 插件内部「查书」（本示例用内置 demo 表模拟 API）
  → 得到 url
  → host.get('media_player').playUrl(url)
  → 应用内出声
```

**不要**让模型传最终 CDN/直链；真实说书插件在查书步骤换成喜马/自建 API 即可。

## 启用

1. 设置 → **MCP 工具** → 打开 **允许外挂使用应用内播放**
2. **导入插件** 选择本目录（或拷到 `{userData}/mcp_plugins/com.example.story/`）
3. 对模型说「播放示例有声」→ 应调 `example.story_play`，`title` 如 `示例` / `demo`

## 面向 AI 的工具

| 工具 | 参数 | 说明 |
|------|------|------|
| `example.story_play` | `title`（书名）, 可选 `start_position` | 查 demo 库 → 应用内播 |
| `example.story_pause` / `resume` / `stop` | 无 | 播控 |
| `example.story_seek` | `position` 秒 | 跳转 |
| `example.story_status` | 无 | 状态 JSON |

## 插件作者

```js
const media = host.get('media_player')
// 1) 用 args.title 调你的查书 API
// 2) const url = apiResult.playUrl
// 3) await media.playUrl(url, { title: displayName, startPosition })
```

- 推荐音频：**mp3 / m4a(aac)** 整段 http(s)
- 与内置音乐 **同一播放通路**，会互相打断
- `node-inprocess` + 媒体权限 = 可控制扬声器，只装可信插件
