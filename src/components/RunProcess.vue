<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Ban, Check, ChevronDown, ChevronRight, LoaderCircle, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import MarkdownView from '@/components/MarkdownView.vue'
import type { RunStep } from '@/api/agent'

/**
 * 任务运行过程。数据来自 `RunView.steps`（运行中的实时快照）或消息列表返回的 `steps`（已落库的历史）。
 *
 * 正在生成的那一轮，文本同时存在于 `RunView.content` 和一条 `RUNNING` 的 `RESPONSE` step 里
 * （后端 `append` 两处都写）；最终轮的 `RESPONSE` step 会在 `roundFinished` 时被后端移除。
 * 所以这里把末尾那条还在 RUNNING 的 RESPONSE 排掉——它的内容就是正在显示的回复正文，不排会重复一遍。
 */
const props = withDefaults(defineProps<{
  steps: RunStep[]
  /** 任务仍在运行：过程默认展开，让用户看得到实时进度 */
  running?: boolean
}>(), {
  running: false,
})

const visibleSteps = computed(() => {
  const last = props.steps.at(-1)
  if (last && last.type === 'RESPONSE' && last.status === 'RUNNING') return props.steps.slice(0, -1)
  return props.steps
})

// 中间过程默认折叠；跑完自动收起，别让已完成的对话被撑得很长
const expanded = ref(props.running)
watch(() => props.running, (value) => {
  if (!value) expanded.value = false
})

// 每个 step 的内容（思考/工具参数与结果）默认折叠，点标题行右侧箭头展开
const expandedSteps = ref<Set<string>>(new Set())

function toggleStep(id: string) {
  const next = new Set(expandedSteps.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedSteps.value = next
}

function isStepExpanded(id: string): boolean {
  return expandedSteps.value.has(id)
}

// 回复正文（RESPONSE）不折叠
function isCollapsible(step: RunStep): boolean {
  return step.type !== 'RESPONSE' && Boolean(step.content)
}

const roundCount = computed(() => new Set(visibleSteps.value.map((step) => step.round)).size)
const hasFailure = computed(() => visibleSteps.value.some((step) => step.status === 'FAILED'))

function duration(step: RunStep): string {
  if (!step.finishedAt) return ''
  const ms = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`
}
</script>

<template>
  <div v-if="visibleSteps.length" class="mt-2">
    <Button
      variant="ghost"
      size="sm"
      class="h-6 gap-1 px-1.5 text-[11px] font-normal text-neutral-500 [&_svg]:size-3"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <ChevronRight class="size-3 transition-transform" :class="expanded ? 'rotate-90' : ''" />
      过程 · {{ visibleSteps.length }} 步
      <span v-if="hasFailure" class="text-red-600">有失败</span>
    </Button>

    <ol v-if="expanded" class="mt-1 space-y-1.5 border-l border-neutral-200 pl-3">
      <li v-for="step in visibleSteps" :key="step.id" class="text-[11px]">
        <div
          class="flex items-center gap-1.5 text-neutral-600"
          :class="isCollapsible(step) ? 'w-fit cursor-pointer rounded hover:bg-black/[0.04]': ''"
          @click="isCollapsible(step) && toggleStep(step.id)"
        >
          <LoaderCircle v-if="step.status === 'RUNNING'" class="size-3 shrink-0 animate-spin text-neutral-400" />
          <Check v-else-if="step.status === 'SUCCEEDED'" class="size-3 shrink-0 text-neutral-400" />
          <X v-else-if="step.status === 'FAILED'" class="size-3 shrink-0 text-red-600" />
          <Ban v-else class="size-3 shrink-0 text-neutral-400" />
          <span class="font-medium">{{ step.title }}</span>
          <code v-if="step.toolName" class="shrink-0 font-mono text-[10px] text-neutral-400">{{ step.toolName }}</code>
          <span v-if="roundCount > 1" class="shrink-0 text-[10px] text-neutral-400">第 {{ step.round }} 轮</span>
          <span v-if="duration(step)" class="shrink-0 text-[10px] text-neutral-400">{{ duration(step) }}</span>
          <!-- 展开箭头：紧跟时间右侧，默认折叠，展开后箭头朝下 -->
          <ChevronDown v-if="isCollapsible(step) && isStepExpanded(step.id)" class="size-3 shrink-0 text-neutral-400" />
          <ChevronRight v-else-if="isCollapsible(step)" class="size-3 shrink-0 text-neutral-400" />
        </div>

        <!-- 回复正文（RESPONSE）始终展示；思考 / 工具参数默认折叠、点击箭头展开 -->
        <div v-if="step.content && (step.type === 'RESPONSE' || isStepExpanded(step.id))">
          <pre
            v-if="step.type === 'TOOL'"
            class="mt-1 max-h-80 overflow-auto rounded-md bg-black/[0.04] px-2 py-1.5 font-mono text-[10px] leading-4 whitespace-pre-wrap break-words"
            v-memo="[step.content]"
          >{{ step.content }}</pre>
          <div v-else class="mt-1 max-h-60 overflow-y-auto">
            <MarkdownView v-memo="[step.content]" class="markdown-body--compact" :content="step.content" />
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>
