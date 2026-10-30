<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { request } from '@/lib/http'

const props = defineProps<{ applicationId: string }>()
type Tab = 'contract' | 'cases' | 'runs'
interface Document { path: string; content: string; sha256: string }
interface Result { id: string; title: string; operationId: string; method: string; path: string; status: string; expectedStatus: number; actualStatus?: number; durationMs: number; error?: string; responseBody?: string }
interface Run { id: string; title: string; status: string; total: number; passed: number; completed: number; reportJson: string; createdAt: string }
interface State { contract: Document | null; suite: Document | null; runs: Run[] }
const tab = ref<Tab>('contract')
const state = ref<State | null>(null)
const busy = ref(false)
const error = ref('')
const expanded = ref<Record<string, boolean>>({})
const base = `/applications/${props.applicationId}/tests`
const contractReady = computed(() => {
  try {
    const document = JSON.parse(state.value?.contract?.content ?? '{}')
    return Object.values(document.paths ?? {}).some(value => Object.keys(value as object).length > 0)
  } catch { return false }
})
function pretty(content?: string | null) { try { return JSON.stringify(JSON.parse(content || '{}'), null, 2) } catch { return content || '' } }
function results(run: Run): Result[] { try { return JSON.parse(run.reportJson).results ?? [] } catch { return [] } }
function percent(run: Run) { return run.total ? Math.round(run.passed / run.total * 100) : 0 }
function status(run: Run) { return run.status === 'RUNNING' ? `执行中 ${run.completed}/${run.total}` : run.status === 'COMPLETED' ? '已完成' : '执行失败' }
async function load() {
  try { state.value = await request<State>(base); error.value = '' }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败' }
}
async function start() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const run = await request<Run>(`${base}/runs`, { method: 'POST', signal: AbortSignal.timeout(60000) })
    expanded.value[run.id] = true; tab.value = 'runs'; await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '发起测试失败' }
  finally { busy.value = false }
}
onMounted(load)
const timer = setInterval(() => { if (state.value?.runs.some(run => run.status === 'RUNNING')) void load() }, 2000)
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-sm font-semibold">API 测试</h2><div class="flex gap-2"><Button size="sm" variant="outline" @click="load">刷新</Button><Button size="sm" :disabled="busy || !contractReady || !state?.suite || state.runs.some(run => run.status === 'RUNNING')" @click="start">{{ busy ? '提交中…' : '发起测试' }}</Button></div></div>
    <nav class="flex gap-1 rounded-lg bg-neutral-100 p-1"><button v-for="item in ([{ key: 'contract', label: '契约规范' }, { key: 'cases', label: '测试用例' }, { key: 'runs', label: '测试执行' }] as const)" :key="item.key" type="button" :class="['flex-1 rounded-md px-2 py-2 text-xs', tab === item.key ? 'bg-white font-medium shadow-sm' : 'text-neutral-500']" @click="tab = item.key">{{ item.label }}</button></nav>
    <p v-if="error" role="alert" class="text-xs text-red-600">{{ error }}</p>
    <template v-if="tab === 'contract'"><pre v-if="state?.contract" class="overflow-auto whitespace-pre-wrap break-all rounded-lg border p-3 text-xs">{{ pretty(state.contract.content) }}</pre><p v-else class="py-8 text-center text-xs text-neutral-400">尚未编写契约</p></template>
    <template v-else-if="tab === 'cases'"><pre v-if="state?.suite" class="overflow-auto whitespace-pre-wrap break-all rounded-lg border p-3 text-xs">{{ pretty(state.suite.content) }}</pre><p v-else class="py-8 text-center text-xs text-neutral-400">尚未生成用例</p></template>
    <div v-else class="space-y-3">
      <p v-if="!state?.runs.length" class="py-8 text-center text-xs text-neutral-400">暂无执行记录</p>
      <article v-for="run in state?.runs" :key="run.id" class="rounded-xl border">
        <button type="button" class="flex w-full items-center gap-3 p-4 text-left" :aria-expanded="!!expanded[run.id]" @click="expanded[run.id] = !expanded[run.id]">
          <div class="min-w-0 flex-1"><h3 class="truncate text-sm font-medium">{{ run.title }}</h3><p class="mt-1 text-[11px] text-neutral-400">{{ new Date(run.createdAt).toLocaleString('zh-CN') }} · {{ status(run) }}</p></div>
          <span class="text-xs tabular-nums">{{ run.passed }}/{{ run.total }}</span>
          <div class="relative size-10 shrink-0"><svg viewBox="0 0 40 40" class="size-10 -rotate-90" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="#e5e5e5" stroke-width="3" /><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" :stroke-dasharray="`${percent(run) * 1.0053} 100.53`" /></svg><span class="absolute inset-0 flex items-center justify-center text-[10px]">{{ percent(run) }}%</span></div>
        </button>
        <div v-if="expanded[run.id]" class="space-y-2 border-t p-3">
          <p v-if="!results(run).length" class="text-xs text-neutral-400">等待执行结果…</p>
          <details v-for="result in results(run)" :key="result.id" class="rounded-lg border p-3 text-xs"><summary class="cursor-pointer"><span :class="result.status === 'PASSED' ? 'text-neutral-700' : 'text-red-600'">{{ result.status === 'PASSED' ? '通过' : '失败' }}</span> · {{ result.method }} {{ result.path }} · {{ result.title }}</summary><div class="mt-3 space-y-2"><p>{{ result.operationId }} · 预期 {{ result.expectedStatus }} / 实际 {{ result.actualStatus ?? '无响应' }} · {{ result.durationMs }}ms</p><p v-if="result.error" class="break-all text-red-600">{{ result.error }}</p><pre v-if="result.responseBody" class="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-neutral-50 p-2">{{ result.responseBody }}</pre></div></details>
          <details class="text-xs text-neutral-500"><summary class="cursor-pointer">JSON 报告</summary><pre class="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all">{{ pretty(run.reportJson) }}</pre></details>
        </div>
      </article>
    </div>
  </section>
</template>
