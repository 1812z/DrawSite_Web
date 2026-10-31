<script setup lang="ts">
import { ref } from 'vue'
import { FileJson, FileText, LoaderCircle } from '@lucide/vue'
import MarkdownView from '@/components/MarkdownView.vue'
import ProjectProgress from './ProjectProgress.vue'
import { useTabRefresh } from '@/lib/tab-refresh'
import * as applicationsApi from '@/api/applications'
import type { DocumentView } from '@/api/applications'

/** 文档标签：左侧文档列表 + 正文。进标签时默认打开第一份（需求说明）。 */
const props = defineProps<{ applicationId: string; revision: number; running: boolean }>()

// AGENTS.md 不在这里：它是项目记忆，归「记忆」标签，避免两个标签重复列同一个文件
const DOCUMENTS: { path: string; label: string; kind: 'markdown' | 'json' }[] = [
  { path: 'docs/requirements.md', label: '需求说明', kind: 'markdown' },
  { path: 'docs/design/overview.md', label: '概要设计', kind: 'markdown' },
  { path: 'docs/design/detail.md', label: '详细设计', kind: 'markdown' },
  { path: 'progress.json', label: '开发进度', kind: 'json' },
]

const activeDocument = ref<DocumentView | null>(null)
const currentPath = ref(DOCUMENTS[0]!.path)
const loading = ref(false)
const error = ref('')

/** silent：后台校验式刷新，不清空正文、不闪加载态；失败也保留上一次的内容 */
async function loadDocument(documentPath: string, silent = false) {
  currentPath.value = documentPath
  if (!silent) {
    activeDocument.value = null
    loading.value = true
  }
  error.value = ''
  try {
    activeDocument.value = await applicationsApi.getDocument(props.applicationId, documentPath)
  } catch (cause) {
    if (!silent) {
      activeDocument.value = null
      error.value = cause instanceof Error ? cause.message : '加载文档失败'
    }
  } finally {
    loading.value = false
  }
}

useTabRefresh(() => loadDocument(currentPath.value, !!activeDocument.value), {
  revision: () => props.revision,
  running: () => props.running,
})

function prettyJson(content: string): string {
  if (!content.trim()) return ''
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

function isMarkdown(path: string | undefined): boolean {
  return DOCUMENTS.find((item) => item.path === path)?.kind === 'markdown'
}
</script>

<template>
  <div>
    <div class="space-y-0.5">
      <button
        v-for="document in DOCUMENTS"
        :key="document.path"
        :aria-current="activeDocument?.path === document.path ? 'page' : undefined"
        :class="['flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors', activeDocument?.path === document.path ? 'bg-[#eaeaea] font-medium' : 'text-neutral-600 hover:bg-black/5']"
        @click="loadDocument(document.path)"
      >
        <component :is="document.kind === 'json' ? FileJson : FileText" class="size-3.5 shrink-0 text-neutral-400" />
        <span class="min-w-0 truncate">{{ document.label }}</span>
      </button>
    </div>

    <div class="mt-4">
      <p v-if="loading" class="flex items-center gap-2 py-6 text-xs text-muted-foreground"><LoaderCircle class="animate-spin" />加载文档…</p>
      <p v-else-if="error" class="py-6 text-xs leading-6 text-red-600">{{ error }}</p>
      <template v-else-if="activeDocument">
        <p v-if="!activeDocument.content" class="py-6 text-center text-xs text-muted-foreground">文档内容为空</p>
        <template v-else>
          <p class="mb-3 font-mono text-[11px] text-neutral-400">{{ activeDocument.path }}</p>
          <ProjectProgress v-if="activeDocument.path === 'progress.json'" :application-id="applicationId" :running="running" />
          <MarkdownView v-else-if="isMarkdown(activeDocument.path)" :content="activeDocument.content" />
          <pre v-else class="overflow-x-auto rounded-lg bg-[#f8f8f8] p-3 font-mono text-[11px] leading-5">{{ prettyJson(activeDocument.content) }}</pre>
        </template>
      </template>
    </div>
  </div>
</template>
