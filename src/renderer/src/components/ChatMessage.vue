<script setup lang="ts">
import type { ChatMessage } from '../types/chat'
import hljs from 'highlight.js'
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'
import ChatImage from './ChatImage.vue'

const props = defineProps<{
  message: ChatMessage
}>()

// 配置 markdown-it：代码高亮 + 外部链接新窗口打开
const md = new MarkdownIt({
  html: false, // 禁止原始 HTML，防 XSS
  linkify: true, // 自动识别链接
  breaks: true, // 换行转 <br>
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre><code class="hljs language-${lang}">${hljs.highlight(code, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      }
      catch {}
    }
    return `<pre><code class="hljs">${md.utils.escapeHtml(code)}</code></pre>`
  },
})

// 为所有链接添加 target="_blank"
const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, _env, self) {
  return self.renderToken(tokens, idx, options)
}
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return defaultRender(tokens, idx, options, env, self)
}

// 计算渲染后的 HTML（仅在非流式时使用）
const renderedHtml = computed(() => {
  const content = props.message.content
  if (!content)
    return ''
  return md.render(content)
})
</script>

<template>
  <div class="mb-8 flex flex-col">
    <!-- User Message -->
    <div v-if="message.role === 'user'" class="self-end max-w-[80%]">
      <ChatImage
        v-if="message.imageData"
        :image-data="message.imageData"
        class-name="rounded-lg mb-2 max-w-full"
        alt="User uploaded image"
      />
      <div class="bg-[#F3F3F3] dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed select-text">
        {{ message.content }}
      </div>
    </div>

    <!-- Assistant Message -->
    <div v-else class="self-start max-w-[80%]">
      <ChatImage
        v-if="message.imageData"
        :image-data="message.imageData"
        class-name="rounded-lg mb-2 max-w-full shadow-md"
        alt="Screenshot or photo"
      />
      <!-- Markdown 渲染 -->
      <div
        v-if="message.content && message.content !== '[图片]'"
        class="markdown-body text-gray-900 dark:text-gray-100 text-sm leading-relaxed select-text"
        v-html="renderedHtml"
      />
    </div>
  </div>
</template>

<style>
/* Markdown 渲染样式 （非 scoped，因为 v-html 需要全局样式） */
.markdown-body h1 { font-size: 1.25rem; font-weight: 700; margin: 1rem 0 0.5rem; }
.markdown-body h2 { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
.markdown-body h3 { font-size: 1rem; font-weight: 600; margin: 0.5rem 0 0.25rem; }
.markdown-body p { margin: 0.25rem 0; }
.markdown-body ul, .markdown-body ol { padding-left: 1.5rem; margin: 0.25rem 0; }
.markdown-body li { margin: 0.125rem 0; }
.markdown-body a { color: #3b82f6; text-decoration: underline; }
.markdown-body a:hover { color: #2563eb; }
.markdown-body blockquote {
  border-left: 3px solid #d1d5db;
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: #6b7280;
}
.markdown-body code {
  background: #f1f5f9;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.markdown-body pre {
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
  overflow-x: auto;
}
.markdown-body pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  color: inherit;
  font-size: 0.85em;
  line-height: 1.6;
}
/* highlight.js 主题色覆盖 */
.markdown-body .hljs-keyword { color: #c792ea; }
.markdown-body .hljs-string { color: #c3e88d; }
.markdown-body .hljs-number { color: #f78c6c; }
.markdown-body .hljs-comment { color: #676e95; font-style: italic; }
.markdown-body .hljs-function { color: #82aaff; }
.markdown-body .hljs-title { color: #82aaff; }
.markdown-body .hljs-built_in { color: #ffcb6b; }
.markdown-body .hljs-type { color: #ffcb6b; }

/* 暗色模式适配 */
.dark .markdown-body code { background: #334155; }
.dark .markdown-body blockquote {
  border-left-color: #4b5563;
  color: #9ca3af;
}
.dark .markdown-body a { color: #60a5fa; }
</style>
