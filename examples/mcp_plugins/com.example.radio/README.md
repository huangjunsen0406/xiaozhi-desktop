# com.example.radio — HLS 电台 / 说书字幕示例外挂

演示外挂插件的**媒体 + 展示**能力：

- `media_player.playUrl(m3u8)` — 应用内 **HLS（m3u8）流播放**（后台音频窗自动走 hls.js）
- `bubble.show(text)` — 桌宠旁**字幕条**（复用关怀气泡通道，**不进聊天历史**，只做展示）

## 安装

1. 将本目录打成 zip（`com.example.radio.zip`，含 manifest.json / register.js / README.md）
2. 应用内：设置 → MCP 工具 → 导入外挂插件 → 选择 zip
3. 开启授权：设置 → MCP 工具 → 外挂 Host 配置 → `allowHostGet` 加入：

```
media_player
bubble
```

（`bubble` 与 `subtitle` 是同一能力的两个键，取其一即可）

## 工具

| 工具 | 说明 |
|---|---|
| `example.radio_play` | 播放 HLS 流 + 自动弹字幕。传 `station`（内置表）或直接传 `url`（任意 http(s) `.m3u8`） |
| `example.radio_subtitle` | 单独弹字幕条（说书逐句台词）：`text` + `duration_ms` |
| `example.radio_stop` | 停止播放并隐藏字幕 |
| `example.radio_status` | 查询播放状态 JSON |

## 说书/电台插件要做的（对齐职责）

```
AI/模型 ──传语义参数──> 插件（自己解析源/查频道表）
                         ├─ media.playUrl(m3u8 URL)   ← 应用播放（HLS 自动识别）
                         └─ bubble.show(台词文本)      ← 字幕条（不进历史）
```

- **播放实现（hls.js）在应用内**，插件只负责「找到 URL 并传进去」
- `playUrl` 同时支持：本地绝对路径 / 普通 http(s) 音频 / **HLS m3u8**，无需区分
- 字幕条依赖桌宠（Pets / Live2D）模式，无桌宠时返回明确错误

## 替换为真实电台

编辑 `register.js` 的 `STATIONS` 表，填入真实电台 m3u8 即可：

```js
const STATIONS = [
  { id: 'mystation', name: '我的电台', url: 'https://example.com/live/radio.m3u8' },
]
```

也可以不建表：AI 直接传 `url` 参数播放任意 HLS 流。
