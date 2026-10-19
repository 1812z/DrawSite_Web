<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Brain, Eraser, LoaderCircle, Save } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import * as agentApi from '@/api/agent'
import { describeError } from '@/lib/errors'

/**
 * 全局记忆管理（`GET/PUT/DELETE /api/users/me/memory`，见 docs/memory.md）。
 *
 * 这是**用户级、跨项目**的单条记忆，每个用户最多一条、最多 4000 字符。
 * 项目自己的记忆不是数据库记录，而是工作区里的 `AGENTS.md`，在应用工作区的「记忆」标签查看。
 */
const MAX = 4000

const content = ref('')
/** 服务端当前值，用来判断有没有真的改动过，避免重复提交同一个内容 */
const original = ref('')
const updatedAt = ref<string | null>(null)
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')

const clearOpen = ref(false)
const clearing = ref(false)
const clearError = ref('')

const canSave = computed(() => !saving.value && content.value !== original.value)
const canClear = computed(() => !clearing.value && original.value.length > 0)

function formatTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { hour12: false })
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const memory = await agentApi.getUserMemory()
    content.value = memory.content
    original.value = memory.content
    updatedAt.value = memory.updatedAt
  } catch (cause) {
    loadError.value = describeError(cause, '加载全局记忆失败')
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!canSave.value) return
  saving.value = true
  saveError.value = ''
  try {
    const memory = await agentApi.saveUserMemory(content.value)
    content.value = memory.content
    original.value = memory.content
    updatedAt.value = memory.updatedAt
    toast.success('全局记忆已保存。')
  } catch (cause) {
    saveError.value = describeError(cause, '保存失败')
  } finally {
    saving.value = false
  }
}

async function confirmClear(): Promise<void> {
  clearing.value = true
  clearError.value = ''
  try {
    await agentApi.clearUserMemory()
    content.value = ''
    original.value = ''
    updatedAt.value = null
    clearOpen.value = false
    toast.success('全局记忆已清空。')
  } catch (cause) {
    clearError.value = describeError(cause, '清空失败')
  } finally {
    clearing.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="mx-auto w-full max-w-3xl px-6 py-10">
    <h1 class="text-2xl font-medium tracking-tight">记忆管理</h1>
    <p class="mt-3 text-sm leading-6 text-muted-foreground">
      这里维护跨项目生效的个人偏好。项目自己的记忆是工作区里的 AGENTS.md，在应用工作区的「记忆」标签查看。
    </p>

    <div class="mt-8 rounded-xl border p-6">
      <div class="flex items-center gap-2.5">
        <Brain class="size-4 text-neutral-500" />
        <h2 class="text-sm font-medium">全局记忆</h2>
        <span v-if="updatedAt" class="ml-auto text-xs text-neutral-400">更新于 {{ formatTime(updatedAt) }}</span>
      </div>

      <p v-if="loading" class="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle class="animate-spin" />加载中…</p>
      <p v-else-if="loadError" role="alert" class="mt-4 text-xs leading-6 text-red-600">{{ loadError }}</p>
      <template v-else>
        <p class="mt-2 text-xs leading-5 text-muted-foreground">
          只写跨项目稳定成立的偏好，例如「回复简短」「后端优先用 Java」。开启记忆的对话每次都会注入这条内容，AI 也能读写它。
        </p>
        <Textarea
          v-model="content"
          class="mt-4 font-mono text-xs leading-5"
          :rows="8"
          :maxlength="MAX"
          placeholder="例如：优先使用 Java 后端；回复简短，代码注释用中文"
        />
        <div class="mt-2 flex items-center gap-3">
          <p class="text-xs text-neutral-400">{{ content.length }} / {{ MAX }}</p>
          <p v-if="saveError" role="alert" class="text-xs text-red-600">{{ saveError }}</p>
          <div class="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" :disabled="!canClear" @click="clearOpen = true"><Eraser />清空</Button>
            <Button size="sm" :disabled="!canSave" @click="save">
              <LoaderCircle v-if="saving" class="animate-spin" />
              <Save v-else />
              保存
            </Button>
          </div>
        </div>
        <p v-if="!original" class="mt-3 text-xs leading-5 text-muted-foreground">当前还没有全局记忆。</p>
      </template>
    </div>

    <ConfirmDialog
      :open="clearOpen"
      title="清空全局记忆"
      description="清空后所有对话都不再注入这条记忆，内容无法恢复。"
      confirm-text="清空"
      destructive
      :loading="clearing"
      :error="clearError"
      @update:open="clearOpen = $event"
      @confirm="confirmClear"
    />
  </section>
</template>
