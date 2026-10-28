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
2. **导入文件夹** 选择本目录，或把本目录打成 ZIP 后使用 **导入 ZIP**（也可拷到 `{userData}/mcp_plugins/com.example.story/`）
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

查书请求应接收工具回调的第二个参数 `signal`，传入 `fetch(url, { signal })`，并在请求结束后调用 `signal?.throwIfAborted()` 再开始播放，避免超时或卸载后继续产生副作用。媒体播放已经开始时，取消信号不会自动停止播放。

超时、清理、运行目录、持久数据和安装回滚规则，见 [MCP 插件安装与开发](../README.md)。
