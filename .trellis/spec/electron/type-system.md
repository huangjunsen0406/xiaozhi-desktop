# 类型系统规范

---

## 1. 类型分层

```text
src/shared/types/    跨进程共享（主 + preload + renderer 共用）
src/main/types/      主进程内部（DB schema、native addon 类型）
src/renderer/types/  渲染进程内部（组件 props、store 类型）
```

共享类型是 IPC 通信的 **source of truth**。

---

## 2. 命名约定

| 层 | 风格 | 示例 |
| ---- | ---- | ---- |
| shared types | camelCase 字段 | `deviceId`, `frameWidth` |
| DB 列 | snake_case | `device_id`, `frame_width` |
| IPC channel | kebab-case | `audio:get-config` |

边界转换在读写层完成，不在共享类型中混用两种风格。

---

## 3. 核心规则

### 不允许 index signature 替代具体类型

```typescript
// 禁止
interface ServerMessage { [key: string]: unknown }

// 正确 — 判别联合
type ServerMessage =
  | { type: 'llm'; payload: LlmPayload }
  | { type: 'tts'; payload: TtsPayload }
  | { type: 'mcp'; payload: McpPayload }
```

### 不允许数据库类型泄漏到共享层

```typescript
// 禁止 — SQLite 的 0/1 出现在接口中
interface ShortcutConfig { enabled: number }

// 正确
interface ShortcutConfig { enabled: boolean }
// 转换在 DatabaseManager 内部完成
```

### 默认值回填不能覆盖显式配置

运行时初始化可以在配置为空时回填默认值，但不能因为推导出了“更像真实设备”的值，就覆盖数据库里已经存在的显式配置。

```typescript
// 禁止
if (derivedDeviceId !== config.device_id) {
  saveConfig({ device_id: derivedDeviceId })
}

// 正确
if (!config.device_id && derivedDeviceId) {
  saveConfig({ device_id: derivedDeviceId })
}
```

### 不允许同一概念有多个字段

```typescript
// 禁止
interface Status { activated: boolean; isActivated?: boolean }

// 正确 — 一个字段一个概念
interface Status { activated: boolean }
```

### 业务路径禁止 `any`

```typescript
// 禁止 — 协议/IPC/领域对象
function parseHello(data: any) { ... }

// 正确
function parseHello(data: unknown): HelloMessage {
  // 收窄 / 校验后返回
}
```

协议传输发送用 `sendRawText`（帧），会话用户话语用 `sendText`；二者不得同名。

例外（须注释原因）：

* 第三方最小 `*.d.ts` 补丁（如 PIXI）
* 日志序列化等非业务边界

### 跨层 DTO 单一来源

* IPC 入参/出参、事件 payload 优先 `src/shared/types`
* 禁止 main 与 renderer 各定义一份结构相同的 interface
* DB 行类型留在 `src/main/types`，对外经 formatter 转为 shared DTO
* 类型只用文件顶部的静态 `import type`；禁止 `import('...').Type` 查询式类型，避免依赖关系隐藏在字段签名和断言里

### 联合类型提取复用

```typescript
type SourceType = 'text' | 'voice' | 'tts' | 'image'

interface ChatMessage { sourceType: SourceType }
interface AddMessageParams { sourceType: SourceType }
```

---

## 4. 类型守卫

对判别联合使用 type guard，不使用 `as` 断言：

```typescript
function isLlmMessage(msg: ServerMessage): msg is LlmMessage {
  return msg.type === 'llm'
}
```

---

## 5. 禁止模式

| 禁止 | 替代 |
| ---- | ---- |
| `as any` | 定义接口或使用 `unknown` + type guard |
| `!` 非空断言（循环/异步中） | 捕获到局部 const + null check |
| `type X = Y & { [k: string]: unknown }` | 具体字段 |
| 可选 + 必需表示同一概念 | 选一个 |
| `string` 代替有限枚举 | 字面量联合或 enum |
