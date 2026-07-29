# com.example.dayjs-bundle

演示：**第三方 npm 依赖（dayjs）打进单文件**，投放时不需要 `node_modules`。

## 用户怎么用

设置 → **MCP 工具** → **导入插件**，选择本目录（含 `manifest.json` + `register.js`）。

应出现工具：

| 工具 | 作用 |
|------|------|
| `example.now` | dayjs 格式化当前时间 |
| `example.add_days` | dayjs 日期加减 |

对话可试：「现在几点」「今天加 7 天是几号」。

## 开发者怎么重新构建

```bash
cd examples/mcp_plugins/com.example.dayjs-bundle
npm install
npm run build    # → 根目录 register.js（bundle）
```

源码在 `src/register.js`（含 `require('dayjs')`）。  
构建后 `register.js` **不再依赖** 旁边的 `node_modules`，可只分发：

```text
com.example.dayjs-bundle/
  manifest.json
  register.js      # 已含 dayjs
  README.md
```

## 对比

| | hello | 本插件 |
|--|-------|--------|
| 第三方依赖 | 无 | dayjs |
| 投放 | 拷 JS | 拷 **bundle 后的** JS |
| 主程序 package.json | 不改 | 不改 |

物联网/天气等纯 JS SDK 同理：开发时 npm i，发布前 esbuild bundle。

> 本目录为**仅投放文件**（无 node_modules）。开发/重建见同级 `com.example.dayjs-bundle/`。
