import type { McpToolCatalogItem } from './types/mcp'

/** Apply only edits the user made relative to the previous server snapshot. */
export function mergeMcpToolDraft(
  items: McpToolCatalogItem[],
  local: Record<string, boolean>,
  savedDisabled: Set<string>,
): Record<string, boolean> {
  return Object.fromEntries(items.map((item) => {
    const changed = item.name in local && local[item.name] !== !savedDisabled.has(item.name)
    return [item.name, changed ? local[item.name] : item.enabled]
  }))
}

/** A visible catalog cannot erase disabled names belonging to unloaded plugins. */
export function mergeMcpDisabledTools(previous: string[], visibleNames: string[], nextVisibleDisabled: string[]): string[] {
  const visible = new Set(visibleNames)
  return Array.from(new Set([
    ...previous.filter(name => !visible.has(name)),
    ...nextVisibleDisabled.filter(name => visible.has(name)),
  ]))
}

export function isMcpToolDraftDirty(local: Record<string, boolean>, savedDisabled: Set<string>): boolean {
  return Object.entries(local).some(([name, enabled]) => enabled !== !savedDisabled.has(name))
}

/** A save response acknowledges the submitted snapshot, not edits made while awaiting it. */
export function mergeMcpToolSaveResult(
  current: Record<string, boolean>,
  submitted: Record<string, boolean>,
  savedDisabled: Set<string>,
): Record<string, boolean> {
  return Object.fromEntries(Object.entries(current).map(([name, enabled]) => [
    name,
    name in submitted && enabled === submitted[name] ? !savedDisabled.has(name) : enabled,
  ]))
}
