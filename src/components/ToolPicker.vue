<script setup lang="ts">
import { computed } from 'vue'
import { Check, LoaderCircle, Wrench } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ProjectTool } from '@/api/agent'

const props = withDefaults(defineProps<{
  /**
   * 后端 `GET /agent/tools` 的目录。现在是按**模块**聚合的 `{id, name, description}`：
   * 显示 `name`（如「文件操作」），提交 `id`（如 `file`），选中模块即开放该模块下全部函数。
   * 前端既不硬编码模块 id，也不展开到函数名——提交函数名只是后端保留的兼容路径。
   */
  tools: ProjectTool[]
  loading?: boolean
  error?: string
  /** 所选模型是否声明 supportsTools；false 时后端会返回 400 TOOLS_UNSUPPORTED */
  supported: boolean
  /**
   * 本次是否真的会调用工具：模型支持 且 至少选中一个模块。
   * 没有总开关，这个状态是推导出来的，由父组件按同一表达式算出（请求体也用它），这里只负责显示。
   */
  enabled: boolean
  selected: string[]
  disabled?: boolean
}>(), {
  loading: false,
  error: '',
  disabled: false,
})

const emit = defineEmits<{
  'update:selected': [value: string[]]
}>()

const selectedSet = computed(() => new Set(props.selected))
const allSelected = computed(() => props.tools.length > 0 && props.selected.length === props.tools.length)

const label = computed(() => {
  // 模型不支持时优先暴露这个事实：去勾模块改变不了结果，显示“未选”只会让人白找
  if (!props.supported) return '工具 · 模型不支持'
  if (props.tools.length === 0) return '工具'
  if (props.selected.length === 0) return '工具 · 未选'
  // 只有一个模块时直接报模块名，比“全部 1”可读
  if (props.tools.length === 1) return `工具 · ${props.tools[0].name}`
  if (allSelected.value) return `工具 · 全部 ${props.tools.length}`
  return `工具 · ${props.selected.length}/${props.tools.length}`
})

/** 按目录顺序回写 id，保持选择数组稳定，避免每次点击都换顺序。 */
function emitSelection(next: Set<string>) {
  emit('update:selected', props.tools.map((tool) => tool.id).filter((id) => next.has(id)))
}

function toggle(id: string) {
  const next = new Set(props.selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  emitSelection(next)
}
</script>

<template>
  <Popover
    class="w-80"
    align="start"
    :side-offset="6"
    :disabled="disabled"
    trigger-label="工具调用设置"
    :trigger-class="['h-8 gap-1.5 px-2 text-xs [&_svg]:size-3.5', enabled ? 'border-neutral-800 text-neutral-800' : 'text-neutral-500']"
  >
    <template #trigger>
      <Wrench />{{ label }}
    </template>

    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs font-medium">工具调用</p>
        <p class="mt-0.5 text-[11px] leading-4 text-muted-foreground">让模型读写当前项目文件</p>
      </div>
      <div v-if="supported && tools.length > 0" class="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="sm" class="h-6 gap-0 px-1.5 text-[11px] font-normal text-neutral-500" @click="emitSelection(new Set(tools.map((tool) => tool.id)))">全选</Button>
        <Button variant="ghost" size="sm" class="h-6 gap-0 px-1.5 text-[11px] font-normal text-neutral-500" @click="emitSelection(new Set())">清空</Button>
      </div>
    </div>

    <p v-if="!supported" class="mt-3 rounded-lg border border-dashed px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
      当前模型未开启工具支持，本次不会调用工具。到「设置 → 平台管理」为该模型打开「支持工具调用」，或换一个已开启的模型。
    </p>

    <template v-else>
      <p v-if="loading" class="flex items-center gap-1.5 py-3 text-[11px] text-muted-foreground"><LoaderCircle class="size-3 animate-spin" />加载工具列表…</p>
      <p v-else-if="error" class="py-3 text-[11px] leading-4 text-red-600">{{ error }}</p>
      <p v-else-if="tools.length === 0" class="py-3 text-[11px] text-muted-foreground">后端没有注册任何工具模块。</p>
      <!--
        gap 必须写在插槽内的这个容器上：ScrollAreaViewport 会在视口里再套一层
        无 class 的包装 div 才渲染插槽，写在 viewportClass 上的 space-y-* 只会落到
        那层包装 div（视口的唯一子节点）上，卡片之间依然是零间距、底色互相贴住。
      -->
      <ScrollArea v-else class="mt-2.5" viewport-class="max-h-60">
        <div class="space-y-1">
          <button
            v-for="tool in tools"
            :key="tool.id"
            type="button"
            :aria-pressed="selectedSet.has(tool.id)"
            :class="['flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors', selectedSet.has(tool.id) ? 'bg-[#f0f0f0] hover:bg-[#e8e8e8]' : 'hover:bg-black/5']"
            @click="toggle(tool.id)"
          >
            <span :class="['mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border', selectedSet.has(tool.id) ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-300']">
              <Check v-if="selectedSet.has(tool.id)" class="size-2.5" />
            </span>
            <span class="min-w-0">
              <span class="block text-[11px] leading-4">{{ tool.name }}</span>
              <span class="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{{ tool.description }}</span>
            </span>
          </button>
        </div>
      </ScrollArea>

      <p v-if="selected.length === 0" class="mt-2 text-[11px] leading-4 text-muted-foreground">
        没有选择任何工具模块，本次会按纯对话处理。
      </p>
    </template>
  </Popover>
</template>
