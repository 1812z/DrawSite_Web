<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getProgress } from '@/api/applications'
import type { ProgressSummary } from '@/api/applications'
import RefreshButton from '@/components/RefreshButton.vue'

const props = defineProps<{ applicationId: string }>()
const progress = ref<ProgressSummary | null>(null)
const loading = ref(false)
const error = ref('')
const labels = { TODO: '未完成', IN_PROGRESS: '进行中', DONE: '完成' }
async function load() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try { progress.value = await getProgress(props.applicationId) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '加载开发进度失败' }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-sm font-medium">开发进度</h3>
      <RefreshButton variant="ghost" class="size-7" :loading="loading" label="刷新开发进度" @click="load" />
    </div>
    <p v-if="error" role="alert" class="text-xs leading-6 text-red-600">{{ error }}</p>
    <template v-if="progress && !error">
      <div class="rounded-xl border p-4">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-xs text-neutral-500">已完成节点</span>
          <span class="text-lg font-semibold tabular-nums">{{ progress.completion }}</span>
        </div>
        <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" :aria-valuenow="progress.percent" :aria-valuemin="0" :aria-valuemax="100" :aria-label="`已完成 ${progress.completion} 个开发节点`">
          <div class="h-full rounded-full bg-neutral-800 transition-all" :style="{ width: `${progress.percent}%` }" />
        </div>
        <p class="mt-2 flex gap-4 text-[11px] text-neutral-500"><span>进行中 {{ progress.inProgress }}</span><span>未完成 {{ progress.pending }}</span></p>
      </div>
      <p v-if="!progress.total" class="rounded-xl border border-dashed p-6 text-center text-xs text-neutral-400">暂无开发节点，AI 可通过进度管理工具创建</p>
      <ol v-else class="space-y-3">
        <li v-for="(node, index) in progress.features" :key="node.id" class="rounded-xl border bg-white p-4">
          <div class="flex items-start gap-3">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs text-neutral-500">{{ index + 1 }}</span>
            <h4 class="min-w-0 flex-1 break-words text-sm font-medium leading-6">{{ node.title }}</h4>
            <span :class="['shrink-0 rounded-full px-2 py-1 text-[11px]', node.status === 'DONE' ? 'bg-neutral-800 text-white' : node.status === 'IN_PROGRESS' ? 'border border-neutral-600 text-neutral-800' : 'bg-neutral-100 text-neutral-500']">{{ labels[node.status] }}</span>
          </div>
          <p v-if="node.notes" class="mt-2 whitespace-pre-wrap text-xs leading-6 text-neutral-500">{{ node.notes }}</p>
          <ul v-if="node.acceptanceCriteria.length" class="mt-2 list-inside list-disc space-y-1 text-xs leading-5 text-neutral-500">
            <li v-for="(criterion, i) in node.acceptanceCriteria" :key="i">{{ criterion }}</li>
          </ul>
        </li>
      </ol>
    </template>
    <p v-else-if="loading" class="py-6 text-xs text-neutral-400">加载开发进度…</p>
  </section>
</template>
