<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { cn } from '@/lib/utils'

/** 布尔开关统一使用本组件，不要再用 <input type="checkbox">。 */
interface Props {
  disabled?: boolean
  id?: string
  class?: HTMLAttributes['class']
}
const props = defineProps<Props>()
const modelValue = defineModel<boolean>({ default: false })
</script>

<template>
  <SwitchRoot
    v-model="modelValue"
    :disabled="disabled"
    :id="id"
    :class="cn('inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-neutral-300 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-neutral-800', props.class)"
  >
    <SwitchThumb class="pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
  </SwitchRoot>
</template>
