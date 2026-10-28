import type { McpToolCatalogItem } from '../../shared/types/mcp'
import assert from 'node:assert/strict'
import { it } from 'node:test'
import {
  isMcpToolDraftDirty,
  mergeMcpDisabledTools,
  mergeMcpToolDraft,
  mergeMcpToolSaveResult,
} from '../../shared/mcpToolState'

function item(name: string, enabled: boolean): McpToolCatalogItem {
  return { name, enabled } as McpToolCatalogItem
}

it('preserves edits across refresh while unedited and new tools follow the new server snapshot', () => {
  const saved = new Set(['previously-disabled'])
  const local = { 'edited': false, 'unchanged': true, 'previously-disabled': false, 'removed': false }
  const nextItems = [
    item('edited', true),
    item('unchanged', false),
    item('previously-disabled', true),
    item('new', true),
  ]
  const merged = mergeMcpToolDraft(nextItems, local, saved)
  assert.deepEqual(merged, {
    'edited': false,
    'unchanged': false,
    'previously-disabled': true,
    'new': true,
  })
  const nextSaved = new Set(nextItems.filter(item => !item.enabled).map(item => item.name))
  assert.equal(isMcpToolDraftDirty(merged, nextSaved), true)
  assert.equal(isMcpToolDraftDirty({ unchanged: false }, nextSaved), false)
  assert.deepEqual(mergeMcpToolDraft(nextItems, merged, nextSaved), merged)
})

it('retains disabled history for unloaded tools and ignores obsolete draft names', () => {
  assert.deepEqual(
    mergeMcpDisabledTools(['missing', 'visible'], ['visible', 'new'], ['new', 'deleted']),
    ['missing', 'new'],
  )
  assert.deepEqual(mergeMcpDisabledTools(['missing'], [], ['deleted']), ['missing'])
})

it('preserves edits made while a save awaits reconnect and removes deleted rows', async () => {
  const submitted = { editedDuringSave: true, unchanged: false, deleted: false }
  let resolve!: (value: Set<string>) => void
  const save = new Promise<Set<string>>((done) => {
    resolve = done
  })
  const current = { editedDuringSave: false, unchanged: false, appearedDuringSave: false }
  resolve(new Set(['unchanged']))
  const savedDisabled = await save
  const result = mergeMcpToolSaveResult(current, submitted, savedDisabled)
  assert.deepEqual(result, { editedDuringSave: false, unchanged: false, appearedDuringSave: false })
  assert.equal(isMcpToolDraftDirty(result, savedDisabled), true)
})
