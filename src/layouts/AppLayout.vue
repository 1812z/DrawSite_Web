<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Blocks, ChevronRight, FolderOpen, House, LoaderCircle, LogOut, MessageSquare, PanelLeft, Pencil, Plus, Settings, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { describeError } from '@/lib/errors'
import { useSystemStore } from '@/stores/system'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Conversation } from '@/api/conversations'

const route = useRoute()
const router = useRouter()
const system = useSystemStore()
const auth = useAuthStore()
const workspace = useWorkspaceStore()
const sidebarOpen = ref(false)
const navigation = [
  { to: '/', label: '工作台', icon: House },
  { to: '/applications', label: '我的应用', icon: FolderOpen },
]
watch(() => route.path, () => { sidebarOpen.value = false })
onMounted(() => {
  void system.checkHealth()
  if (auth.isAuthenticated) void workspace.refreshApplications()
})

function recheck() {
  void system.checkHealth()
}

async function handleLogout() {
  workspace.reset()
  await auth.logout()
  void router.replace('/login')
}

function isActiveConversation(applicationId: string, conversationId: string): boolean {
  return route.path === `/applications/${applicationId}` && route.query.conversation === conversationId
}

function openConversation(applicationId: string, conversationId: string) {
  if (route.path === `/applications/${applicationId}`) {
    void router.replace({ query: { conversation: conversationId } })
  } else {
    void router.push({ path: `/applications/${applicationId}`, query: { conversation: conversationId } })
  }
}

async function createSidebarConversation(applicationId: string) {
  try {
    const created = await workspace.createConversation(applicationId)
    openConversation(applicationId, created.id)
  } catch {
    // 创建失败由详情页/提示展示；此处静默避免打断浏览
  }
}

// 重命名会话
const renameOpen = ref(false)
const renameTarget = ref<{ applicationId: string; conversation: Conversation } | null>(null)
const renameTitle = ref('')
const renaming = ref(false)
const renameError = ref('')

function openRenameConversation(applicationId: string, conversation: Conversation) {
  renameTarget.value = { applicationId, conversation }
  renameTitle.value = conversation.title
  renameError.value = ''
  renameOpen.value = true
}

async function confirmRename() {
  const target = renameTarget.value
  if (!target || renaming.value) return
  const title = renameTitle.value.trim()
  if (!title) {
    renameError.value = '会话名称不能为空'
    return
  }
  renaming.value = true
  renameError.value = ''
  try {
    await workspace.renameConversation(target.applicationId, target.conversation.id, title)
    renameOpen.value = false
    renameTarget.value = null
  } catch (cause) {
    renameError.value = describeError(cause, '重命名会话失败')
  } finally {
    renaming.value = false
  }
}

// 删除会话
const deleteOpen = ref(false)
const deleteTarget = ref<{ applicationId: string; conversation: Conversation } | null>(null)
const deleting = ref(false)
const deleteError = ref('')

function openDeleteConversation(applicationId: string, conversation: Conversation) {
  deleteTarget.value = { applicationId, conversation }
  deleteError.value = ''
  deleteOpen.value = true
}

/** 后端会清除该会话全部消息与对话任务并自动停止回复，前端不需要先 cancel。 */
async function confirmDeleteConversation() {
  const target = deleteTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await workspace.deleteConversation(target.applicationId, target.conversation.id)
    deleteOpen.value = false
    deleteTarget.value = null
    // 删掉的正是当前打开的会话时，退回该应用的空工作区
    if (isActiveConversation(target.applicationId, target.conversation.id)) {
      void router.replace({ path: `/applications/${target.applicationId}` })
    }
  } catch (cause) {
    deleteError.value = describeError(cause, '删除会话失败')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="flex h-dvh overflow-hidden">
    <button v-if="sidebarOpen" class="fixed inset-0 z-30 bg-black/20 md:hidden" aria-label="关闭导航" @click="sidebarOpen = false" />
    <aside :class="['fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-[#f8f8f8] p-3 transition-transform md:static md:translate-x-0', sidebarOpen ? 'translate-x-0' : '-translate-x-full']">
      <div class="mb-3 flex h-12 items-center justify-between px-3">
        <RouterLink to="/" class="flex items-center gap-2.5 font-semibold tracking-tight"><Blocks class="size-5" /> 绘站 <span class="text-xs font-normal text-muted-foreground">DrawSite</span></RouterLink>
        <Button variant="ghost" size="icon" class="md:hidden" aria-label="关闭导航" @click="sidebarOpen = false"><X /></Button>
      </div>
      <!-- 服务状态：点击重新检查 -->
      <div class="mb-5 px-3">
        <button
          type="button"
          :disabled="system.loading"
          class="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-neutral-700 disabled:opacity-60"
          title="点击重新检查后端连接"
          @click="recheck"
        >
          <span :class="['size-1.5 rounded-full', system.health ? 'bg-neutral-800' : 'bg-neutral-300']" />
          {{ system.label }}
        </button>
        <p v-if="system.error" class="mt-1 text-[11px] leading-4 text-neutral-400">{{ system.error }}</p>
      </div>
      <nav aria-label="主导航" class="space-y-1">
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" :aria-current="route.path === item.to ? 'page' : undefined" :class="['flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors', route.path === item.to ? 'bg-[#eaeaea] font-medium' : 'text-neutral-600 hover:bg-black/5']">
          <component :is="item.icon" class="size-4" />{{ item.label }}
        </RouterLink>
      </nav>
      <div class="mt-6 flex min-h-0 flex-1 flex-col px-3">
        <div class="flex items-center justify-between">
          <p class="text-xs text-muted-foreground">最近的应用</p>
          <RouterLink to="/applications" class="text-xs text-neutral-400 transition-colors hover:text-neutral-600">全部 →</RouterLink>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto pb-4">
          <p v-if="workspace.loading && workspace.applications.length === 0" class="mt-4 text-xs leading-6 text-neutral-400">加载中…</p>
          <p v-else-if="workspace.applications.length === 0" class="mt-4 text-xs leading-6 text-neutral-400">创建应用后，会显示在这里。</p>
          <div v-else class="mt-2 space-y-1">
            <div v-for="application in workspace.applications" :key="application.id">
              <div
                :aria-current="route.path === `/applications/${application.id}` ? 'page' : undefined"
                :class="['group flex items-center gap-2 rounded-lg py-1.5 pr-1.5 pl-1 text-sm transition-colors', route.path === `/applications/${application.id}` ? 'bg-[#eaeaea] font-medium' : 'text-neutral-600 hover:bg-black/5']"
              >
                <button class="flex min-w-0 flex-1 items-center gap-1.5 text-left" :aria-expanded="workspace.isExpanded(application.id)" @click="workspace.toggle(application.id)">
                  <ChevronRight :class="['size-3.5 shrink-0 text-neutral-400 transition-transform', workspace.isExpanded(application.id) ? 'rotate-90' : '']" />
                  <FolderOpen class="size-3.5 shrink-0 text-neutral-400" />
                  <span class="min-w-0 truncate">{{ application.name }}</span>
                </button>
                <button class="ml-0.5 shrink-0 rounded-md p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100" aria-label="新建会话" title="新建会话" @click="createSidebarConversation(application.id)"><Plus class="size-3.5" /></button>
              </div>
              <div v-if="workspace.isExpanded(application.id)" class="ml-4 mt-1 space-y-0.5 border-l border-neutral-200 pb-1 pl-2">
                <p v-if="workspace.conversationsLoading[application.id] && !workspace.conversationsByApplication[application.id]" class="py-1.5 text-xs text-neutral-400">加载会话…</p>
                <p v-else-if="workspace.conversationsByApplication[application.id]?.length === 0" class="py-1.5 text-xs text-neutral-400">暂无会话</p>
                <div
                  v-for="conversation in workspace.conversationsByApplication[application.id] ?? []"
                  :key="conversation.id"
                  :class="['group flex items-center gap-0.5 rounded-md pr-0.5 transition-colors', isActiveConversation(application.id, conversation.id) ? 'bg-[#e0e0e0]' : 'hover:bg-black/5']"
                >
                  <button
                    :aria-current="isActiveConversation(application.id, conversation.id) ? 'page' : undefined"
                    :class="['flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1.5 text-left text-xs', isActiveConversation(application.id, conversation.id) ? 'font-medium' : 'text-neutral-500']"
                    @click="openConversation(application.id, conversation.id)"
                  >
                    <MessageSquare class="size-3 shrink-0 text-neutral-400" />
                    <span class="min-w-0 truncate">{{ conversation.title }}</span>
                  </button>
                  <button class="shrink-0 rounded p-1 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10" aria-label="重命名会话" title="重命名" @click="openRenameConversation(application.id, conversation)"><Pencil class="size-3" /></button>
                  <button class="shrink-0 rounded p-1 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10 hover:text-red-600" aria-label="删除会话" title="删除" @click="openDeleteConversation(application.id, conversation)"><Trash2 class="size-3" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-auto space-y-3 pt-4">
        <RouterLink to="/settings" class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-600 hover:bg-black/5"><Settings class="size-4" />设置</RouterLink>
        <div v-if="auth.user" class="border-t px-3 pt-4 pb-2">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ auth.user.displayName }}</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">@{{ auth.user.username }} · {{ auth.user.role === 'ADMIN' ? '管理员' : '用户' }}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="退出登录" title="退出登录" @click="handleLogout()"><LogOut /></Button>
          </div>
        </div>
        <div v-else class="border-t px-3 pt-4 pb-2">
          <p class="text-sm">未登录</p>
          <Button as-child variant="outline" size="sm" class="mt-2"><RouterLink to="/login">登录 / 注册</RouterLink></Button>
        </div>
      </div>
    </aside>
    <div class="relative flex min-w-0 flex-1 flex-col">
      <!-- 顶栏已移除；移动端保留一个悬浮导航按钮 -->
      <Button variant="ghost" size="icon" class="absolute top-3 left-3 z-20 md:hidden" aria-label="打开导航" @click="sidebarOpen = true"><PanelLeft /></Button>
      <main class="flex min-h-0 flex-1 flex-col pt-14 md:pt-0"><slot /></main>
    </div>

    <Dialog :open="renameOpen" title="重命名会话" @update:open="renameOpen = $event">
      <form class="space-y-4" @submit.prevent="confirmRename">
        <div class="space-y-1.5">
          <label for="conversation-title" class="text-xs text-muted-foreground">会话名称</label>
          <Input id="conversation-title" v-model="renameTitle" maxlength="100" placeholder="不超过 100 字符" />
        </div>
        <p v-if="renameError" role="alert" class="text-xs text-red-600">{{ renameError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" @click="renameOpen = false">取消</Button>
          <Button type="submit" :disabled="renaming || !renameTitle.trim()"><LoaderCircle v-if="renaming" class="animate-spin" />保存</Button>
        </div>
      </form>
    </Dialog>

    <ConfirmDialog
      :open="deleteOpen"
      title="删除会话"
      :description="`确定删除「${deleteTarget?.conversation.title ?? ''}」？该会话的全部消息会被清除，且无法恢复。应用源码、版本与记忆不受影响。`"
      confirm-text="删除会话"
      destructive
      :loading="deleting"
      :error="deleteError"
      @update:open="deleteOpen = $event"
      @confirm="confirmDeleteConversation"
    />
  </div>
</template>
