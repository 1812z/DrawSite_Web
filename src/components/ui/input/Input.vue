<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const modelValue = defineModel<string | number>({ default: '' })

interface Props {
  class?: HTMLAttributes['class']
}
const props = withDefaults(defineProps<Props>(), {})
</script>

<template>
  <input
    v-model="modelValue"
    :class="cn('h-10 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50', props.class)"
  />
</template>
