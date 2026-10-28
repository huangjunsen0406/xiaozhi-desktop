# com.example.hello — MCP 外挂示例

## 布局

```text
com.example.hello/
  manifest.json
  register.js      # 运行时入口（JS）
  README.md
```

## 投放

将本目录复制到应用 userData 下：

```text
{userData}/mcp_plugins/com.example.hello/
```

或在设置 → **MCP 工具** → **导入插件** 选择本目录。

## 开发（可选 TS）

主进程 **不** 编译用户 TypeScript。请在本地编译：

```ts
// src/register.ts
import type { McpHost } from '...' // 仅类型参考

export function register(host: McpHost) {
  host.tool('example.hello', 'Say hello', [
    { name: 'name', type: 'string', defaultValue: 'World' },
  ])(async (args) => {
    return `Hello, ${args.name}!`
  })
}
```

输出到 `register.js` 后按 manifest `entry` 投放。

## Host API

- `host.addTool({ name, description, properties, callback })`
- `host.tool(name, description, props?)(callback)`
- `host.get('logger' | 'config_readonly')`（默认开放）
- `host.get('media_player' | 'subtitle')`（需在设置中分别授权）
- `host.signal`、`host.onDispose(cleanup)`；回调可接收 `(args, signal?)`

完整的取消信号、可选 `dispose` / 返回清理函数、超时、运行目录和更新回滚规则，见 [MCP 插件安装与开发](../README.md)。本例没有后台资源，不需要空清理函数。

## 安全

`node-inprocess` 与主进程同权。不信任的插件请勿安装。
