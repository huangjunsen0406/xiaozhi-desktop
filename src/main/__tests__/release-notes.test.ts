/**
 * GitHub / electron-updater 发布说明 HTML → 纯文本
 * 运行：npx tsx --test src/main/__tests__/release-notes.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractReleaseNotes, stripReleaseNotesHtml } from '../../shared/releaseNotes'

describe('stripReleaseNotesHtml', () => {
  it('turns GitHub auto changelog HTML into readable text', () => {
    const raw = '<p><strong>Full Changelog</strong>: <a class="commit-link" href="https://github.com/huangjunsen0406/xiaozhi-desktop/compare/v1.1.6...v1.1.7">huangjunsen0406/xiaozhi-desktop@<tt>v1.1.6...v1.1.7</tt></a></p>'
    assert.equal(
      stripReleaseNotesHtml(raw),
      'Full Changelog: huangjunsen0406/xiaozhi-desktop@v1.1.6...v1.1.7',
    )
  })

  it('keeps markdown-looking notes as-is', () => {
    const raw = '## Fixes\n- crash on launch\n- **bold** stays'
    assert.equal(stripReleaseNotesHtml(raw), raw)
  })

  it('decodes entities and collapses blank lines', () => {
    const raw = '<p>A &amp; B</p>\n\n\n<p>C&#39;s</p>'
    assert.equal(stripReleaseNotesHtml(raw), 'A & B\n\nC\'s')
  })

  it('returns empty for blank input', () => {
    assert.equal(stripReleaseNotesHtml(''), '')
    assert.equal(stripReleaseNotesHtml(null), '')
    assert.equal(stripReleaseNotesHtml(undefined), '')
  })
})

describe('extractReleaseNotes', () => {
  it('joins array notes then strips HTML', () => {
    const notes = extractReleaseNotes([
      { note: '<p>one</p>' },
      { note: '<p>two</p>' },
    ])
    assert.equal(notes, 'one\n\ntwo')
  })

  it('accepts a plain string', () => {
    assert.equal(extractReleaseNotes('plain'), 'plain')
  })
})
