/**
 * GitHub / electron-updater 发布说明规范化。
 *
 * GitHub Atom feed 常把 release body 以 HTML 交给 electron-updater
 *（例如自动生成的 Full Changelog 链接）。设置页用 Vue 文本插值展示，
 * 直接塞 HTML 会显示成裸标签。这里剥成可读纯文本，不走 v-html。
 */

const BLOCK_TAGS = /<\/?(?:p|div|h[1-6]|li|ul|ol|tr|table|blockquote|pre|section|article|br|hr)(?:\s[^>]*)?>/gi
const ANY_TAG = /<[^>]+>/g
const MULTI_BLANK = /\n{3,}/g
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&([a-z]+);/gi, (full, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? full)
}

function collapseBlankLines(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(MULTI_BLANK, '\n\n').trim()
}

/** 把 GitHub / electron-updater 的 HTML 发布说明剥成可读纯文本。 */
export function stripReleaseNotesHtml(raw: string | null | undefined): string {
  if (!raw)
    return ''

  const text = String(raw)
  if (!looksLikeHtml(text))
    return collapseBlankLines(text)

  const withBreaks = text
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi, '\n')
    .replace(BLOCK_TAGS, '\n')
    .replace(ANY_TAG, '')

  return collapseBlankLines(decodeEntities(withBreaks))
}

/** electron-updater 的 releaseNotes 可能是 string 或 { note }[] */
export function extractReleaseNotes(releaseNotes: unknown): string {
  if (typeof releaseNotes === 'string')
    return stripReleaseNotesHtml(releaseNotes)

  if (Array.isArray(releaseNotes)) {
    return stripReleaseNotesHtml(
      releaseNotes
        .map((item) => {
          if (typeof item === 'string')
            return item
          if (item && typeof item === 'object' && 'note' in item && typeof item.note === 'string')
            return item.note
          return ''
        })
        .filter(Boolean)
        .join('\n'),
    )
  }

  return ''
}
