<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { cn } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
}

/** 下拉选择统一使用本组件，不要再写原生 <select>。 */
interface Props {
  items: SelectOption[]
  placeholder?: string
  disabled?: boolean
  id?: string
  ariaLabel?: string
  class?: HTMLAttributes['class']
  contentClass?: HTMLAttributes['class']
}
const props = defineProps<Props>()
const modelValue = defineModel<string>({ default: '' })
</script>

<template>
  <SelectRoot v-model="modelValue" :disabled="disabled">
    <SelectTrigger
      type="button"
      :id="id"
      :aria-label="ariaLabel"
      :class="cn('flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-neutral-400', props.class)"
    >
      <span class="min-w-0 truncate"><SelectValue :placeholder="placeholder" /></span>
      <SelectIcon as-child><ChevronDown class="size-3.5 shrink-0 text-neutral-400" /></SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        :body-lock="false"
        :class="cn('z-50 max-h-72 min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-lg border bg-background p-1 shadow-md outline-none', props.contentClass)"
      >
        <SelectViewport>
          <SelectItem
            v-for="item in items"
            :key="item.value"
            :value="item.value"
            class="relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-7 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
          >
            <SelectItemIndicator class="absolute left-2 flex items-center"><Check class="size-3.5" /></SelectItemIndicator>
            <SelectItemText>{{ item.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
