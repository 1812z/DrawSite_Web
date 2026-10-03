<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const modelValue = defineModel<string>({ default: '' })

interface Props {
  rows?: number
  maxlength?: number
  placeholder?: string
  class?: HTMLAttributes['class']
}
const props = withDefaults(defineProps<Props>(), { rows: 4 })
</script>

<template>
  <textarea
    v-model="modelValue"
    :rows="rows"
    :maxlength="maxlength"
    :placeholder="placeholder"
    :class="cn('w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50', props.class)"
  />
</template>
