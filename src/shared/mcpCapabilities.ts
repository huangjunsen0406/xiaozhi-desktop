/** Public host.get capabilities shared by IPC, runtime and settings. */
export const MCP_HOST_CAPABILITIES = ['logger', 'config_readonly', 'media_player', 'subtitle'] as const
export type McpHostCapability = typeof MCP_HOST_CAPABILITIES[number]

export function isMcpHostCapability(value: unknown): value is McpHostCapability {
  return typeof value === 'string' && MCP_HOST_CAPABILITIES.includes(value as McpHostCapability)
}

/** Only persisted legacy configuration may translate bubble into subtitle. */
export function normalizeMcpHostCapabilities(values: unknown[], migrateLegacy = false): McpHostCapability[] {
  const normalized = values.map(value => migrateLegacy && value === 'bubble' ? 'subtitle' : value)
  return Array.from(new Set<McpHostCapability>([
    'logger',
    'config_readonly',
    ...normalized.filter(isMcpHostCapability),
  ]))
}
