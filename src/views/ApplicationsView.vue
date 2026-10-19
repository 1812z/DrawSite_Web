<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight, FolderOpen, LoaderCircle, Pencil, Plus, RotateCw, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import * as api from '@/api/applications'
import type { Application } from '@/api/applications'
import { describeError } from '@/lib/errors'
import { useWorkspaceStore } from '@/stores/workspace'

const router = useRouter()
const workspace = useWorkspaceStore()
const applications = ref<Application[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const error = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const dialogOpen = ref(false)
const editing = ref<Application | null>(null)
const form = reactive({ name: '', description: '' })
const saving = ref(false)
const formError = ref('')

const deleteOpen = ref(false)
const deleteTarget = ref<Application | null>(null)
const deleting = ref(false)
const deleteError = ref('')

const STATUS_META: Record<string, { label: string; class: string }> = {
  INITIALIZING: { label: '初始化中', class: 'border-neutral-300 text-neutral-500' },
  READY: { label: '就绪', class: 'border-neutral-800 text-neutral-800' },
  FAILED: { label: '失败', class: 'border-red-300 text-red-600' },
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await api.listApplications(page.value, pageSize)
    applications.value = result.records
    total.value = result.total
  } catch (cause) {
    applications.value = []
    error.value = describeError(cause, '加载应用失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  form.name = ''
  form.description = ''
  formError.value = ''
  dialogOpen.value = true
}

function openEdit(application: Application) {
  editing.value = application
  form.name = application.name
  form.description = application.description ?? ''
  formError.value = ''
  dialogOpen.value = true
}

async function save() {
  const name = form.name.trim()
  if (!name) {
    formError.value = '应用名称不能为空'
    return
  }
  saving.value = true
  formError.value = ''
  try {
    if (editing.value) {
      await api.updateApplication(editing.value.id, { name, description: form.description.trim() })
    } else {
      await api.createApplication({ name, description: form.description.trim() })
      void workspace.refreshApplications()
    }
    dialogOpen.value = false
    await load()
  } catch (cause) {
    formError.value = describeError(cause, '保存应用失败')
  } finally {
    saving.value = false
  }
}

function openDelete(application: Application) {
  deleteTarget.value = application
  deleteError.value = ''
  deleteOpen.value = true
}

/**
 * 删除应用。后端会连带清理工作区目录、会话消息、对话任务与版本记录，并自动停止回复。
 * 初始化中返回 409 APPLICATION_BUSY；目录清理失败返回 500 WORKSPACE_DELETE_FAILED 且保留数据库记录。
 */
async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await workspace.deleteApplication(target.id)
    deleteOpen.value = false
    deleteTarget.value = null
    // 删掉当前页最后一条时回退一页，避免停在空页
    if (applications.value.length <= 1 && page.value > 1) page.value -= 1
    await load()
  } catch (cause) {
    deleteError.value = describeError(cause, '删除应用失败')
  } finally {
    deleting.value = false
  }
}

function open(application: Application) {
  void router.push(`/applications/${application.id}`)
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function shortCommit(hash: string): string {
  if (!hash) return '—'
  return hash.length > 8 ? `${hash.slice(0, 8)}…` : hash
}

onMounted(load)
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <section class="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-medium tracking-tight">我的应用</h1>
        <p class="mt-3 text-sm text-muted-foreground">每个应用拥有独立的会话、项目文档、源码版本和测试记录。</p>
      </div>
      <Button @click="openCreate"><Plus />新建应用</Button>
    </div>

    <div v-if="loading" class="mt-10 flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><LoaderCircle class="animate-spin" />正在加载应用…</div>
    <div v-else-if="error" class="mt-10 rounded-xl border p-8 text-center">
      <p class="text-sm text-red-600">{{ error }}</p>
      <Button variant="outline" size="sm" class="mt-4" @click="load"><RotateCw />重新加载</Button>
    </div>
    <div v-else-if="applications.length === 0" class="mt-10 flex flex-col items-center rounded-2xl border border-dashed px-6 py-20 text-center">
      <FolderOpen class="mb-5 size-8 text-neutral-400" />
      <h2 class="font-medium">从你的第一个应用开始</h2>
      <p class="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">创建应用后，平台会初始化项目文档、进度文件与服务器 Git 工作区。</p>
      <Button class="mt-6" @click="openCreate"><Plus />创建应用</Button>
    </div>
    <div v-else class="mt-8 space-y-3">
      <div v-for="application in applications" :key="application.id" class="group relative rounded-xl border transition-colors hover:bg-muted">
        <button class="w-full p-5 text-left" @click="open(application)">
          <div class="min-w-0 pr-20">
            <div class="flex flex-wrap items-center gap-2.5">
              <h2 class="text-sm font-medium">{{ application.name }}</h2>
              <Badge :class="STATUS_META[application.status]?.class ?? 'border-neutral-300 text-neutral-500'">{{ STATUS_META[application.status]?.label ?? application.status }}</Badge>
            </div>
            <p class="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{{ application.description || '暂无描述' }}</p>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-400">
            <span>版本 {{ shortCommit(application.currentCommit) }}</span>
            <span>创建于 {{ formatTime(application.createdAt) }}</span>
          </div>
        </button>
        <div class="absolute top-4 right-4 flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="编辑应用" title="编辑" @click="openEdit(application)"><Pencil /></Button>
          <Button variant="ghost" size="icon" class="text-neutral-400 hover:text-red-600" aria-label="删除应用" title="删除" @click="openDelete(application)"><Trash2 /></Button>
        </div>
      </div>
      <div v-if="totalPages > 1" class="flex items-center justify-between pt-2 text-xs text-muted-foreground">
        <span>共 {{ total }} 个应用 · 第 {{ page }} / {{ totalPages }} 页</span>
        <div class="flex items-center gap-1">
          <Button variant="outline" size="sm" :disabled="page <= 1" @click="page -= 1; load()"><ChevronLeft />上一页</Button>
          <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page += 1; load()">下一页<ChevronRight /></Button>
        </div>
      </div>
    </div>

    <Dialog :open="dialogOpen" :title="editing ? '编辑应用' : '新建应用'" @update:open="dialogOpen = $event">
      <form class="space-y-4" @submit.prevent="save">
        <div class="space-y-1.5">
          <label for="application-name" class="text-xs text-muted-foreground">名称</label>
          <Input id="application-name" v-model="form.name" maxlength="100" placeholder="应用名称，不超过 100 字符" />
        </div>
        <div class="space-y-1.5">
          <label for="application-description" class="text-xs text-muted-foreground">描述</label>
          <Textarea id="application-description" v-model="form.description" :maxlength="2000" placeholder="应用用途与目标（可选）" />
        </div>
        <p v-if="formError" role="alert" class="text-xs text-red-600">{{ formError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" @click="dialogOpen = false">取消</Button>
          <Button type="submit" :disabled="saving || !form.name.trim()"><LoaderCircle v-if="saving" class="animate-spin" />{{ editing ? '保存修改' : '创建' }}</Button>
        </div>
      </form>
    </Dialog>

    <ConfirmDialog
      :open="deleteOpen"
      title="删除应用"
      :description="`确定删除「${deleteTarget?.name ?? ''}」？工作区目录、全部会话消息、对话任务与版本记录都会被清理，且无法恢复。`"
      confirm-text="删除应用"
      destructive
      :loading="deleting"
      :error="deleteError"
      @update:open="deleteOpen = $event"
      @confirm="confirmDelete"
    />
    </section>
  </div>
</template>
