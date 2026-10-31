<script setup lang="ts">
import { ref } from 'vue'
import { LoaderCircle, NotebookText, RotateCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import MarkdownView from '@/components/MarkdownView.vue'
import { describeError } from '@/lib/errors'
import { useTabRefresh } from '@/lib/tab-refresh'
import { ApiError } from '@/lib/http'
import * as applicationsApi from '@/api/applications'
import type { DocumentView } from '@/api/applications'

/**
 * 记忆标签：项目记忆 = 工作区里的 AGENTS.md
 */
const props = defineProps<{ applicationId: string; revision: number; running: boolean }>()

const memoryDocument = ref<DocumentView | null>(null)
const loading = ref(false)
const error = ref('')
const missing = ref(false)

/** silent：后台校验式刷新，不转圈、不清空正文；失败保留上一次的内容 */
async function loadMemory(silent = false) {
  if (!silent) {
    loading.value = true
    error.value = ''
    missing.value = false
  }
  try {
    memoryDocument.value = await applicationsApi.getDocument(props.applicationId, 'AGENTS.md')
    missing.value = false
    error.value = ''
  } catch (cause) {
    const notFound = cause instanceof ApiError && cause.code === 'DOCUMENT_NOT_FOUND'
    if (notFound) {
      memoryDocument.value = null
      missing.value = true
    } else if (!silent) {
      memoryDocument.value = null
      error.value = describeError(cause, '加载项目记忆失败')
    }
  } finally {
    if (!silent) loading.value = false
  }
}

useTabRefresh(() => loadMemory(!!memoryDocument.value || missing.value), {
  revision: () => props.revision,
  running: () => props.running,
})
</script>

<template>
  <div>
    <div class="flex items-center gap-2.5">
      <NotebookText class="size-4 shrink-0 text-neutral-500" />
      <h2 class="text-sm font-medium">项目记忆</h2>
      <span class="ml-auto font-mono text-[11px] text-neutral-400">AGENTS.md</span>
      <Button variant="ghost" size="icon" class="size-7" aria-label="刷新项目记忆" title="刷新项目记忆" :disabled="loading" @click="loadMemory()">
        <LoaderCircle v-if="loading" class="animate-spin" />
        <RotateCw v-else />
      </Button>
    </div>

    <div class="mt-4">
      <p v-if="error" class="py-6 text-xs leading-6 text-red-600">{{ error }}</p>
      <div v-else-if="missing" class="rounded-xl border border-dashed px-4 py-8 text-center">
        <p class="text-xs text-neutral-400">还没有 AGENTS.md</p>
        <p class="mt-2 text-xs leading-6 text-muted-foreground">在对话里让 AI 把项目偏好和已确认的决策记下来，就会生成这个文件。</p>
      </div>
      <template v-else-if="memoryDocument">
        <p v-if="!memoryDocument.content" class="py-6 text-center text-xs text-muted-foreground">AGENTS.md 内容为空</p>
        <MarkdownView v-else :content="memoryDocument.content" />
      </template>
      <p v-else class="py-6 text-center text-xs text-muted-foreground">尚未加载</p>
    </div>
  </div>
</template>
