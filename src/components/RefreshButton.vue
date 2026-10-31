<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { LoaderCircle, RotateCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { ButtonVariants } from '@/components/ui/button'

/**
 * 纯图标的刷新按钮：标题与 aria-label 承担原本的文字，避免工具栏里多出一个“刷新”字样。
 * 加载中换成转圈的 LoaderCircle，未加载时是 RotateCw，跟侧栏里已有的图标刷新按钮保持一致。
 */
withDefaults(defineProps<{
  loading?: boolean
  disabled?: boolean
  label?: string
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
}>(), { loading: false, disabled: false, label: '刷新', variant: 'ghost', size: 'icon' })

defineEmits<{ click: [] }>()
</script>

<template>
  <Button
    :variant="variant"
    :size="size"
    :class="class"
    :disabled="disabled || loading"
    :aria-label="label"
    :title="label"
    @click="$emit('click')"
  >
    <LoaderCircle v-if="loading" class="animate-spin" />
    <RotateCw v-else />
  </Button>
</template>
