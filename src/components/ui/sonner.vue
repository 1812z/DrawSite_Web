<script setup lang="ts">
// vue-sonner 默认样式需显式引入，否则 toast 无样式裸奔
import 'vue-sonner/style.css'
import { Toaster as Sonner, type ToasterProps } from 'vue-sonner'

// 按需透传常用配置；避免 v-bind 与显式 toast-options/class 冲突
const props = withDefaults(defineProps<{
  theme?: ToasterProps['theme']
  position?: ToasterProps['position']
  closeButton?: boolean
  richColors?: boolean
  expand?: boolean
  offset?: ToasterProps['offset']
}>(), {
  theme: 'light',
  position: 'top-center',
  closeButton: true,
})
</script>

<template>
  <Sonner
    v-bind="$props"
    class="toaster group"
    :toast-options="{
      classes: {
        toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
        description: 'group-[.toast]:text-muted-foreground',
        actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
        cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
      },
    }"
  />
</template>
