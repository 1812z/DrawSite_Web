<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, LoaderCircle, Trash2 } from '@lucide/vue'
import RefreshButton from '@/components/RefreshButton.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ConversationContext from '@/components/ConversationContext.vue'
import ProjectProgress from './ProjectProgress.vue'
import { describeError } from '@/lib/errors'
import { getToken } from '@/lib/session'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Application } from '@/api/applications'

/**
 * 概览标签：应用信息、刷新/下载/删除、上下文占用与开发进度。
 * 刷新要连带重取消息，所以真正的请求留在父级（详情页），这里只发事件并展示父级的刷新态与提示文案。
 */
const props = defineProps<{
  application: Application
  applicationId: string
  conversationId: string
  modelId: string
  memoryEnabled: boolean
  running: boolean
  revision: number
  refreshing: boolean
  notice: string
}>()

const emit = defineEmits<{
  refresh: []
  'context-progress': [text: string, busy: boolean]
  'context-completed': []
}>()

const router = useRouter()
const workspace = useWorkspaceStore()

const STATUS_META: Record<string, { label: string; class: string }> = {
  INITIALIZING: { label: '初始化中', class: 'border-neutral-300 text-neutral-500' },
  READY: { label: '就绪', class: 'border-neutral-800 text-neutral-800' },
  FAILED: { label: '初始化失败', class: 'border-red-300 text-red-600' },
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function shortCommit(hash: string): string {
  if (!hash) return '—'
  return hash.length > 8 ? `${hash.slice(0, 8)}…` : hash
}

const downloading = ref(false)
const downloadNotice = ref('')
let downloadController: AbortController | null = null
let downloadUrl = ''

onBeforeUnmount(() => {
  downloadController?.abort()
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
})

async function downloadProject() {
  downloadController?.abort()
  if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = '' }
  const controller = new AbortController()
  downloadController = controller
  downloading.value = true
  downloadNotice.value = ''
  try {
    const response = await fetch(`/api/applications/${props.applicationId}/download`, {
      headers: { Authorization: `Bearer ${getToken()}` }, signal: controller.signal,
    })
    if (!response.ok) throw new Error('项目下载失败，请重试')
    const blob = await response.blob()
    if (controller.signal.aborted || downloadController !== controller) return
    downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${props.application.name || 'project'}.zip`.replace(/[\\/:*?"<>|]/g, '_')
    document.body.appendChild(link); link.click(); link.remove()
    downloadNotice.value = '下载已开始'
  } catch (cause) {
    if (!controller.signal.aborted) downloadNotice.value = describeError(cause, '下载失败')
  } finally {
    if (downloadController === controller) downloading.value = false
  }
}

/** 删除应用：后端会连带清理工作区目录、会话消息、对话任务与版本记录，并自动停止该应用全部回复。 */
const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref('')

async function confirmDelete() {
  if (deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await workspace.deleteApplication(props.applicationId)
    deleteOpen.value = false
    void router.replace('/applications')
  } catch (cause) {
    deleteError.value = describeError(cause, '删除应用失败')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <div class="rounded-xl border bg-white p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="truncate text-sm font-medium">{{ application.name }}</h2>
          <p v-if="application.description" class="mt-1.5 line-clamp-3 text-xs leading-5 text-muted-foreground">{{ application.description }}</p>
        </div>
        <Badge :class="STATUS_META[application.status]?.class ?? 'border-neutral-300 text-neutral-500'">{{ STATUS_META[application.status]?.label ?? application.status }}</Badge>
      </div>
      <div class="mt-3 flex items-center gap-2 border-t pt-3">
        <RefreshButton variant="outline" class="size-8" :loading="refreshing" label="重新读取应用信息与已保存的消息" @click="emit('refresh')" />
        <Button variant="outline" size="sm" title="打包下载整个项目，再次点击取消上次请求并重新下载" @click="downloadProject"><LoaderCircle v-if="downloading" class="animate-spin" /><Download v-else />{{ downloading ? '重新下载' : '下载' }}</Button>
        <span v-if="downloadNotice || notice" role="status" class="min-w-0 truncate text-xs text-muted-foreground">{{ downloadNotice || notice }}</span>
        <Button variant="ghost" size="sm" class="ml-auto text-neutral-400 hover:text-red-600" title="删除应用" @click="deleteOpen = true"><Trash2 />删除</Button>
      </div>
    </div>

    <div class="mt-3 space-y-3 rounded-xl border bg-white p-4 text-sm">
      <div class="flex items-center justify-between"><span class="text-xs text-muted-foreground">当前提交</span><span class="font-mono text-xs">{{ shortCommit(application.currentCommit) }}</span></div>
      <div class="flex items-center justify-between"><span class="text-xs text-muted-foreground">创建时间</span><span class="text-xs">{{ formatTime(application.createdAt) }}</span></div>
      <div class="flex items-center justify-between"><span class="text-xs text-muted-foreground">更新时间</span><span class="text-xs">{{ formatTime(application.updatedAt) }}</span></div>
    </div>

    <ConversationContext
      :application-id="applicationId"
      :conversation-id="conversationId"
      :model-id="modelId"
      :memory-enabled="memoryEnabled"
      :running="running"
      @progress="(text, busy) => emit('context-progress', text, busy)"
      @completed="emit('context-completed')"
    />
    <!-- 不要按 revision 重建：进度是应用级数据，切会话时重建会先清空再重拉，视觉上就是闪一下 -->
    <ProjectProgress class="mt-6" :application-id="applicationId" :running="running" />

    <ConfirmDialog
      :open="deleteOpen"
      title="删除应用"
      :description="`确定删除「${application.name}」？工作区目录、全部会话消息、对话任务与版本记录都会被清理，且无法恢复。`"
      confirm-text="删除应用"
      destructive
      :loading="deleting"
      :error="deleteError"
      @update:open="deleteOpen = $event"
      @confirm="confirmDelete"
    />
  </div>
</template>
