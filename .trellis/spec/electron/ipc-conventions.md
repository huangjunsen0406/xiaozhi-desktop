# IPC 规范

---

## 1. 通道命名

格式：`domain:action`，使用 kebab-case。

```text
audio:get-config          请求-响应
audio:update-config       请求-响应
audio:pcm-data            事件推送 renderer → main
audio:opus-decoded        事件推送 main → renderer
window:minimize           请求-响应（void 返回）
camera:request-capture    事件推送 main → renderer
camera:capture-result     事件推送 renderer → main
```

禁止：驼峰、下划线、无 domain 前缀。

---

## 2. 两种模式

| 模式 | 主进程 API | 渲染进程 API | 用途 |
| ---- | ---- | ---- | ---- |
| 请求-响应 | `ipcMain.handle` | `ipcRenderer.invoke` | 需要返回值 |
| 事件推送 | `webContents.send` / `ipcMain.on` | `ipcRenderer.send` / `ipcRenderer.on` | 单向通知 |

不混用：同一 channel 不同时用两种模式。

---

## 3. 统一响应格式

所有 `handle` 返回 `IpcResult<T>`：

```typescript
type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

---

## 4. 统一中间件

所有 handler 通过中间件注册，提供：参数验证、异常捕获、响应格式化、性能日志。

```typescript
registerHandler('audio:update-config', {
  validate: (params) => schema.parse(params),
  handler: async (params) => {
    // 业务逻辑，直接 return data（中间件包装为 IpcResult）
    return updatedConfig
  },
})
```

禁止：裸 `ipcMain.handle` + 手动 try/catch。

---

## 5. 监听器生命周期

### 超时必须清理

```typescript
function waitForResponse(channel: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (_e, data) => { clearTimeout(timer); resolve(data) }
    const timer = setTimeout(() => {
      ipcMain.removeListener(channel, handler)
      reject(new Error(`${channel} timeout`))
    }, timeoutMs)
    ipcMain.once(channel, handler)
  })
}
```

### 防重复注册

handler 注册时先 remove 旧的，或使用 guard 标志。

### 组件卸载时清理

preload 层 `on*` 方法必须返回 cleanup 函数，渲染进程在 `onUnmounted` 中调用。

---

## 6. 窗口查找

不依赖 `getFocusedWindow()`。使用 WindowManager 提供的确定性引用，或降级查找可见窗口。

---

## 7. Renderer 调用路径（强制）

```text
Renderer / Vue  ──仅──►  window.api（preload contextBridge）  ──►  ipcMain  ──►  main 服务
```

| 禁止 | 替代 |
| ---- | ---- |
| `window.electron.ipcRenderer.send/invoke/on` 打业务 channel | `window.api.*` 封装 |
| Renderer 写死 channel 字符串（如 `'bubble:show'`） | preload 模块内集中 channel |
| 新功能只加 `ipcMain.on` 不暴露 preload | handler + preload + `index.d.ts` **同一 PR** |
| 同一能力 A 窗走 api、B 窗走裸 ipc | 全部改 api |

允许：

* preload **内部**使用 `ipcRenderer`（唯一合法处）
* main 进程直接调 ServiceContainer / 模块（不经 preload）
* UI **私有**函数名（如 `sendMessage`），但必须落到唯一 `window.api` / store 入口

`on*` 订阅必须返回 unsubscribe，并在 `onUnmounted` 调用。

---

## 8. 禁止模式

| 禁止 | 替代 |
| ---- | ---- |
| `executeJavaScript` 读取渲染状态 | IPC invoke |
| 同步 fs 操作（`writeFileSync`） | `fs.promises` |
| 在 handler 中直接 `throw`（无 catch） | 中间件统一捕获 |
| `ipcMain.on` 处理需要返回值的请求 | 改用 `ipcMain.handle` |
| 业务 handler 返回形态三套并存且无文档 | 新代码统一 `IpcResult<T>` + preload `unwrapIpcResult`（存量逐步收） |

---

## 9. 传输层 vs 会话层 sendText

| 层 | API | 语义 |
| ---- | ---- | ---- |
| 会话 / UI | `ConversationSession.sendText` / `appSendText` / `window.api.appSendText` | **用户话语**（utterance），会走连接保证、打断说话、`wake_word_detected` 等业务路径 |
| 协议传输 | `Protocol.sendRawText` / `ProtocolManager.sendRawText` | **传输层文本帧**：已序列化的协议 JSON 字符串（hello / listen / abort / mcp / goodbye 等），**不是**用户输入 |

禁止：在协议抽象上再叫 `sendText`，避免与会话「发用户文本」同名异义。preload `invoke` 结果以 `unknown` 进入 `unwrapIpcResult` / `assertIpcSuccess` / `unwrapIpcSuccessFields`，禁止 `as IpcResult<T> \| T`。
