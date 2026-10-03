<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowUp,
  ChevronLeft,
  FileJson,
  FileText,
  History,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Plus,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import MarkdownView from '@/components/MarkdownView.vue'
import * as applicationsApi from '@/api/applications'
import * as conversationsApi from '@/api/conversations'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Application, DocumentView, Revision } from '@/api/applications'
import type { Conversation, Message } from '@/api/conversations'

const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceStore()
const applicationId = String(route.params.id)

const DRAFT_KEY = 'drawsite:requirement-draft'
const CONVERSATION_SIZE = 50
const MESSAGE_SIZE = 50

const STATUS_META: Record<string, { label: string; class: string }> = {
  INITIALIZING: { label: '初始化中', class: 'border-neutral-300 text-neutral-500' },
  READY: { label: '就绪', class: 'border-neutral-800 text-neutral-800' },
  FAILED: { label: '初始化失败', class: 'border-red-300 text-red-600' },
}

const DOCUMENTS: { path: string; label: string; kind: 'markdown' | 'json' }[] = [
  { path: 'AGENTS.md', label: 'AGENTS.md', kind: 'markdown' },
  { path: 'docs/requirements.md', label: '需求说明', kind: 'markdown' },
  { path: 'docs/design/overview.md', label: '概要设计', kind: 'markdown' },
  { path: 'docs/design/detail.md', label: '详细设计', kind: 'markdown' },
  { path: 'progress.json', label: '开发进度', kind: 'json' },
  { path: 'api/openapi.json', label: 'OpenAPI 契约', kind: 'json' },
]

type Tab = 'conversation' | 'documents' | 'revisions'
const activeTab = ref<Tab>('conversation')

// 应用
const application = ref<Application | null>(null)
const appLoading = ref(true)
const appError = ref('')

// 会话
const conversations = ref<Conversation[]>([])
const conversationsTotal = ref(0)
const conversationsPage = ref(1)
const conversationsLoading = ref(false)
const conversationsError = ref('')
const selectedConversationId = ref('')

// 消息
const messages = ref<Message[]>([])
const messagesTotal = ref(0)
const messagesPage = ref(0)
const messagesLoading = ref(false)
const messagesError = ref('')
const draftInput = ref('')
const sending = ref(false)
const sendError = ref('')

// 会话创建（固定标题“新建会话”）与重命名
const creating = ref(false)
const createError = ref('')
const renameOpen = ref(false)
const renameTarget = ref<Conversation | null>(null)
const conversationTitle = ref('')
const savingConversation = ref(false)
const conversationError = ref('')

// 文档
const activeDocument = ref<DocumentView | null>(null)
const documentLoading = ref(false)
const documentError = ref('')

// 版本
const revisions = ref<Revision[]>([])
const revisionsTotal = ref(0)
const revisionsPage = ref(1)
const revisionsLoading = ref(false)
const revisionsError = ref('')

const hasDraft = computed(() => Boolean(sessionStorage.getItem(DRAFT_KEY)?.trim()))
const selectedConversation = computed(() => conversations.value.find((item) => item.id === selectedConversationId.value) ?? null)
const canLoadMoreConversations = computed(() => conversations.value.length < conversationsTotal.value)
const canLoadMoreMessages = computed(() => messages.value.length < messagesTotal.value)
const canLoadMoreRevisions = computed(() => revisions.value.length < revisionsTotal.value)

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function shortCommit(hash: string): string {
  if (!hash) return '—'
  return hash.length > 8 ? `${hash.slice(0, 8)}…` : hash
}

async function loadApplication() {
  appLoading.value = true
  appError.value = ''
  try {
    application.value = await applicationsApi.getApplication(applicationId)
  } catch (cause) {
    appError.value = cause instanceof Error ? cause.message : '无法加载应用'
  } finally {
    appLoading.value = false
  }
}

async function loadConversations(reset = false) {
  if (reset) {
    conversations.value = []
    conversationsPage.value = 1
  }
  conversationsLoading.value = true
  conversationsError.value = ''
  try {
    const result = await conversationsApi.listConversations(applicationId, conversationsPage.value, CONVERSATION_SIZE)
    const known = new Set(conversations.value.map((item) => item.id))
    conversations.value.push(...result.records.filter((item) => !known.has(item.id)))
    conversationsTotal.value = result.total
    conversationsPage.value += 1
  } catch (cause) {
    conversationsError.value = cause instanceof Error ? cause.message : '加载会话失败'
  } finally {
    conversationsLoading.value = false
  }
}

async function selectConversation(id: string) {
  selectedConversationId.value = id
  activeTab.value = 'conversation'
  if (route.query.conversation !== id) {
    void router.replace({ query: { ...route.query, conversation: id } })
  }
  await loadMessages()
}

async function loadMessages() {
  if (!selectedConversationId.value) return
  messages.value = []
  messagesPage.value = 0
  messagesTotal.value = 0
  await loadMoreMessages()
}

async function loadMoreMessages() {
  if (!selectedConversationId.value || messagesLoading.value) return
  messagesLoading.value = true
  messagesError.value = ''
  const nextPage = messagesPage.value + 1
  try {
    const result = await conversationsApi.listMessages(applicationId, selectedConversationId.value, nextPage, MESSAGE_SIZE)
    messages.value.push(...result.records)
    messagesTotal.value = result.total
    messagesPage.value = nextPage
  } catch (cause) {
    messagesError.value = cause instanceof Error ? cause.message : '加载消息失败'
  } finally {
    messagesLoading.value = false
  }
}

async function submitMessage() {
  const content = draftInput.value.trim()
  if (!content || !selectedConversationId.value || sending.value) return
  sending.value = true
  sendError.value = ''
  try {
    const created = await conversationsApi.addMessage(applicationId, selectedConversationId.value, content)
    messages.value.push(created)
    messagesTotal.value += 1
    draftInput.value = ''
  } catch (cause) {
    sendError.value = cause instanceof Error ? cause.message : '发送失败'
  } finally {
    sending.value = false
  }
}

function fillDraft() {
  const draft = sessionStorage.getItem(DRAFT_KEY)
  if (draft) draftInput.value = draft
}

/** 新建会话固定标题“新建会话”，创建后自动选中。 */
async function createNewConversation() {
  if (creating.value) return
  creating.value = true
  createError.value = ''
  try {
    const created = await workspace.createConversation(applicationId)
    conversations.value.unshift(created)
    conversationsTotal.value += 1
    await selectConversation(created.id)
  } catch (cause) {
    createError.value = cause instanceof Error ? cause.message : '创建会话失败'
  } finally {
    creating.value = false
  }
}

function openRename(conversation: Conversation) {
  renameTarget.value = conversation
  conversationTitle.value = conversation.title
  conversationError.value = ''
  renameOpen.value = true
}

async function saveConversation() {
  const title = conversationTitle.value.trim()
  if (!title || !renameTarget.value) return
  savingConversation.value = true
  conversationError.value = ''
  try {
    const updated = await workspace.renameConversation(applicationId, renameTarget.value.id, title)
    const index = conversations.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) conversations.value[index] = updated
    renameOpen.value = false
  } catch (cause) {
    conversationError.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    savingConversation.value = false
  }
}

async function loadDocument(documentPath: string) {
  activeDocument.value = null
  documentLoading.value = true
  documentError.value = ''
  try {
    activeDocument.value = await applicationsApi.getDocument(applicationId, documentPath)
  } catch (cause) {
    documentError.value = cause instanceof Error ? cause.message : '加载文档失败'
  } finally {
    documentLoading.value = false
  }
}

function prettyJson(content: string): string {
  if (!content.trim()) return ''
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

async function loadRevisions(reset = false) {
  if (reset) {
    revisions.value = []
    revisionsPage.value = 1
  }
  revisionsLoading.value = true
  revisionsError.value = ''
  try {
    const result = await applicationsApi.listRevisions(applicationId, revisionsPage.value, 20)
    revisions.value.push(...result.records)
    revisionsTotal.value = result.total
    revisionsPage.value += 1
  } catch (cause) {
    revisionsError.value = cause instanceof Error ? cause.message : '加载版本失败'
  } finally {
    revisionsLoading.value = false
  }
}

function openTab(tab: Tab) {
  activeTab.value = tab
  if (tab === 'documents' && !activeDocument.value && !documentLoading.value) {
    void loadDocument(DOCUMENTS[0].path)
  }
  if (tab === 'revisions' && revisions.value.length === 0) {
    void loadRevisions()
  }
}

watch(
  () => route.params.id,
  () => router.replace({ name: 'applications' }),
)

// 侧栏点击其它会话时同步切换
watch(
  () => route.query.conversation,
  (id) => {
    if (typeof id === 'string' && id !== selectedConversationId.value && conversations.value.some((item) => item.id === id)) {
      void selectConversation(id)
    }
  },
)

onMounted(() => {
  void loadApplication()
  void loadConversations().then(() => {
    const target = typeof route.query.conversation === 'string' ? route.query.conversation : ''
    if (target && conversations.value.some((item) => item.id === target)) {
      void selectConversation(target)
    }
  })
})
</script>

<template>
  <div v-if="appLoading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle class="animate-spin" />正在加载应用…</div>
  <div v-else-if="appError" class="flex flex-1 flex-col items-center justify-center gap-4 p-8">
    <p class="text-sm text-red-600">{{ appError }}</p>
    <Button as-child variant="outline" size="sm"><RouterLink to="/applications">返回我的应用</RouterLink></Button>
  </div>
  <div v-else-if="application" class="flex min-h-0 flex-1">
    <!-- 会话侧栏 -->
    <aside class="flex w-72 shrink-0 flex-col border-r bg-[#f8f8f8]">
      <div class="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <p class="text-sm font-medium">会话</p>
        <Button variant="ghost" size="icon" aria-label="新建会话" title="新建会话" :disabled="creating" @click="createNewConversation"><LoaderCircle v-if="creating" class="animate-spin" /><Plus v-else /></Button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <p v-if="conversationsLoading && conversations.length === 0" class="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><LoaderCircle class="animate-spin" />加载中…</p>
        <p v-else-if="conversationsError && conversations.length === 0" class="px-3 py-6 text-xs leading-6 text-red-600">{{ conversationsError }}</p>
        <div v-else-if="conversations.length === 0" class="px-3 py-6">
          <p class="text-xs leading-6 text-neutral-400">还没有会话。创建一个会话，把你的需求作为第一条消息提交。</p>
        </div>
        <div v-else class="space-y-1">
          <button
            v-for="conversation in conversations"
            :key="conversation.id"
            :aria-current="conversation.id === selectedConversationId ? 'page' : undefined"
            :class="['group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors', conversation.id === selectedConversationId ? 'bg-[#eaeaea] font-medium' : 'text-neutral-600 hover:bg-black/5']"
            @click="selectConversation(conversation.id)"
          >
            <MessageSquare class="size-3.5 shrink-0 text-neutral-400" />
            <span class="min-w-0 flex-1 truncate">{{ conversation.title }}</span>
            <span class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" @click.stop="openRename(conversation)"><Pencil class="size-3.5 text-neutral-500" /></span>
          </button>
          <Button v-if="canLoadMoreConversations" variant="ghost" size="sm" class="w-full" :disabled="conversationsLoading" @click="loadConversations()">
            <LoaderCircle v-if="conversationsLoading" class="animate-spin" />加载更多会话
          </Button>
        </div>
      </div>
      <div class="border-t px-4 py-3">
        <p v-if="createError" role="alert" class="text-xs leading-5 text-red-600">{{ createError }}</p>
        <p v-else class="text-xs leading-5 text-neutral-400">新建会话默认命名为“新建会话”；消息仅保存，AI 开发能力接入后会生成回复。</p>
      </div>
    </aside>

    <!-- 主区域 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 应用信息头 -->
      <header class="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <Button as-child variant="ghost" size="sm" class="-ml-2 shrink-0"><RouterLink to="/applications"><ChevronLeft />我的应用</RouterLink></Button>
            <h1 class="truncate text-base font-medium">{{ application.name }}</h1>
            <Badge :class="STATUS_META[application.status]?.class ?? 'border-neutral-300 text-neutral-500'">{{ STATUS_META[application.status]?.label ?? application.status }}</Badge>
          </div>
          <p v-if="application.description" class="mt-2 line-clamp-1 text-xs text-muted-foreground">{{ application.description }}</p>
        </div>
        <div class="shrink-0 text-right text-xs text-neutral-400">
          <p>版本 {{ shortCommit(application.currentCommit) }}</p>
          <p class="mt-1">更新于 {{ formatTime(application.updatedAt) }}</p>
        </div>
      </header>

      <!-- 标签栏 -->
      <nav class="flex shrink-0 items-center gap-1 border-b px-3" aria-label="工作区标签">
        <button :class="['rounded-lg px-3 py-2 text-sm transition-colors', activeTab === 'conversation' ? 'font-medium text-foreground' : 'text-neutral-500 hover:bg-muted']" @click="activeTab = 'conversation'">对话</button>
        <button :class="['rounded-lg px-3 py-2 text-sm transition-colors', activeTab === 'documents' ? 'font-medium text-foreground' : 'text-neutral-500 hover:bg-muted']" @click="openTab('documents')">文档</button>
        <button :class="['rounded-lg px-3 py-2 text-sm transition-colors', activeTab === 'revisions' ? 'font-medium text-foreground' : 'text-neutral-500 hover:bg-muted']" @click="openTab('revisions')">版本</button>
      </nav>

      <!-- 对话 -->
      <div v-if="activeTab === 'conversation'" class="flex min-h-0 flex-1 flex-col">
        <div v-if="!selectedConversation" class="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <MessageSquare class="mb-4 size-7 text-neutral-300" />
          <p class="text-sm font-medium">选择一个会话开始</p>
          <p class="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">会话保存你的需求描述与平台开发过程中的消息。</p>
        </div>
        <div v-else class="flex min-h-0 flex-1 flex-col">
          <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div class="mx-auto max-w-3xl">
              <Button v-if="canLoadMoreMessages" variant="outline" size="sm" class="mx-auto mb-4 flex" :disabled="messagesLoading" @click="loadMoreMessages">
                <LoaderCircle v-if="messagesLoading" class="animate-spin" />加载更早的消息
              </Button>
              <p v-if="messagesLoading && messages.length === 0" class="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground"><LoaderCircle class="animate-spin" />加载消息…</p>
              <p v-else-if="messagesError && messages.length === 0" class="py-10 text-center text-xs text-red-600">{{ messagesError }}</p>
              <div v-else-if="messages.length === 0" class="py-10">
                <p class="text-center text-sm text-neutral-400">还没有消息。把应用需求作为第一条消息提交。</p>
                <div v-if="hasDraft" class="mt-6 rounded-xl border p-4">
                  <p class="text-xs font-medium">工作台草稿</p>
                  <p class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">检测到工作台保存的需求草稿，可作为第一条消息提交。</p>
                  <div class="mt-3 flex gap-2">
                    <Button size="sm" @click="fillDraft">填入输入框</Button>
                  </div>
                </div>
              </div>
              <div v-else class="space-y-5">
                <div v-for="message in messages" :key="message.id" class="flex gap-3">
                  <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#ececec] text-[10px] font-medium">{{ message.role === 'USER' ? '你' : '助' }}</div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2">
                      <p class="text-xs font-medium">{{ message.role === 'USER' ? '我' : '平台助手' }}</p>
                      <p class="text-[11px] text-neutral-400">{{ formatTime(message.createdAt) }}</p>
                    </div>
                    <p class="mt-1.5 whitespace-pre-wrap text-sm leading-7 text-neutral-800">{{ message.content }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="shrink-0 border-t px-6 py-4">
            <form class="mx-auto max-w-3xl" @submit.prevent="submitMessage">
              <Textarea v-model="draftInput" :rows="3" :maxlength="20000" placeholder="描述需求或提出修改…（Enter 发送，Shift+Enter 换行）" @keydown.enter.exact.prevent="submitMessage" />
              <div class="mt-2 flex items-center justify-between gap-3">
                <p v-if="sendError" role="alert" class="text-xs text-red-600">{{ sendError }}</p>
                <p v-else class="text-xs text-neutral-400">消息保存后，AI 开发能力接入才会生成回复。</p>
                <Button type="submit" size="icon" class="rounded-full" :disabled="!draftInput.trim() || sending || !selectedConversation">
                  <LoaderCircle v-if="sending" class="animate-spin" />
                  <ArrowUp v-else />
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- 文档 -->
      <div v-else-if="activeTab === 'documents'" class="flex min-h-0 flex-1">
        <div class="flex w-56 shrink-0 flex-col border-r p-2">
          <button
            v-for="document in DOCUMENTS"
            :key="document.path"
            :aria-current="activeDocument?.path === document.path ? 'page' : undefined"
            :class="['flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors', activeDocument?.path === document.path ? 'bg-[#eaeaea] font-medium' : 'text-neutral-600 hover:bg-black/5']"
            @click="loadDocument(document.path)"
          >
            <component :is="document.kind === 'json' ? FileJson : FileText" class="size-3.5 shrink-0 text-neutral-400" />
            <span class="min-w-0 truncate">{{ document.label }}</span>
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div class="mx-auto max-w-3xl">
            <p v-if="documentLoading" class="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground"><LoaderCircle class="animate-spin" />加载文档…</p>
            <p v-else-if="documentError" class="py-10 text-center text-xs leading-6 text-red-600">{{ documentError }}</p>
            <template v-else-if="activeDocument">
              <div class="mb-4 flex items-center justify-between gap-3">
                <p class="font-mono text-xs text-neutral-400">{{ activeDocument.path }}</p>
                <p v-if="!activeDocument.content" class="text-xs text-muted-foreground">文档内容为空</p>
              </div>
              <div v-if="activeDocument.content">
                <MarkdownView v-if="DOCUMENTS.find((item) => item.path === activeDocument?.path)?.kind === 'markdown'" :content="activeDocument.content" />
                <pre v-else class="overflow-x-auto rounded-lg bg-[#f8f8f8] p-4 font-mono text-xs leading-6">{{ prettyJson(activeDocument.content) }}</pre>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 版本 -->
      <div v-else class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div class="mx-auto max-w-3xl">
          <p v-if="revisionsLoading && revisions.length === 0" class="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground"><LoaderCircle class="animate-spin" />加载版本…</p>
          <p v-else-if="revisionsError && revisions.length === 0" class="py-10 text-center text-xs text-red-600">{{ revisionsError }}</p>
          <div v-else-if="revisions.length === 0" class="flex flex-col items-center py-10 text-center">
            <History class="mb-3 size-6 text-neutral-300" />
            <p class="text-sm text-neutral-400">暂无版本记录</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="revision in revisions" :key="revision.id" class="rounded-xl border p-4">
              <div class="flex items-center justify-between gap-3">
                <p class="font-mono text-sm font-medium">{{ shortCommit(revision.commitHash) }}</p>
                <p class="text-xs text-neutral-400">{{ formatTime(revision.createdAt) }}</p>
              </div>
              <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ revision.summary || '初始版本' }}</p>
            </div>
            <Button v-if="canLoadMoreRevisions" variant="outline" size="sm" class="w-full" :disabled="revisionsLoading" @click="loadRevisions()">
              <LoaderCircle v-if="revisionsLoading" class="animate-spin" />加载更多版本
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 会话重命名对话框 -->
    <Dialog :open="renameOpen" title="重命名会话" @update:open="renameOpen = $event">
      <form class="space-y-4" @submit.prevent="saveConversation">
        <div class="space-y-1.5">
          <label for="conversation-title" class="text-xs text-muted-foreground">标题</label>
          <Input id="conversation-title" v-model="conversationTitle" maxlength="100" placeholder="会话标题，不超过 100 字符" />
        </div>
        <p v-if="conversationError" role="alert" class="text-xs text-red-600">{{ conversationError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" @click="renameOpen = false">取消</Button>
          <Button type="submit" :disabled="savingConversation || !conversationTitle.trim()"><LoaderCircle v-if="savingConversation" class="animate-spin" />保存</Button>
        </div>
      </form>
    </Dialog>
  </div>
</template>
