<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown } from '@lucide/vue'
import type { SelectedElement } from '@/lib/preview-selector'

defineProps<{ element: SelectedElement; cancellable?: boolean }>()
defineEmits<{ cancel: [] }>()
const expanded = ref(false)
</script>

<template>
  <div class="w-full max-w-full rounded-lg border border-neutral-200 bg-white text-left shadow-sm">
    <div class="flex items-center gap-2 px-3 py-2">
      <button type="button" :aria-expanded="expanded" class="flex min-w-0 flex-1 items-center gap-2 text-left" @click="expanded = !expanded">
        <ChevronDown :class="['size-3.5 shrink-0 text-neutral-400 transition-transform duration-200', expanded ? 'rotate-180' : '']" />
        <span class="min-w-0 truncate text-xs text-neutral-700">已选中网页元素: {{ element.tagName }} {{ element.text || element.selector }}</span>
      </button>
      <button v-if="cancellable" type="button" class="shrink-0 text-xs text-neutral-500 hover:text-neutral-900" @click="$emit('cancel')">取消</button>
    </div>
    <div :class="['grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none', expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0']" :inert="!expanded">
      <div class="min-h-0 overflow-hidden">
        <div class="space-y-2 border-t px-3 py-3 text-xs text-neutral-500">
          <p class="break-all"><span class="text-neutral-400">页面：</span>{{ element.url }}</p>
          <p class="break-all"><span class="text-neutral-400">选择器：</span>{{ element.selector }}</p>
          <p v-if="element.sourceFile" class="break-all"><span class="text-neutral-400">源码：</span>{{ element.sourceFile }}{{ element.sourceLine ? `:${element.sourceLine}` : '' }}</p>
          <p>位置 {{ element.rect.x }}, {{ element.rect.y }} · {{ element.rect.width }} × {{ element.rect.height }}</p>
          <p v-if="element.text" class="whitespace-pre-wrap break-words">{{ element.text }}</p>
          <pre class="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-neutral-50 p-2 text-[11px]">{{ element.outerHTML }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
