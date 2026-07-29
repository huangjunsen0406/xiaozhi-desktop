/**
 * MCP 外挂示例：com.example.hello
 *
 * 导出 register(host)，由主进程 node-inprocess 加载。
 * 可用 TypeScript 编写后编译为本文件，或直接维护 JS。
 *
 * @param {import('../../../src/main/mcp/plugins/types').McpHost} host
 */
function register(host) {
  const logger = host.get('logger')

  host.tool(
    'example.hello',
    `Say hello from an external MCP plugin.

中文：用此外挂打个招呼。

Use this tool when:
1. User greets or asks to test external MCP plugins
2. Debugging plugin load path

Examples:
- "打个招呼" → example.hello with name optional
- "hello from plugin" → example.hello`,
    [
      {
        name: 'name',
        type: 'string',
        defaultValue: 'World',
      },
    ],
  )(async (args) => {
    const name = typeof args.name === 'string' ? args.name : 'World'
    if (logger && typeof logger.info === 'function') {
      logger.info('example.hello called', { name })
    }
    return `Hello, ${name}! (from com.example.hello)`
  })
}

// CJS + ESM 双导出兼容
module.exports = { register }
module.exports.register = register
module.exports.default = register
