<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { ArrowUp, FileText, LayoutTemplate, ListChecks, Square } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  modelValue: string
  heading?: string
  subheading?: string
  placeholder?: string
  hint?: string
  disabled?: boolean
  /** 会话已有内容时传 false，隐藏引导文案与示例卡片，只留下输入框。 */
  showIntro?: boolean
  /** 生成中：右下角按钮切换为“停止回复”。 */
  running?: boolean
  /** 停止请求处理中，禁止重复点击。 */
  stopping?: boolean
}>(), {
  heading: '今天，想构建什么？',
  subheading: '描述你的应用，让需求、设计、实现与验证在同一个项目中持续推进。',
  placeholder: '描述应用的使用场景、功能和你的想法…',
  hint: '',
  disabled: false,
  showIntro: true,
  running: false,
  stopping: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [content: string]
  stop: []
}>()

const canSubmit = computed(() => props.modelValue.trim().length > 0)

/** 输入框默认一行，随内容长高，最多 MAX_ROWS 行，超过则内部滚动。 */
const MAX_ROWS = 15
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const inputId = useId()
let resizeObserver: ResizeObserver | null = null
let measuredWidth = 0

function resize() {
  const element = textareaRef.value
  // display:none 时 scrollHeight 为 0，不能用它覆盖有效高度。
  if (!element || element.clientWidth === 0) return
  const style = window.getComputedStyle(element)
  const lineHeight = Number.parseFloat(style.lineHeight) || 24
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
  const maxHeight = lineHeight * MAX_ROWS + padding
  element.style.height = 'auto'
  const next = Math.max(lineHeight + padding, Math.min(element.scrollHeight, maxHeight))
  element.style.height = `${next}px`
  element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

const suggestions = [
  { title: '设计一个应用', description: '从目标、场景和业务需求开始', icon: LayoutTemplate, prompt: '我想开发一个应用，面向的用户是……，主要解决……问题，需要具备……功能。' },
  { title: '梳理需求', description: '把想法整理成清晰的需求说明', icon: FileText, prompt: '请帮助我分析下面的需求，明确业务场景、规则和验收条件：' },
  { title: '规划开发步骤', description: '明确模块、接口和验证目标', icon: ListChecks, prompt: '请根据以下应用需求，规划系统模块、数据实体、API 和测试目标：' },
]

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  resize()
}

/** Enter 提交，Shift+Enter 换行；输入法组合中不触发。 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  submit()
}

function submit() {
  if (!canSubmit.value || props.disabled) return
  emit('submit', props.modelValue.trim())
}

/** 示例卡片等程序化赋值后同步高度。 */
watch(() => props.modelValue, () => { void nextTick(resize) })
onMounted(() => {
  resize()
  resizeObserver = new ResizeObserver(([entry]) => {
    const width = entry?.contentRect.width ?? 0
    if (width <= 0) { measuredWidth = 0; return }
    if (width === measuredWidth) return
    measuredWidth = width
    resize()
  })
  if (textareaRef.value) resizeObserver.observe(textareaRef.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="flex w-full max-w-3xl flex-col" :class="{ 'justify-center': showIntro }">
    <div v-if="showIntro && (heading || subheading)" class="mb-6">
      <p class="mb-3 text-sm text-muted-foreground">从一个想法开始</p>
      <h2 class="text-2xl font-medium tracking-tight md:text-3xl">{{ heading }}</h2>
      <p class="mt-3 text-sm leading-7 text-muted-foreground">{{ subheading }}</p>
    </div>
    <form class="relative rounded-2xl border bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]" @submit.prevent="submit">
      <label class="sr-only" :for="inputId">应用需求</label>
      <textarea
        :id="inputId"
        ref="textareaRef"
        :value="modelValue"
        rows="1"
        maxlength="20000"
        :placeholder="placeholder"
        :disabled="disabled"
        class="block min-h-9 w-full resize-none overflow-hidden bg-transparent px-1 py-1 pr-12 text-sm leading-7 outline-none placeholder:text-neutral-400"
        @input="onInput"
        @keydown="onKeydown"
      />
      <div v-if="$slots.toolbar" class="mt-3 flex flex-wrap items-center gap-2 pr-14">
        <slot name="toolbar" />
      </div>
      <p v-if="hint" class="mt-3 truncate pr-14 text-xs text-muted-foreground" :title="hint">{{ hint }}</p>
      <!-- 右下角按钮同一位置：生成中显示停止图标，平时显示发送图标 -->
      <Button
        v-if="running"
        type="button"
        size="icon"
        class="absolute right-4 bottom-4 rounded-full"
        :disabled="stopping"
        aria-label="停止回复"
        @click="emit('stop')"
      ><Square class="size-4 fill-current" /></Button>
      <Button
        v-else
        type="submit"
        size="icon"
        class="absolute right-4 bottom-4 rounded-full"
        :disabled="!canSubmit || disabled"
        aria-label="提交"
      ><ArrowUp /></Button>
    </form>
    <div v-if="showIntro" class="mt-5 grid gap-3 sm:grid-cols-3">
      <button
        v-for="item in suggestions"
        :key="item.title"
        type="button"
        class="rounded-xl border p-4 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        @click="emit('update:modelValue', item.prompt)"
      >
        <component :is="item.icon" class="mb-4 size-4 text-neutral-500" />
        <p class="text-sm font-medium">{{ item.title }}</p>
        <p class="mt-2 text-xs leading-5 text-muted-foreground">{{ item.description }}</p>
      </button>
    </div>
  </div>
</template>
