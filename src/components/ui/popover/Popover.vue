<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ref, watch } from 'vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { buttonVariants, type ButtonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * reka-ui Popover 包装。默认非模态，因此不会锁 body 滚动
 * （只有 modal 版本才会 `useBodyScrollLock`，会让整页重排）。
 *
 * 触发器外观复用 Button 的 variant / size，样式直接打在 PopoverTrigger 上，
 * 不再用 `as-child` 包一层 Button——和 `Select.vue` 保持一致，少一层 ref / attr 转发。
 * `#trigger` 插槽放按钮**内容**，不是按钮本身。
 *
 * ⚠️ 开关状态必须由本组件自己持有，不能把 `props.open` 直接透传给 `PopoverRoot`：
 * 内联声明的 `open?: boolean` 会被 SFC 编译器推断成 `type: Boolean`，父组件不传时
 * Vue 做布尔转换把它变成 `false`（不是 `undefined`）。reka 用
 * `passive: props.open === undefined` 判断受控与否，拿到 `false` 就当成受控模式，
 * 于是点击只 emit 事件、状态没人回写，面板永远打不开。
 * 这里用本地 ref 走受控路径（与 `Select.vue` 同样的 `v-model` 机制），行为确定。
 */
const props = withDefaults(defineProps<{
  /** 显式传入即受控；不传则组件自己管开关 */
  open?: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  disabled?: boolean
  /** 只有图标的触发器需要，用于无障碍名称 */
  triggerLabel?: string
  triggerClass?: HTMLAttributes['class']
  class?: HTMLAttributes['class']
}>(), {
  side: 'bottom',
  align: 'start',
  sideOffset: 6,
  variant: 'outline',
  size: 'sm',
  disabled: false,
  triggerLabel: undefined,
})

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const openState = ref(props.open ?? false)
watch(() => props.open, (value) => {
  if (value !== undefined) openState.value = value
})

function onOpenChange(value: boolean) {
  openState.value = value
  emit('update:open', value)
}
</script>

<template>
  <PopoverRoot :open="openState" @update:open="onOpenChange">
    <PopoverTrigger
      type="button"
      :disabled="disabled"
      :aria-label="triggerLabel"
      :class="cn(buttonVariants({ variant, size }), triggerClass)"
    >
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="side"
        :align="align"
        :side-offset="sideOffset"
        :class="cn('z-50 rounded-xl border bg-background p-3 shadow-lg outline-none', props.class)"
      >
        <slot />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
