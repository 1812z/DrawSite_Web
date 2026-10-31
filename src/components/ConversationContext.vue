<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { request } from '@/lib/http'
import { compressContext, type ContextView } from '@/api/context'

const props = defineProps<{ applicationId: string; conversationId: string; modelId: string; memoryEnabled: boolean; running: boolean; revision: number }>()
const emit = defineEmits<{ progress: [text: string, busy: boolean]; completed: [] }>()
const value = ref<ContextView | null>(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')
let generation = 0
let loadSequence = 0
const percent = computed(() => value.value ? Math.min(100, Math.round(value.value.usedTokens / value.value.budgetTokens * 100)) : 0)
const base = () => `/applications/${props.applicationId}/conversations/${props.conversationId}/context`
function tokens(count: number) { return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count) }
async function load() {
  if (!props.conversationId) { value.value = null; return }
  const current = generation
  const sequence = ++loadSequence
  try {
    const result = await request<ContextView>(`${base()}?memoryEnabled=${props.memoryEnabled}`)
    if (current === generation && sequence === loadSequence) { value.value = result; error.value = ''; if (!busy.value) emit('progress', result.compressionText, result.compressing) }
  } catch (cause) { if (current === generation && sequence === loadSequence) error.value = cause instanceof Error ? cause.message : '加载失败' }
}
async function compress() {
  if (busy.value || props.running || !props.modelId) return
  busy.value = true; error.value = ''; notice.value = ''
  ++loadSequence
  const current = generation
  emit('progress', '', true)
  try {
    const result = await compressContext(base(), props.modelId, props.memoryEnabled, snapshot => {
      if (current === generation) { value.value = snapshot; emit('progress', snapshot.compressionText, true) }
    })
    if (current === generation) { value.value = result; notice.value = '已压缩，原始消息仍保留'; emit('completed') }
  } catch (cause) { if (current === generation) error.value = cause instanceof Error ? cause.message : '压缩失败' }
  finally { ++loadSequence; busy.value = false; if (current === generation) emit('progress', '', false) }
}
watch(() => [props.conversationId, props.memoryEnabled], () => { generation++; value.value = null; notice.value = ''; emit('progress', '', false); void load() }, { immediate: true })
watch(() => [props.revision, props.running], () => { void load() })
const timer = setInterval(() => { if (props.running || busy.value) void load() }, 5000)
onUnmounted(() => { generation++; clearInterval(timer) })
</script>

<template>
  <section class="mt-3 rounded-xl border bg-white p-4">
    <div class="flex items-center gap-3">
      <div class="relative size-12 shrink-0">
        <svg viewBox="0 0 48 48" class="size-12 -rotate-90" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="none" stroke="#e5e5e5" stroke-width="4" /><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" :stroke-dasharray="`${percent * 1.2566} 125.66`" /></svg>
        <span class="absolute inset-0 flex items-center justify-center text-[11px]">{{ percent }}%</span>
      </div>
      <div class="min-w-0 flex-1"><h3 class="text-sm font-medium">会话上下文</h3><p class="mt-1 text-xs text-neutral-500">{{ value ? `${tokens(value.usedTokens)} / ${tokens(value.budgetTokens)} tokens` : '暂无上下文数据' }}</p></div>
      <Button size="sm" variant="outline" :disabled="busy || running || !conversationId || !modelId || value?.compressing || !value?.usedTokens" @click="compress">{{ busy || value?.compressing ? '压缩中…' : '压缩' }}</Button>
    </div>
    <p v-if="value?.hasSummary" class="mt-3 text-[11px] leading-5 text-neutral-400">已有历史摘要。</p>
    <p v-if="notice" role="status" class="mt-2 text-xs text-neutral-500">{{ notice }}</p>
    <p v-if="error" role="alert" class="mt-2 text-xs text-red-600">{{ error }}</p>
  </section>
</template>
