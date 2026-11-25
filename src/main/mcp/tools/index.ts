/**
 * MCP 工具入口
 * 导入所有工具文件以触发 defineTool() 注册，然后导出 getAllTools
 */

import './volume/tools'
import './app/tools'
import './camera/tools'
import './screenshot/tools'
import './theme/tools'
import './displayMode/tools'
import './system/tools'
import './timer/tools'
import './music/tools'

export { getAllTools } from './registry'
export type { ToolDef } from './registry'
