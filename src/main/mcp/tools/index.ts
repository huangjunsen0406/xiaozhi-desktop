/**
 * MCP 工具入口
 * 导入所有工具文件以触发 defineTool() 注册，然后导出 getAllTools
 */

// 导入各领域工具（副作用：触发 defineTool 注册）
import './volume/tools'
import './app/tools'
import './camera/tools'
import './screenshot/tools'
import './theme/tools'
import './displayMode/tools'
import './system/tools'
import './timer/tools'
// 音乐工具通过 MusicToolsManager 单独注册，不走 defineTool

export { getAllTools } from './registry'
export type { ToolDef } from './registry'
