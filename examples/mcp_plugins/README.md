# MCP 插件安装与开发

桌面客户端自带 Electron / Node.js 运行环境。用户安装准备好的纯 JavaScript 插件时，无需另装 Node.js 或执行 `npm install`。插件作者需要提前编译 TypeScript，并将依赖打包进 JS 或随插件携带；原生模块、Python、系统命令等额外依赖仍需作者处理平台兼容。

## 安装和更新

在设置 → **MCP 工具** → **导入 ZIP**，直接选择插件 ZIP 包，无需手动解压。已有插件目录时，点击 **导入文件夹** 选择包含清单和入口的目录。

ZIP 支持以下两种布局：清单与入口直接位于压缩包根目录，或位于唯一的一层插件文件夹内：

```text
# 根目录布局                    # 单层文件夹布局
manifest.json                   com.example.hello/
register.js                       manifest.json
assets/                           register.js
                                  assets/
```

每个 ZIP 只能包含一个插件，不支持多插件合集或更深层嵌套。压缩包最大 **100 MiB**，解压后总大小最大 **500 MiB**，最多 **10000 条目录和文件记录**（解压出的文件及目录也按此上限统计，包含隐式父目录），路径深度最多 **64 层**；链接条目、绝对路径及 `..` 越界路径会被拒绝。ZIP 会在临时目录校验和解压，然后沿用文件夹安装及失败回滚流程。

插件目录示例：

```text
com.example.hello/
  manifest.json
  register.js
  assets/           # 可选包内资源
  node_modules/     # 可选随包依赖
```

也可以将插件文件夹复制到 `{userData}/mcp_plugins/`，然后点击 **刷新**。目录可由 `XIAOZHI_MCP_PLUGINS_DIR` 或 `PATHS.mcpPluginsDir` 覆盖。导入来源应在应用管理的插件目录之外；直接选择已经安装的同一目录会触发重载。

通过导入更新同 ID 插件时，应用先准备并校验新包，再备份旧目录、替换并尝试加载。新版本加载失败时会尝试恢复旧目录并重新加载；恢复也失败时，错误会给出保留的备份位置。手动覆盖插件目录不经过此安装回滚流程。回滚不能撤销插件已经发出的网络请求、播放操作或其他外部副作用。

保存工具开关、导入、删除、刷新及修改 Host 权限后，应用会尝试同步云端工具列表：已有连接时通过重连触发云端重新发现工具，没有连接时留到下次连接。重连成功表示连接已恢复，应用不会等待云端完成 `tools/list` 查询，也不将其视为云端确认。同步失败不会撤销已经完成的本地修改；请按界面提示重试。已安装插件列表可查看加载成功、跳过和失败状态，零工具插件也可管理。

## 清单与注册

```json
{
  "id": "com.example.hello",
  "name": "Hello Demo",
  "version": "1.0.0",
  "api_version": 1,
  "runtime": "node-inprocess",
  "entry": "./register.js",
  "call_timeout_ms": 30000
}
```

`entry` 是插件根目录内的 JS 文件。当前只支持 `node-inprocess`；插件与主进程同权，只安装可信插件。包必须自包含，不能用符号链接引用包外文件或形成循环。插件 ID 和工具名必须避免与其他插件冲突；工具重名会导致该插件加载失败。

入口导出 `register(host)`，支持 CommonJS 和 ESM。工具在 `register` 完成前注册，注册完成后不能再动态追加工具。参数支持 `boolean`、`integer`、`number`、`string`；没有 `defaultValue` 的参数必填，数值可设置 `minValue` / `maxValue`。回调返回字符串，结构化结果请使用 `JSON.stringify`。

```js
function register(host) {
  host.tool('example.hello', 'Say hello', [
    { name: 'name', type: 'string', defaultValue: 'World' },
  ])(async args => `Hello, ${args.name}!`)
}

module.exports = { register }
```

对象形式为 `host.addTool({ name, description, properties, callback })`。请通过 Host 契约访问应用能力，不依赖应用内部容器或服务实现。

## Host 能力与授权

| `host.get` 名称 | 用途 | 授权 |
| --- | --- | --- |
| `logger` | 带插件 ID 的日志 | 默认开放 |
| `config_readonly` | 不含密钥的只读配置切片 | 默认开放 |
| `media_player` | `playUrl`、`pause`、`resume`、`stop`、`seek`、`getStatus` | 设置中开启“允许外挂使用应用内播放” |
| `subtitle` | `show(text, { durationMs })`、`hide()` | 设置中开启“允许外挂显示字幕” |

未授权或能力不可用时，`host.get` 返回 `undefined`，插件应给出可理解的提示或跳过可选功能。字幕只通过 `subtitle` 对外提供；`bubble` 是内部实现名称，`music_player` 也不是公开能力。历史配置里的 `bubble` 授权会迁移为 `subtitle`，旧插件代码仍需改用 `host.get('subtitle')`。

媒体支持本地绝对路径、HTTP(S) 音频和 HLS（m3u8），与内置音乐共用播放器，会互相打断。字幕复用精灵宠物 / Live2D 消息条，只展示、不进入聊天历史。字幕文本须为非空字符串，最多 500 字符；展示时长默认 5000 毫秒，限制在 1000～3600000 毫秒。

## 取消与资源清理

应用为每次插件加载创建独立生命周期：

- `host.signal`：插件被卸载、重载、删除、加载失败或应用正常退出时取消，适合注册阶段请求和插件后台任务。
- `callback(args, signal?)`：工具回调可接收第二个 `AbortSignal`，工具超时或插件生命周期结束时取消；旧的单参数回调保持兼容。
- `host.onDispose(cleanup)`：尽早登记资源清理函数。也可导出模块级 `dispose()`，或从 `register(host)` 返回清理函数。三种方式都会执行，同一个函数引用只调用一次；不同清理函数仍应避免重复关闭同一资源。

注册阶段默认最多等待 **10 秒**。工具调用由清单 `call_timeout_ms` 配置，省略或无效时默认 **30 秒**。清理阶段默认最多等待 **3 秒**：先取消生命周期及在途工具调用，再调用清理函数；多个清理函数可能并发执行，不要依赖执行先后关系。

```js
function register(host) {
  const timer = setInterval(() => {
    // 插件自己的后台任务
  }, 1000)
  host.onDispose(() => clearInterval(timer))

  host.tool('example.fetch_text', 'Fetch a text resource', [
    { name: 'url', type: 'string' },
  ])(async (args, signal) => {
    const response = await fetch(args.url, { signal })
    const text = await response.text()
    signal?.throwIfAborted()
    return text
  })
}

module.exports = { register }
```

异步创建资源时，先使用 `host.signal` 取消请求，并尽早登记清理；不要等所有初始化成功后才登记。卸载后 Host 和已缓存的媒体 / 字幕 SDK 不可继续使用，清理函数只释放插件自己的定时器、连接等资源。不要在清理中无条件停止共享播放器或隐藏其他功能的消息条。

这些超时都是协作式的：异步操作需要传递或检查取消信号，取消后不要继续产生副作用。超时不会强制终止底层任务，主进程内同步死循环也无法被定时器中断；清理函数应尽快完成且能安全重复调用。

## 包资源与持久数据

每次加载会把安装包复制到独立的临时运行目录，卸载后清理该目录。CommonJS 的 `__dirname` 或 ESM 的 `import.meta.url` 指向本次运行副本，可用来读取包内资源和解析随包依赖；不要假定其绝对路径稳定。

不要把用户配置、缓存或数据库写入 `__dirname`、运行副本或已安装插件目录：运行副本会清理，安装目录会被整体更新替换。目前 Host 未提供插件专属的持久存储 API，`config_readonly` 也不是可写配置。确需持久数据时，作者应自行设计明确的存储位置和迁移方案，不能依赖插件安装或回滚来保护这些数据。

## 示例

- [Hello](com.example.hello/README.md)：最小工具注册。
- [Dayjs Bundle](com.example.dayjs-bundle/README.md)：将第三方纯 JS 依赖打进单文件。
- [Dayjs 投放副本](com.example.dayjs-bundle-import/README.md)：只包含投放文件。
- [Story](com.example.story/README.md)：插件查找音源后通过应用播放。
- [Radio](com.example.radio/README.md)：HLS 播放及 `subtitle` 展示。
