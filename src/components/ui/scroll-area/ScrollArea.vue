<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  /**
   * 滚动条可见性，对齐 reka-ui / Radix：
   * `auto` 有溢出时常显（默认）、`hover` 悬停或滚动时显示、`scroll` 滚动时显示、`always` 常显、`glimpse` 进入时短暂显示。
   */
  type?: 'auto' | 'always' | 'scroll' | 'hover' | 'glimpse'
  /** `type` 为 `scroll` / `hover` 时，停止交互后隐藏滚动条的延迟（毫秒）。 */
  scrollHideDelay?: number
  class?: HTMLAttributes['class']
  /** 传给滚动视口：滚动容器的 padding 之类写这里，不要写在 `class` 上。 */
  viewportClass?: HTMLAttributes['class']
}>(), {
  type: 'auto',
  scrollHideDelay: 600,
})

defineSlots<{
  default?: () => unknown
}>()
</script>

<template>
  <ScrollAreaRoot :type="type" :scroll-hide-delay="scrollHideDelay" :class="cn('relative', props.class)">
    <ScrollAreaViewport :class="cn('size-full', viewportClass)">
      <slot />
    </ScrollAreaViewport>
    <!-- 滚动条的位置（top / right / bottom）与滑块高度由 reka-ui 以内联样式给出，这里只补宽度和配色 -->
    <ScrollAreaScrollbar orientation="vertical" class="w-2.5 touch-none p-0.5 select-none">
      <ScrollAreaThumb class="rounded-full bg-neutral-300 transition-colors hover:bg-neutral-400 data-[state=hidden]:opacity-0" />
    </ScrollAreaScrollbar>
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
