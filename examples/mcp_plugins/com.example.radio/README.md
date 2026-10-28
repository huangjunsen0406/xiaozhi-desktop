# com.example.radio — HLS 电台 / 说书字幕示例外挂

演示外挂插件的媒体和字幕能力：

- `media_player.playUrl(m3u8)`：应用内 HLS 流播放，后台音频窗自动使用 hls.js。
- `subtitle.show(text)`：通过精灵宠物 / Live2D 消息条显示字幕，不进入聊天历史。

## 安装

1. 应用内进入设置 → **MCP 工具** → **导入文件夹**，选择本目录，确保目录根部包含 `manifest.json` 和 `register.js`；也可将本目录打成 ZIP 后点击 **导入 ZIP**。
2. 开启 **允许外挂使用应用内播放**；需要字幕时再开启 **允许外挂显示字幕**。
3. 对模型说“播放演示电台”或“显示字幕：欢迎收听”。云端同步失败时按界面提示重试；未连接时下次连接生效。

ZIP 可直接导入，支持的布局与大小限制见 [安装指引](../README.md#安装和更新)。对外字幕接口只有 `host.get('subtitle')`，没有 `bubble` 别名。完整契约见 [MCP 插件安装与开发](../README.md)。

## 工具

| 工具 | 说明 |
| --- | --- |
| `example.radio_play` | 播放 HLS 流并尝试显示字幕。传 `station`（内置表）或 `url`（HTTP(S) 的 m3u8 流），未授权字幕时仍可播放 |
| `example.radio_subtitle` | 单独显示字幕：`text` + `duration_ms`；未授权时返回提示 |
| `example.radio_stop` | 停止播放并在有权限时隐藏字幕 |
| `example.radio_status` | 查询播放状态 JSON |

## 插件职责

```text
AI/模型 → 语义参数 → 插件查找音源
                       ├─ media.playUrl(url) → 应用内播放
                       └─ subtitle.show(text) → 桌宠消息条
```

播放和字幕都复用应用通路：媒体会与内置音乐或其他插件互相打断，字幕需要精灵宠物 / Live2D 显示环境。示例在异步播放后检查调用取消信号，避免已取消的任务继续弹出字幕；已经开始的播放不会因信号取消而自动撤销。示例不持有后台定时器或连接，因此没有清理函数。

## 替换为真实电台

修改入口里的 `STATIONS` 表，填入实际音频流地址；内置地址是公开的音视频 HLS 演示流，不是正式电台源。

```js
const STATIONS = [
  { id: 'mystation', name: '我的电台', url: 'https://example.com/live/radio.m3u8' },
]
```

也可以直接传 `url`。`playUrl` 还支持本地绝对路径和普通 HTTP(S) 音频。若增加查频道 API 请求，应传递工具回调的 `signal`，请求完成后检查取消状态，再调用播放器。
