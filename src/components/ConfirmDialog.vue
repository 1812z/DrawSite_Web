<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** 删除类操作：确认按钮用红色，且不可点遮罩关闭。 */
  destructive?: boolean
  /** 由调用方控制：异步操作进行中时禁用按钮并转圈。 */
  loading?: boolean
  /** 异步失败信息，由调用方回填。 */
  error?: string
}>(), {
  description: '',
  confirmText: '确认',
  cancelText: '取消',
  destructive: false,
  loading: false,
  error: '',
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

function onOpenChange(value: boolean) {
  // 进行中不允许关闭，避免请求还在飞就把弹窗收了
  if (props.loading && !value) return
  emit('update:open', value)
}
</script>

<template>
  <Dialog :open="open" :title="title" @update:open="onOpenChange">
    <p v-if="description" class="text-sm leading-6 text-muted-foreground">{{ description }}</p>
    <p v-if="error" role="alert" class="mt-3 text-xs leading-5 text-red-600">{{ error }}</p>
    <div class="mt-6 flex justify-end gap-2">
      <Button type="button" variant="outline" :disabled="loading" @click="emit('update:open', false)">{{ cancelText }}</Button>
      <Button
        type="button"
        :class="destructive ? 'bg-red-600 text-white hover:bg-red-700' : ''"
        :disabled="loading"
        @click="emit('confirm')"
      >
        <LoaderCircle v-if="loading" class="animate-spin" />{{ confirmText }}
      </Button>
    </div>
  </Dialog>
</template>
