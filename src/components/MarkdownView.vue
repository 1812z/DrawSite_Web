<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * 项目文档预览与对话消息共用。
 *
 * 内容是后端或模型给的原始文本，必须过 DOMPurify 再 `v-html`，不要直接插原始 HTML。
 * `breaks: true` 让单个换行也变 `<br>`：模型回复和用户输入都习惯用单换行断句，
 * 按 CommonMark 默认行为会把它们并成一段，读起来会粘在一起。
 *
 * `style` 标签和属性一并禁掉：`<style>` 经 `v-html`（innerHTML）插入是**会生效**的
 * （`<script>` 不会），模型输出里塞一段就能改掉整个页面的样式。
 * `marked` 不生成内联样式——表格对齐用的是 `align` 属性——所以禁掉不影响任何 markdown 渲染。
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // 聊天里的链接如果在本页跳转，会把 SPA 状态（当前应用 / 会话）整页丢掉，统一新标签页打开
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

const props = defineProps<{ content: string }>()

const html = computed(() => {
  const raw = marked.parse(props.content, { async: false, breaks: true }) as string
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style'],
    FORBID_ATTR: ['style'],
  })
})
</script>

<template>
  <div class="markdown-body" v-html="html" />
</template>
