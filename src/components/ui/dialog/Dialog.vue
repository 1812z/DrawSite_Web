<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { X } from '@lucide/vue'
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
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
</script>

<template>
  <DialogRoot :open="open" :default-open="defaultOpen" :modal="modal" @update:open="emits('update:open', $event)">
    <DialogTrigger v-if="$slots.trigger" as-child><slot name="trigger" /></DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/30" />
      <DialogContent
        :class="cn('fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-lg outline-none', props.class)"
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
