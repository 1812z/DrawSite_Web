<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  class?: HTMLAttributes['class']
}
const props = defineProps<Props>()
</script>

<template>
  <span :class="cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', props.class)">
    <slot />
  </span>
</template>
