# xiaozhi-desktop

An Electron application with Vue and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## MCP 插件

安装后的桌面客户端自带 JavaScript 运行环境，无需用户另装 Node.js。进入设置 → **MCP 工具** → **导入 ZIP**，直接选择插件 ZIP 包；也可用 **导入文件夹** 选择包含清单和 JS 入口的目录。

插件格式、`media_player` / `subtitle` 授权、取消与清理契约、运行目录限制，以及更新回滚和云端同步行为，见 [MCP 插件安装与开发](examples/mcp_plugins/README.md)。

## 使用数据配置（OpenPanel）

OpenPanel 配置在开发启动或构建时读取，并在编译时替换进主进程代码。三个值全部为空时禁用统计；只填写部分字段会报错并停止构建。修改配置后需重新启动开发进程或重新构建，已生成的安装包不会随环境变量变化。

| 变量 | 含义 |
| --- | --- |
| `OPENPANEL_API_URL` | OpenPanel API 地址 |
| `OPENPANEL_CLIENT_ID` | OpenPanel 客户端 ID |
| `OPENPANEL_CLIENT_SECRET` | OpenPanel 客户端 Secret |

### 本地开发与构建

复制配置示例后，在本机填写三项配置，再运行开发或构建命令：

```bash
cp .env.example .env.local
pnpm dev
# 或 pnpm build
```

也可以通过 shell 设置同名环境变量，例如：

```bash
export OPENPANEL_API_URL='你的 OpenPanel API 地址'
export OPENPANEL_CLIENT_ID='你的客户端 ID'
export OPENPANEL_CLIENT_SECRET='你的客户端 Secret'
pnpm build
```

shell 环境变量优先于环境文件。本地环境文件已被 Git 忽略，仅提交空值示例；不要提交真实凭证。

### GitHub Actions 发布

在运行发布工作流的仓库中，进入 **Settings → Secrets and variables → Actions → Repository secrets**，添加上表中的三个同名 Secrets。工作流仅将它们注入 Windows/Linux、macOS x64 和 macOS arm64 的 Build 步骤，安装依赖步骤不接收这些凭证。三个 Secrets 均未配置时会生成禁用统计的应用；启用统计时需同时配置三项。

发布流程继续在源码仓库创建发布说明，并向独立的发布仓库上传安装包和更新元数据。

### 凭证轮换

历史上写入源码的凭证应在 OpenPanel 侧轮换或撤销，并更新本地配置和 Repository Secrets 后重新构建发布。删除当前源码中的值不会清除 Git 历史或旧安装包中的凭证；撤销旧凭证也会影响仍使用它的旧版本统计。

Secrets 避免凭证直接写入源码，但构建后的桌面客户端仍需携带上报配置，凭证可从普通 JavaScript 中读取。请将其权限限制为统计上报所需范围。
