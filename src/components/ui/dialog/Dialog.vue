<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { onUnmounted, watch } from 'vue'
import { X } from '@lucide/vue'
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  type DialogRootEmits,
  type DialogRootProps,
} from 'reka-ui'
import { cn } from '@/lib/utils'

interface Props extends DialogRootProps {
  title: string
  class?: HTMLAttributes['class']
}
const props = defineProps<Props>()
const emits = defineEmits<DialogRootEmits>()

/**
 * 遮罩自己画，不用 reka 的 DialogOverlay。
 *
 * 原因：DialogOverlay 只在 `modal` 上下文为真时才渲染，实测这个包装层透传 modal 时
 * 遮罩整块不出现 —— 弹窗照开、页面一点不暗、背景还能滚，查颜色和 z-index 都是白费。
 * 遮罩是纯视觉层，一个 fixed 元素 + 内联样式最稳：不受 CSS 加载顺序、utility 覆盖影响。
 */
const backdropStyle = {
  position: 'fixed' as const,
  inset: 0,
  zIndex: 60,
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
  // 模态时 reka 会把 body 设成 pointer-events:none，遮罩必须自己开回来才能接收点击（点遮罩关闭）
  pointerEvents: 'auto' as const,
}
const contentStyle = { zIndex: 61 }

/** 自己接管背景滚动锁：拿掉 DialogOverlay 后 reka 不再代劳 */
let scrollLocks = 0
function setScrollLocked(locked: boolean) {
  if (typeof document === 'undefined') return
  if (locked) {
    if (scrollLocks === 0) document.body.style.overflow = 'hidden'
    scrollLocks += 1
  } else if (scrollLocks > 0) {
    scrollLocks -= 1
    if (scrollLocks === 0) document.body.style.overflow = ''
  }
}

watch(() => props.open, (open) => setScrollLocked(Boolean(open)), { immediate: true })
onUnmounted(() => setScrollLocked(false))
</script>

<template>
  <DialogRoot :open="open" :default-open="defaultOpen" :modal="modal ?? true" @update:open="emits('update:open', $event)">
    <DialogTrigger v-if="$slots.trigger" as-child><slot name="trigger" /></DialogTrigger>
    <DialogPortal>
      <Transition name="ds-fade">
        <div v-if="open" class="ds-backdrop" :style="backdropStyle" aria-hidden="true" />
      </Transition>
      <DialogContent
        :style="contentStyle"
        :class="cn('ds-dialog fixed left-1/2 top-1/2 max-h-[calc(100dvh_-_3rem)] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-background p-6 shadow-lg outline-none', props.class)"
      >
        <div class="flex items-start justify-between gap-4">
          <DialogTitle class="text-base font-medium">{{ title }}</DialogTitle>
          <DialogClose as-child>
            <button type="button" class="rounded-md p-1 text-neutral-500 transition-colors hover:bg-muted" aria-label="关闭">
              <X class="size-4" />
            </button>
          </DialogClose>
        </div>
        <div class="mt-5">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<!-- 不加 scoped：遮罩和内容都渲染在 Teleport 里，用 ds- 前缀保证不误伤其它元素 -->
<style>
/* 打开与关闭都很短：足够看出“弹窗出来了”，又不会挡住操作 */
.ds-dialog[data-state='open'] { animation: ds-dialog-in 190ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.ds-dialog[data-state='closed'] { animation: ds-dialog-out 130ms ease-in both; }

.ds-fade-enter-active { transition: opacity 160ms ease-out; }
.ds-fade-leave-active { transition: opacity 130ms ease-in; }
.ds-fade-enter-from,
.ds-fade-leave-to { opacity: 0; }

@keyframes ds-dialog-in { from { opacity: 0; scale: 0.97; } to { opacity: 1; scale: 1; } }
@keyframes ds-dialog-out { from { opacity: 1; scale: 1; } to { opacity: 0; scale: 0.98; } }

@media (prefers-reduced-motion: reduce) {
  .ds-dialog,
  .ds-fade-enter-active,
  .ds-fade-leave-active { animation: none; transition: none; }
}
</style>
