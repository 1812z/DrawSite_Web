<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Blocks, ChevronRight, FolderOpen, House, LogOut, MessageSquare, PanelLeft, Plus, Settings, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useSystemStore } from '@/stores/system'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspace'

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

async function handleLogout() {
  workspace.reset()
  await auth.logout()
  void router.replace('/login')
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
</script>

<template>
  <div class="flex min-h-dvh">
    <button v-if="sidebarOpen" class="fixed inset-0 z-30 bg-black/20 md:hidden" aria-label="关闭导航" @click="sidebarOpen = false" />
    <aside :class="['fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-[#f8f8f8] p-3 transition-transform md:static md:translate-x-0', sidebarOpen ? 'translate-x-0' : '-translate-x-full']">
      <div class="mb-6 flex h-12 items-center justify-between px-3">
        <RouterLink to="/" class="flex items-center gap-2.5 font-semibold tracking-tight"><Blocks class="size-5" /> 绘站 <span class="text-xs font-normal text-muted-foreground">DrawSite</span></RouterLink>
        <Button variant="ghost" size="icon" class="md:hidden" aria-label="关闭导航" @click="sidebarOpen = false"><X /></Button>
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
          <div v-else class="mt-2 space-y-0.5">
            <div v-for="application in workspace.applications" :key="application.id">
              <div
                :aria-current="route.path === `/applications/${application.id}` ? 'page' : undefined"
                :class="['group flex items-center gap-1.5 rounded-lg py-1.5 pr-1.5 pl-1 text-sm transition-colors', route.path === `/applications/${application.id}` ? 'bg-[#eaeaea] font-medium' : 'text-neutral-600 hover:bg-black/5']"
              >
                <button class="flex min-w-0 flex-1 items-center gap-1.5 text-left" :aria-expanded="workspace.isExpanded(application.id)" @click="workspace.toggle(application.id)">
                  <ChevronRight :class="['size-3.5 shrink-0 text-neutral-400 transition-transform', workspace.isExpanded(application.id) ? 'rotate-90' : '']" />
                  <FolderOpen class="size-3.5 shrink-0 text-neutral-400" />
                  <span class="min-w-0 truncate">{{ application.name }}</span>
                </button>
                <button class="shrink-0 rounded p-0.5 text-neutral-400 opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100" aria-label="新建会话" title="新建会话" @click="createSidebarConversation(application.id)"><Plus class="size-3.5" /></button>
              </div>
              <div v-if="workspace.isExpanded(application.id)" class="ml-4 border-l border-neutral-200 pb-1 pl-2">
                <p v-if="workspace.conversationsLoading[application.id] && !workspace.conversationsByApplication[application.id]" class="py-1.5 text-xs text-neutral-400">加载会话…</p>
                <p v-else-if="workspace.conversationsByApplication[application.id]?.length === 0" class="py-1.5 text-xs text-neutral-400">暂无会话</p>
                <button
                  v-for="conversation in workspace.conversationsByApplication[application.id] ?? []"
                  :key="conversation.id"
                  :aria-current="route.path === `/applications/${application.id}` && route.query.conversation === conversation.id ? 'page' : undefined"
                  :class="['flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 pl-1.5 text-left text-xs transition-colors', route.path === `/applications/${application.id}` && route.query.conversation === conversation.id ? 'bg-[#e0e0e0] font-medium' : 'text-neutral-500 hover:bg-black/5']"
                  @click="openConversation(application.id, conversation.id)"
                >
                  <MessageSquare class="size-3 shrink-0 text-neutral-400" />
                  <span class="min-w-0 truncate">{{ conversation.title }}</span>
                </button>
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
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-16 shrink-0 items-center justify-between px-5 md:px-8">
        <div class="flex items-center gap-2"><Button variant="ghost" size="icon" class="md:hidden" aria-label="打开导航" @click="sidebarOpen = true"><PanelLeft /></Button><span class="text-sm font-medium">{{ route.meta.title }}</span></div>
        <RouterLink to="/settings" class="flex items-center gap-2 text-xs text-muted-foreground"><span :class="['size-1.5 rounded-full', system.health ? 'bg-neutral-800' : 'bg-neutral-300']" />{{ system.label }}</RouterLink>
      </header>
      <main class="flex min-h-0 flex-1 flex-col"><slot /></main>
    </div>
  </div>
</template>
