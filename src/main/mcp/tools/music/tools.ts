/**
 * 音乐工具定义
 * 音乐工具较复杂（有 MusicToolsManager），通过代理方式注册
 * 在 tools/index.ts 中通过 registerMusicTools() 单独处理
 */

// 音乐工具通过 MusicToolsManager.register() 注册到 McpServer
// 由于 MusicToolsManager 内部管理了 MusicPlayer 的状态和生命周期，
// 暂不拆分为 defineTool 模式，保持现有的 register 调用方式
export {}
