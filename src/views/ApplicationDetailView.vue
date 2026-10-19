<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  FileJson,
  FileText,
  History,
  LoaderCircle,
  MessageSquare,
  NotebookText,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Trash2,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import RequirementComposer from '@/components/RequirementComposer.vue'
import ToolPicker from '@/components/ToolPicker.vue'
import RunProcess from '@/components/RunProcess.vue'
import ClarificationForm from '@/components/ClarificationForm.vue'
import * as applicationsApi from '@/api/applications'
import * as conversationsApi from '@/api/conversations'
import * as agentApi from '@/api/agent'
import { describeError } from '@/lib/errors'
import { ApiError } from '@/lib/http'
import { getPublicSettings } from '@/api/settings'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAuthStore } from '@/stores/auth'
import type { Application, DocumentView, Revision } from '@/api/applications'
import type { Message } from '@/api/conversations'
import type { PublicSettings } from '@/api/settings'
import type { ProjectTool, ReasoningEffort, RunView } from '@/api/agent'

const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceStore()
const auth = useAuthStore()
const applicationId = String(route.params.id)

const MESSAGE_SIZE = 50

const STATUS_META: Record<string, { label: string; class: string }> = {
  INITIALIZING: { label: '初始化中', class: 'border-neutral-300 text-neutral-500' },
  READY: { label: '就绪', class: 'border-neutral-800 text-neutral-800' },
  FAILED: { label: '初始化失败', class: 'border-red-300 text-red-600' },
}

// AGENTS.md 不在这里：它是项目记忆，归右半的「记忆」标签，避免两个标签重复列同一个文件
const DOCUMENTS: { path: string; label: string; kind: 'markdown' | 'json' }[] = [
  { path: 'docs/requirements.md', label: '需求说明', kind: 'markdown' },
  { path: 'docs/design/overview.md', label: '概要设计', kind: 'markdown' },
  { path: 'docs/design/detail.md', label: '详细设计', kind: 'markdown' },
  { path: 'progress.json', label: '开发进度', kind: 'json' },
  { path: 'api/openapi.json', label: 'OpenAPI 契约', kind: 'json' },
]

// 应用
const application = ref<Application | null>(null)
const appLoading = ref(true)
const appError = ref('')

// 当前会话（来自左侧层级树的选中状态）
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

// AI 对话：模型来自平台公开配置，任务走 runs 接口，内容以 SSE 快照整体替换
const OPTIMISTIC_PREFIX = 'pending-'
const publicSettings = ref<PublicSettings | null>(null)
const settingsLoaded = ref(false)
const selectedModelId = ref('')
const reasoningEffort = ref<ReasoningEffort>('DEFAULT')
const memoryEnabled = ref(true)
/** 工具调用：目录来自后端，选择状态由前端维护，每次请求携带 */
const toolCatalog = ref<ProjectTool[]>([])
const toolsLoading = ref(false)
const toolsError = ref('')
const selectedToolIds = ref<string[]>([])
const activeRun = ref<RunView | null>(null)
const clarificationHistory = ref<agentApi.Clarification[]>([])
const answeringQuestions = ref(false)
const questionError = ref('')
const pendingQuestion = computed(() => activeRun.value?.pendingQuestion
  ?? clarificationHistory.value.find(item => item.status === 'PENDING') ?? null)
const streamingText = ref('')
const runNotice = ref('')

/**
 * 失败诊断。后端 RunView 只有 errorCode，服务商返回的原始异常在
 * AgentService.onError 里被丢弃（不落库、不打日志、不回传），
 * 因此这里把客户端能拿到的信息全部摊开，并标明边界。
 */
interface RunFailure {
  title: string
  code: string
  modelId: string
  elapsed: string
  detail: string
}
const runFailure = ref<RunFailure | null>(null)

/** 常见错误码的实际含义与排查方向。 */
const RUN_ERROR_HINTS: Record<string, string> = {
  MODEL_REQUEST_FAILED: '服务商拒绝了请求，通常是密钥无效、接口地址不对、模型名称不存在、额度不足或被限流。原始 HTTP 响应由后端记录，接口只回传错误码，详情请查后端日志。',
  MODEL_TIMEOUT: '模型在配置的超时时间内没有返回。可在“设置 → 平台管理”调大该模型的超时时间后重试。',
  OUTPUT_LIMIT: '回复超过长度上限被中断。',
  EMPTY_OR_INVALID_RESPONSE: '服务商返回了空内容或无法解析的响应体，通常是接口地址或模型名称不匹配。',
  RESULT_SAVE_FAILED: '模型已返回内容，但写入数据库失败。',
  SERVER_RESTARTED: '任务执行期间服务重启，残留任务被标记为失败。',
}
const cancelling = ref(false)
let streamController: AbortController | null = null
let titleRefreshTimer: number | null = null

// 右侧多标签面板
const PANEL_WIDTH_KEY = 'drawsite:side-panel-width'
const MIN_PANEL_PCT = 20
const MAX_PANEL_PCT = 70
const DEFAULT_PANEL_PCT = 40
const containerRef = ref<HTMLElement | null>(null)
const panelOpen = ref(true)
const panelWidth = ref(readStoredPanelWidth())
const dragging = ref(false)
type SideTab = 'overview' | 'documents' | 'revisions' | 'memories'
const sideTab = ref<SideTab>('overview')
const sideTabs: { key: SideTab; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'documents', label: '文档' },
  { key: 'revisions', label: '版本' },
  { key: 'memories', label: '记忆' },
]

function readStoredPanelWidth(): number {
  const raw = localStorage.getItem(PANEL_WIDTH_KEY)
  if (!raw) return DEFAULT_PANEL_PCT
  const value = Number(raw)
  if (!Number.isFinite(value)) return DEFAULT_PANEL_PCT
  return Math.min(MAX_PANEL_PCT, Math.max(MIN_PANEL_PCT, value))
}

function startResize() {
  dragging.value = true
  document.body.style.cursor = 'col-resize'
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

function onResize(event: MouseEvent) {
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const pct = ((rect.right - event.clientX) / rect.width) * 100
  panelWidth.value = Math.min(MAX_PANEL_PCT, Math.max(MIN_PANEL_PCT, Math.round(pct)))
  localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth.value))
}

function stopResize() {
  dragging.value = false
  document.body.style.cursor = ''
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}

onBeforeUnmount(() => {
  stopResize()
  streamController?.abort()
  streamController = null
  if (titleRefreshTimer !== null) window.clearTimeout(titleRefreshTimer)
  titleRefreshTimer = null
})

// 文档
const activeDocument = ref<DocumentView | null>(null)
const documentLoading = ref(false)
const documentError = ref('')

// 记忆：项目记忆就是工作区里的 AGENTS.md，不是数据库记录（见 docs/memory.md）
const memoryDocument = ref<DocumentView | null>(null)
const memoryLoading = ref(false)
const memoryError = ref('')
const memoryMissing = ref(false)

// 版本
const revisions = ref<Revision[]>([])
const revisionsTotal = ref(0)
const revisionsPage = ref(1)
const revisionsLoading = ref(false)
const revisionsError = ref('')

const canLoadMoreMessages = computed(() => messages.value.length < messagesTotal.value)
const canLoadMoreRevisions = computed(() => revisions.value.length < revisionsTotal.value)

const availableModels = computed(() => publicSettings.value?.models ?? [])
const selectedModel = computed(() => availableModels.value.find((item) => item.id === selectedModelId.value) ?? null)
// 对话消息左侧标识：显示当前模型名称（未配置模型时回退为 AI）
const aiLabel = computed(() => selectedModel.value?.displayName || 'AI')
const canUseReasoning = computed(() => Boolean(selectedModel.value?.supportsReasoning))
const canUseTools = computed(() => Boolean(selectedModel.value?.supportsTools))
/**
 * 没有总开关，工具是自动开关：模型支持工具、且至少勾选一个工具模块，才算本次开启。
 * 两个条件缺一就完全不下发 toolsEnabled / toolNames——模型没开 supportsTools 时下发会直接 400 TOOLS_UNSUPPORTED。
 */
const effectiveToolsEnabled = computed(() => canUseTools.value && selectedToolIds.value.length > 0)
const hasModel = computed(() => availableModels.value.length > 0)
const modelOptions = computed(() => availableModels.value.map((model) => ({ value: model.id, label: model.displayName })))
const REASONING_OPTIONS = [
  { value: 'DEFAULT', label: '默认' },
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
]
/** Select 的 v-model 是 string，这里转回联合类型，避免下拉写入越界值。 */
const reasoningEffortValue = computed({
  get: () => reasoningEffort.value,
  set: (value: string) => {
    reasoningEffort.value = value as ReasoningEffort
  },
})
const runRunning = computed(() => activeRun.value?.status === 'RUNNING')
/** phase 只描述进行中的阶段（见 docs/agent.md），终态要看 status。 */
const RUN_PHASE_LABELS: Record<string, string> = {
  WAITING_MODEL: '等待模型响应',
  WAITING_USER: '等待你的回答',
  THINKING: '思考中',
  CALLING_TOOL: '调用工具中',
  RESPONDING: '生成回复中',
}
/**
 * 失败与取消时 activeRun 会被保留（用于展示过程与诊断块），所以不能一律写“已完成”。
 */
const runStatusLabel = computed(() => {
  const run = activeRun.value
  if (!run) return ''
  if (run.status === 'RUNNING') return RUN_PHASE_LABELS[run.phase] ?? '运行中'
  if (run.status === 'CANCELLED') return '已停止'
  if (run.status === 'FAILED') return '失败'
  return '已完成'
})
const submitting = computed(() => sending.value || runRunning.value)
/**
 * 会话没有消息时输入框居中（带引导文案与示例卡片），发出第一条后落到底部。
 * 加上 !messagesLoading 是为了切换会话时不要先居中再跳走。
 */
const showComposerIntro = computed(() => !messagesLoading.value && messages.value.length === 0 && !runRunning.value && !streamingText.value)

/**
 * 对话区滚动容器。输入框悬浮在它上面，新内容必须自己滚到底部，
 * 否则最新一条会停在输入框后面看不见。
 */
const scrollRef = ref<HTMLElement | null>(null)
/** 用户手动往上翻后停止自动跟随，滚回底部再恢复。 */
let followBottom = true

function onScroll() {
  const element = scrollRef.value
  if (!element) return
  followBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48
}

/** force=true 用于用户自己触发的跳转（提交、切换会话、刷新），忽略当前滚动位置。 */
function scrollToBottom(force = false) {
  if (!force && !followBottom) return
  void nextTick(() => {
    const element = scrollRef.value
    if (!element) return
    element.scrollTop = element.scrollHeight
    followBottom = true
  })
}
/**
 * 全局记忆工具在 `memoryEnabled=false` 时会被后端**静默摘掉**：`ProjectToolRegistry.bindModules`
 * 里 `module.available(context)` 为 false 就 `continue`，既不报错也不进模型可见的工具集，
 * 所以勾了也不会生效。这里点一句，免得用户以为模型会去写记忆。
 * 只引用这一个模块 id，不维护工具清单；后端若改 id，这段静默失效，没有副作用。
 */
const memoryToolNeedsMemory = computed(() => effectiveToolsEnabled.value
  && !memoryEnabled.value
  && selectedToolIds.value.includes('globalMemory'))

const composerHint = computed(() => {
  if (runRunning.value) return '正在生成回复，可点击“停止”中断'
  if (sending.value) return '提交中…'
  if (!hasModel.value) return '平台未配置可用模型'
  // 常驻提示：工具开启时模型会直接改写项目文件，这是不可回滚操作，不能只在空会话首屏说一次
  if (effectiveToolsEnabled.value) {
    const base = '已开启工具调用：模型会直接改写项目文件，写入立即落盘，取消不会回滚'
    return memoryToolNeedsMemory.value ? `${base}；「全局记忆」已勾选但「记忆」关着，本次不会调用它` : base
  }
  return ''
})

/** 首屏说明必须跟着真实能力走：开了工具模型就能改文件，不能再写“不会修改项目文件”。 */
const composerSubheading = computed(() => {
  if (effectiveToolsEnabled.value) {
    return `描述应用需求。已开启 ${selectedToolIds.value.length} 个工具模块，模型可以读写当前项目文件；写入立即落盘，取消不会回滚已完成的修改。`
  }
  if (!canUseTools.value) {
    return '描述应用需求，提交后由所选模型生成回复。当前模型未开启工具支持，本次不会修改项目文件。'
  }
  if (toolCatalog.value.length === 0) {
    return '描述应用需求，提交后由所选模型生成回复。当前后端没有可用工具，模型不会修改项目文件。'
  }
  return '描述应用需求，提交后由所选模型生成回复。没有勾选任何工具，本次按纯对话处理。'
})

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function shortCommit(hash: string): string {
  if (!hash) return '—'
  return hash.length > 8 ? `${hash.slice(0, 8)}…` : hash
}

const overviewRefreshing = ref(false)
const overviewNotice = ref('')

/** 删除应用：后端会连带清理工作区目录、会话消息、对话任务与版本记录，并自动停止该应用全部回复。 */
const deleteAppOpen = ref(false)
const deletingApp = ref(false)
const deleteAppError = ref('')

async function confirmDeleteApplication() {
  if (deletingApp.value) return
  deletingApp.value = true
  deleteAppError.value = ''
  try {
    await workspace.deleteApplication(applicationId)
    deleteAppOpen.value = false
    void router.replace('/applications')
  } catch (cause) {
    deleteAppError.value = describeError(cause, '删除应用失败')
  } finally {
    deletingApp.value = false
  }
}

/** 概览里的刷新：静默重取应用信息与已保存的消息，不切到整页加载态。 */
async function refreshOverview() {
  if (overviewRefreshing.value) return
  overviewRefreshing.value = true
  overviewNotice.value = ''
  try {
    application.value = await applicationsApi.getApplication(applicationId)
    if (selectedConversationId.value) {
      await refreshMessages()
      // refreshMessages 自己吞掉异常写进 messagesError，消息非空时界面不显示，这里回传出来
      if (messagesError.value) {
        overviewNotice.value = messagesError.value
        return
      }
    }
    overviewNotice.value = '已刷新。'
  } catch (cause) {
    overviewNotice.value = describeError(cause, '刷新失败')
  } finally {
    overviewRefreshing.value = false
  }
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

async function selectConversation(id: string) {
  selectedConversationId.value = id
  if (route.query.conversation !== id) {
    void router.replace({ query: { ...route.query, conversation: id } })
  }
  await loadMessages()
}

function resetRunState() {
  streamController?.abort()
  streamController = null
  activeRun.value = null
  streamingText.value = ''
  runNotice.value = ''
  runFailure.value = null
  cancelling.value = false
  clarificationHistory.value = []
  questionError.value = ''
}

/** 会话被删除或从 URL 上移除时清空工作区，避免停留在已经不存在的内容上。 */
function clearConversation() {
  resetRunState()
  selectedConversationId.value = ''
  messages.value = []
  messagesPage.value = 0
  messagesTotal.value = 0
  messagesError.value = ''
  draftInput.value = ''
  sendError.value = ''
}

async function loadMessages() {
  if (!selectedConversationId.value) return
  resetRunState()
  messages.value = []
  messagesPage.value = 0
  messagesTotal.value = 0
  followBottom = true
  await loadMoreMessages()
  const conversationId = selectedConversationId.value
  try {
    const items = await agentApi.listClarifications(applicationId, conversationId)
    if (selectedConversationId.value !== conversationId) return
    clarificationHistory.value = items
    const pending = items.find(item => item.status === 'PENDING')
    if (pending) {
      const run = await agentApi.getRun(applicationId, conversationId, pending.runId)
      if (selectedConversationId.value !== conversationId) return
      activeRun.value = run
      void subscribeRun(pending.runId)
    }
  } catch (cause) {
    if (selectedConversationId.value === conversationId) questionError.value = describeError(cause, '加载询问失败')
  }
  scrollToBottom(true)
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
    messagesError.value = describeError(cause, '加载消息失败')
  } finally {
    messagesLoading.value = false
  }
}

/**
 * 重新拉取已保存的消息。任务在服务端继续执行时，刷新页面后只能靠消息列表拿到已保存的回复。
 * 保留已展开的页数，用更大的 size 一次取回。
 */
async function refreshMessages() {
  const conversationId = selectedConversationId.value
  if (!conversationId || messagesLoading.value) return
  const size = Math.min(100, Math.max(MESSAGE_SIZE, messagesPage.value * MESSAGE_SIZE))
  messagesLoading.value = true
  messagesError.value = ''
  try {
    const result = await conversationsApi.listMessages(applicationId, conversationId, 1, size)
    if (conversationId !== selectedConversationId.value) return
    messages.value = result.records
    messagesTotal.value = result.total
    messagesPage.value = Math.ceil(result.records.length / MESSAGE_SIZE)
    scrollToBottom(true)
  } catch (cause) {
    messagesError.value = describeError(cause, '刷新消息失败')
  } finally {
    messagesLoading.value = false
  }
}

function formatElapsed(from: string, to: string | null): string {
  if (!to) return '—'
  const ms = new Date(to).getTime() - new Date(from).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return ms < 1000 ? `${ms} 毫秒` : `${(ms / 1000).toFixed(1)} 秒`
}

/** 组装失败诊断块；detail 优先用错误码提示，未知错误码回落到后端文案。 */
function buildFailure(input: {
  code: string | null
  modelId: string
  createdAt: string
  finishedAt: string | null
  fallback: string
}): RunFailure {
  const code = input.code ?? '（未返回错误码）'
  return {
    title: agentApi.runErrorMessage(input.code, input.fallback),
    code,
    modelId: input.modelId || '—',
    elapsed: formatElapsed(input.createdAt, input.finishedAt),
    detail: (input.code ? RUN_ERROR_HINTS[input.code] : '') || '服务端未提供更多信息，请查看后端日志。',
  }
}

/** 复制完整诊断信息，方便贴到日志或工单里。 */
async function copyFailure() {
  const failure = runFailure.value
  if (!failure) return
  const text = [
    failure.title,
    `错误码：${failure.code}`,
    `模型：${failure.modelId}`,
    `耗时：${failure.elapsed}`,
    `会话：${selectedConversationId.value || '—'}`,
    `说明：${failure.detail}`,
    `时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    runNotice.value = '错误信息已复制到剪贴板。'
  } catch {
    runNotice.value = '复制失败，请手动选中文本。'
  }
}

async function loadPublicSettings() {
  try {
    const settings = await getPublicSettings()
    publicSettings.value = settings
    const known = settings.models.some((item) => item.id === selectedModelId.value)
    if (!known) {
      const preferred = settings.models.find((item) => item.id === settings.defaultModelId)
      selectedModelId.value = preferred?.id ?? settings.models[0]?.id ?? ''
    }
  } catch {
    // 公开配置不可达时不阻塞会话浏览，提交时会给出明确错误
  } finally {
    settingsLoaded.value = true
  }
}

/**
 * 工具目录只取一次。后端按已注册**模块**动态生成（`{id, name, description}`），前端不硬编码模块 id。
 * 默认全选；重取时按 id 求交集，避免把后端已移除的模块发上去触发 400 TOOL_NOT_AVAILABLE。
 */
async function loadTools() {
  toolsLoading.value = true
  toolsError.value = ''
  try {
    const tools = await agentApi.listTools()
    toolCatalog.value = tools
    const ids = new Set(tools.map((tool) => tool.id))
    selectedToolIds.value = selectedToolIds.value.length === 0
      ? tools.map((tool) => tool.id)
      : selectedToolIds.value.filter((id) => ids.has(id))
  } catch (cause) {
    toolCatalog.value = []
    toolsError.value = describeError(cause, '加载工具列表失败')
  } finally {
    toolsLoading.value = false
  }
}

/**
 * 提交需求：runs 接口会自行保存用户消息，不能再调用 messages 接口重复保存。
 * 回复内容以快照整体替换，不按增量累加。
 */
async function submitMessage(content: string) {
  const conversationId = selectedConversationId.value
  if (!conversationId || submitting.value) return
  if (!selectedModelId.value) {
    sendError.value = '平台尚未配置可用模型，请联系管理员在平台设置中添加并启用模型。'
    return
  }
  sending.value = true
  activeRun.value = null
  streamingText.value = ''
  sendError.value = ''
  runNotice.value = ''
  runFailure.value = null
  const optimistic: Message = {
    id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
    conversationId,
    role: 'USER',
    content,
    createdAt: new Date().toISOString(),
  }
  messages.value.push(optimistic)
  scrollToBottom(true)

  let run: RunView
  try {
    run = await agentApi.startRun(applicationId, conversationId, {
      content,
      modelId: selectedModelId.value,
      reasoningEffort: canUseReasoning.value && reasoningEffort.value !== 'DEFAULT' ? reasoningEffort.value : undefined,
      memoryEnabled: memoryEnabled.value,
      // 模型不支持工具时不下发，否则后端返回 400 TOOLS_UNSUPPORTED
      toolsEnabled: effectiveToolsEnabled.value ? true : undefined,
      // 非空数组 = 只开这些工具；空数组 = 关闭全部工具（后端会按纯对话处理）
      toolNames: effectiveToolsEnabled.value ? selectedToolIds.value : undefined,
    })
  } catch (cause) {
    messages.value = messages.value.filter((item) => !item.id.startsWith(OPTIMISTIC_PREFIX))
    sendError.value = describeError(cause, '发送失败')
    sending.value = false
    return
  }
  // 服务端已保存该消息，用真实 ID 替换乐观记录（走数组赋值以触发响应式）
  const optimisticIndex = messages.value.findIndex((item) => item.id.startsWith(OPTIMISTIC_PREFIX))
  if (optimisticIndex >= 0) {
    messages.value[optimisticIndex] = { ...messages.value[optimisticIndex], id: run.userMessageId }
  }
  messagesTotal.value += 1
  draftInput.value = ''
  sending.value = false
  activeRun.value = run
  streamingText.value = run.content ?? ''
  await subscribeRun(run.id)
}

async function subscribeRun(runId: string) {
  const conversationId = selectedConversationId.value
  const controller = new AbortController()
  streamController = controller
  try {
    await agentApi.streamRun(applicationId, conversationId, runId, {
      signal: controller.signal,
      onSnapshot: (snapshot) => {
        if (snapshot.conversationId !== selectedConversationId.value) return
        activeRun.value = snapshot
        if (snapshot.pendingQuestion) {
          clarificationHistory.value = [...clarificationHistory.value.filter(item => item.id !== snapshot.pendingQuestion!.id), snapshot.pendingQuestion]
        }
        streamingText.value = snapshot.content ?? ''
        scrollToBottom()
      },
      onDone: (snapshot) => finalizeRun(snapshot),
    })
    // 服务端未发送终态就关闭连接时，回查一次任务状态，避免生成态一直锁住输入
    if (activeRun.value?.status === 'RUNNING') await reconcileRun(runId)
  } catch (cause) {
    if (controller.signal.aborted) return
    if (activeRun.value?.status === 'RUNNING') {
      runNotice.value = `${describeError(cause, '事件流已中断')} 任务可能仍在服务端继续，稍后可点击“刷新消息”查看结果。`
      if (activeRun.value.phase !== 'WAITING_USER') activeRun.value = null
      streamingText.value = ''
    }
  } finally {
    if (streamController === controller) streamController = null
  }
}

function finalizeRun(snapshot: RunView) {
  if (snapshot.conversationId !== selectedConversationId.value) return
  clarificationHistory.value = clarificationHistory.value.map(item => item.runId === snapshot.id && item.status === 'PENDING'
    ? { ...item, status: 'CANCELLED' as const } : item)
  if (snapshot.status === 'SUCCEEDED') {
    // 手动刷新可能已把这条回复拉回来，按 ID 去重避免重复渲染
    if (snapshot.assistantMessageId && !messages.value.some((item) => item.id === snapshot.assistantMessageId)) {
      messages.value.push({
        id: snapshot.assistantMessageId,
        conversationId: snapshot.conversationId,
        role: 'ASSISTANT',
        content: snapshot.content,
        steps: snapshot.steps,
        createdAt: snapshot.finishedAt ?? new Date().toISOString(),
      })
      messagesTotal.value += 1
      scrollToBottom()
    }
    runNotice.value = ''
    runFailure.value = null
    void workspace.refreshConversations(applicationId)
    // 首轮标题由服务端异步生成且不阻塞 done，稍后再刷新一次侧栏
    if (titleRefreshTimer !== null) window.clearTimeout(titleRefreshTimer)
    titleRefreshTimer = window.setTimeout(() => {
      titleRefreshTimer = null
      void workspace.refreshConversations(applicationId)
    }, 3000)
  } else if (snapshot.status === 'CANCELLED') {
    runNotice.value = '已停止生成，本次回复未保存。'
    runFailure.value = null
  } else {
    runFailure.value = buildFailure({
      code: snapshot.errorCode,
      modelId: snapshot.modelId,
      createdAt: snapshot.createdAt,
      finishedAt: snapshot.finishedAt,
      fallback: '对话失败，本次回复未保存。',
    })
    runNotice.value = ''
  }
  activeRun.value = snapshot.status === 'SUCCEEDED' ? null : snapshot
  streamingText.value = ''
}

/** 事件流未送终态就结束时的兜底：回查一次任务，仍不确定则解除生成态并提示。 */
async function reconcileRun(runId: string) {
  const conversationId = selectedConversationId.value
  try {
    const snapshot = await agentApi.getRun(applicationId, conversationId, runId)
    if (snapshot.phase === 'WAITING_USER' && snapshot.pendingQuestion) {
      activeRun.value = snapshot
      return
    }
    if (snapshot.status !== 'RUNNING') {
      finalizeRun(snapshot)
      return
    }
  } catch {
    // 回查失败按中断处理
  }
  if (activeRun.value?.status === 'RUNNING') {
    runNotice.value = '事件流已结束但任务状态未确认，稍后可点击“刷新消息”查看结果。'
    activeRun.value = null
    streamingText.value = ''
  }
}

async function stopRun() {
  const run = activeRun.value
  if (!run || cancelling.value) return
  cancelling.value = true
  try {
    await agentApi.cancelRun(applicationId, run.conversationId, run.id)
  } catch (cause) {
    runNotice.value = describeError(cause, '停止失败')
  } finally {
    cancelling.value = false
  }
}

async function submitAnswers(answers: agentApi.DetailAnswer[]) {
  const item = pendingQuestion.value
  if (!item || answeringQuestions.value) return
  const conversationId = selectedConversationId.value
  answeringQuestions.value = true
  questionError.value = ''
  try {
    const answered = await agentApi.answerClarification(applicationId, conversationId, item.id, answers)
    if (conversationId !== selectedConversationId.value) return
    clarificationHistory.value = [...clarificationHistory.value.filter(value => value.id !== item.id), answered]
    if (activeRun.value) activeRun.value = { ...activeRun.value, pendingQuestion: null }
    if (!streamController) {
      activeRun.value = await agentApi.getRun(applicationId, conversationId, item.runId)
      void subscribeRun(item.runId)
    }
  } catch (cause) { questionError.value = describeError(cause, '提交回答失败') }
  finally { answeringQuestions.value = false }
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

/**
 * 项目记忆 = 工作区里的 AGENTS.md，不是数据库记录（见 docs/memory.md）。
 * 后端把 AGENTS.md 放在允许读取的文档路径里，所以直接复用文档接口；文件不存在时返回
 * 404 DOCUMENT_NOT_FOUND，这是正常状态（项目还没记过东西），当成空态而不是错误。
 * 用户级跨项目偏好不在这里，走设置页的「记忆管理」。
 */
async function loadMemory() {
  memoryLoading.value = true
  memoryError.value = ''
  memoryMissing.value = false
  try {
    memoryDocument.value = await applicationsApi.getDocument(applicationId, 'AGENTS.md')
  } catch (cause) {
    memoryDocument.value = null
    if (cause instanceof ApiError && cause.code === 'DOCUMENT_NOT_FOUND') memoryMissing.value = true
    else memoryError.value = describeError(cause, '加载项目记忆失败')
  } finally {
    memoryLoading.value = false
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

function openSideTab(tab: SideTab) {
  panelOpen.value = true
  sideTab.value = tab
  if (tab === 'documents' && !activeDocument.value && !documentLoading.value) {
    void loadDocument(DOCUMENTS[0].path)
  }
  if (tab === 'revisions' && revisions.value.length === 0) {
    void loadRevisions()
  }
  if (tab === 'memories' && !memoryDocument.value && !memoryLoading.value) {
    void loadMemory()
  }
}

watch(
  () => route.params.id,
  () => router.replace({ name: 'applications' }),
)

// 左侧层级树切换会话时同步；会话被删除后 query 会被清掉，这里同步清空
watch(
  () => route.query.conversation,
  async (id) => {
    if (typeof id !== 'string') {
      if (selectedConversationId.value) clearConversation()
      return
    }
    if (id === selectedConversationId.value) return
    if (!workspace.conversationsByApplication[applicationId]) {
      await workspace.loadConversations(applicationId)
    }
    if (workspace.conversationsByApplication[applicationId]?.some((item) => item.id === id)) {
      await selectConversation(id)
    } else {
      clearConversation()
    }
  },
)

onMounted(() => {
  void loadApplication()
  void loadPublicSettings()
  void loadTools()
  void (async () => {
    const target = typeof route.query.conversation === 'string' ? route.query.conversation : ''
    if (!target) return
    if (!workspace.conversationsByApplication[applicationId]) {
      await workspace.loadConversations(applicationId)
    }
    if (workspace.conversationsByApplication[applicationId]?.some((item) => item.id === target)) {
      await selectConversation(target)
    }
  })()
})
</script>

<template>
  <div v-if="appLoading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle class="animate-spin" />正在加载应用…</div>
  <div v-else-if="appError" class="flex flex-1 flex-col items-center justify-center gap-4 p-8">
    <p class="text-sm text-red-600">{{ appError }}</p>
    <Button as-child variant="outline" size="sm"><RouterLink to="/applications">返回我的应用</RouterLink></Button>
  </div>
  <div v-else-if="application" ref="containerRef" class="flex min-h-0 flex-1">
    <!-- 左半：对话。应用信息与状态在右半概览。 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 未选择会话 -->
      <div v-if="!selectedConversationId" class="min-h-0 flex-1 overflow-y-auto px-6">
        <p class="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 py-16 text-center">
          <MessageSquare class="size-7 text-neutral-300" />
          <span class="text-sm font-medium">从左侧选择或新建一个会话</span>
          <span class="text-xs leading-6 text-muted-foreground">会话在左侧“最近的应用”层级中管理，新建会话默认命名为“新建会话”。</span>
        </p>
      </div>

      <template v-else>
        <!-- 对话历史铺满整个高度，输入框贴底悬浮，滚动条贯穿全高 -->
        <div ref="scrollRef" class="min-h-0 flex-1 overflow-y-auto px-6 pt-6" @scroll.passive="onScroll">
          <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col">
            <div class="flex-1">
              <div v-if="canLoadMoreMessages || (messagesLoading && messages.length === 0) || (messagesError && messages.length === 0)" class="mb-6 flex flex-wrap items-center gap-2">
              <Button v-if="canLoadMoreMessages" variant="outline" size="sm" :disabled="messagesLoading" @click="loadMoreMessages">
                <LoaderCircle v-if="messagesLoading" class="animate-spin" />加载更早的消息
              </Button>
              <p v-if="messagesLoading && messages.length === 0" class="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle class="animate-spin" />加载消息…</p>
              <p v-else-if="messagesError && messages.length === 0" class="text-xs text-red-600">{{ messagesError }}</p>
            </div>
            <div v-if="messages.length > 0" class="mb-8 space-y-5">
              <!-- 我的消息靠右，平台助手回复靠左 -->
              <div v-for="message in messages" :key="message.id" class="flex gap-3" :class="message.role === 'USER' ? 'flex-row-reverse' : ''">
                <div
                  v-if="message.role === 'USER'"
                  class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#ececec] text-[10px] font-medium"
                >{{ auth.user?.username?.charAt(0)?.toUpperCase() ?? '我' }}</div>
                <div
                  v-else
                  class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#ececec] text-[10px] font-medium"
                  :title="aiLabel"
                >{{ aiLabel.charAt(0) }}</div>
                <div class="min-w-0 flex-1" :class="message.role === 'USER' ? 'flex flex-col items-end' : ''">
                  <div class="flex items-baseline gap-2">
                    <p v-if="message.role !== 'USER'" class="truncate text-xs font-medium">{{ aiLabel }}</p>
                    <p class="text-[11px] text-neutral-400">{{ formatTime(message.createdAt) }}</p>
                  </div>
                  <div
                    class="mt-1.5 text-neutral-800"
                    :class="message.role === 'USER' ? 'max-w-[85%] rounded-2xl rounded-tr-sm bg-[#f4f4f4] px-3.5 py-2' : ''"
                  >
                    <RunProcess v-if="message.role === 'ASSISTANT'" :steps="message.steps ?? []" />
                    <div :class="message.steps?.length ? 'mt-2' : ''">
                      <MarkdownView :content="message.content" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 生成中的回复：服务端只保存完成的回复，失败与取消不落库 -->
            <div v-if="runRunning || streamingText || activeRun?.steps?.length" class="mb-8 flex gap-3">
              <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#ececec] text-[10px] font-medium" :title="aiLabel">{{ aiLabel.charAt(0) }}</div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="text-xs font-medium">{{ aiLabel }}</p>
                  <p class="flex items-center gap-1.5 text-[11px] text-neutral-400"><LoaderCircle v-if="runRunning" class="size-3 animate-spin" />{{ runStatusLabel }}</p>
                </div>
                <RunProcess :steps="activeRun?.steps ?? []" :running="runRunning" />
                <div v-if="streamingText" class="mt-2 text-neutral-800">
                  <MarkdownView :content="streamingText" />
                </div>
                <p v-else-if="!activeRun?.steps?.length" class="mt-1.5 text-sm leading-7 text-neutral-400">等待模型响应…</p>
              </div>
            </div>

            <!-- 失败诊断：后端只回传错误码，这里把客户端已知信息全部摊开 -->
            <ClarificationForm v-if="pendingQuestion" :key="pendingQuestion.id" :item="pendingQuestion"
              :submitting="answeringQuestions" :error="questionError" @submit="submitAnswers" />
            <details v-for="item in clarificationHistory.filter(value => value.status === 'ANSWERED')" :key="item.id"
              class="mb-3 mt-3 rounded-lg border px-3 py-2 text-xs text-neutral-500">
              <summary class="cursor-pointer">已回答询问细节</summary>
              <div v-for="(question, index) in item.questions" :key="index" class="mt-3 space-y-1">
                <p>{{ question.question }}</p>
                <p>{{ item.answers.find(answer => answer.questionIndex === index)?.selectedOptions.join('、') }}</p>
                <p class="whitespace-pre-wrap">{{ item.answers.find(answer => answer.questionIndex === index)?.customText }}</p>
              </div>
            </details>
            <div v-if="runFailure" role="alert" class="mb-4 rounded-lg border border-red-200 bg-red-50/70 px-3.5 py-3">
              <p class="text-xs font-medium text-red-700">{{ runFailure.title }}</p>
              <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] leading-5">
                <dt class="text-neutral-400">错误码</dt>
                <dd class="font-mono break-all text-neutral-700">{{ runFailure.code }}</dd>
                <dt class="text-neutral-400">模型</dt>
                <dd class="font-mono break-all text-neutral-700">{{ runFailure.modelId }}</dd>
                <dt class="text-neutral-400">耗时</dt>
                <dd class="text-neutral-700">{{ runFailure.elapsed }}</dd>
              </dl>
              <p class="mt-2 text-[11px] leading-5 text-neutral-600">{{ runFailure.detail }}</p>
              <button type="button" class="mt-2 rounded-md border border-red-200 px-2 py-0.5 text-[11px] text-neutral-500 transition-colors hover:bg-black/5" @click="copyFailure">复制错误信息</button>
            </div>
            <p v-if="runNotice" role="status" class="mb-4 rounded-lg border bg-white px-3 py-2 text-xs leading-6 text-neutral-600">{{ runNotice }}</p>
            </div>

            <!-- 悬浮输入框：sticky 贴底，对话区滚动条贯穿整个高度 -->
            <div class="sticky bottom-0 mt-4 bg-background pt-3 pb-6">
              <p v-if="settingsLoaded && !hasModel" role="status" class="mb-3 rounded-lg border border-dashed px-4 py-3 text-xs leading-6 text-muted-foreground">平台尚未配置可用模型。管理员在“设置 → 平台管理”添加并启用模型后即可开始对话。</p>
              <RequirementComposer
              v-model="draftInput"
              heading="这个会话，想构建什么？"
              :subheading="composerSubheading"
              :show-intro="showComposerIntro"
              :hint="composerHint"
              :disabled="submitting"
              :running="submitting"
              :stopping="cancelling"
              @submit="submitMessage"
              @stop="stopRun"
            >
              <template #toolbar>
                <Select
                  v-model="selectedModelId"
                  :items="modelOptions"
                  :disabled="submitting || !hasModel"
                  placeholder="未配置模型"
                  aria-label="选择模型"
                  class="h-8 w-40 px-2 text-xs"
                />
                <Select
                  v-model="reasoningEffortValue"
                  :items="REASONING_OPTIONS"
                  :disabled="submitting || !canUseReasoning"
                  aria-label="思考强度"
                  class="h-8 w-24 px-2 text-xs"
                />
                <ToolPicker
                  :tools="toolCatalog"
                  :loading="toolsLoading"
                  :error="toolsError"
                  :supported="canUseTools"
                  :enabled="effectiveToolsEnabled"
                  :disabled="submitting"
                  v-model:selected="selectedToolIds"
                />
                <label
                  class="flex cursor-pointer items-center gap-2 text-xs text-neutral-500"
                  title="开启：注入你的全局记忆，并允许 AI 读取和更新项目记忆 AGENTS.md。关闭：都不注入，且 AI 看不到、也改不了 AGENTS.md。"
                >
                  <Switch v-model="memoryEnabled" :disabled="submitting" />
                  记忆
                </label>
              </template>
            </RequirementComposer>
            <p v-if="sendError" role="alert" class="mt-3 text-xs text-red-600">{{ sendError }}</p>
            </div>
            <!-- 会话还没有消息时，上方 flex-1 与这个等高空隙把输入框顶到垂直居中；发出第一条后空隙消失，输入框落到底部 -->
            <div v-if="showComposerIntro" class="flex-1" />
          </div>
        </div>
      </template>
    </div>

      <!-- 拖拽分隔条（仅展开时显示） -->
      <div
        v-if="panelOpen"
        class="w-1 shrink-0 cursor-col-resize bg-neutral-200 transition-colors hover:bg-neutral-400"
        :class="{ 'bg-neutral-400': dragging }"
        role="separator"
        aria-orientation="vertical"
        title="拖拽调整侧边栏宽度"
        @mousedown.prevent="startResize"
      />

      <!-- 右半：顶栏（概览 / 文档 / 版本 / 记忆 + 收起）与内容区 -->
      <aside v-if="panelOpen" :style="{ width: `${panelWidth}%` }" class="flex min-w-[20%] max-w-[70%] shrink-0 flex-col border-l bg-[#fafafa]">
        <div class="flex h-11 shrink-0 items-center justify-between border-b px-3">
          <nav class="flex items-center gap-1 text-sm" aria-label="侧边栏标签">
            <button
              v-for="tab in sideTabs"
              :key="tab.key"
              :aria-current="sideTab === tab.key ? 'page' : undefined"
              :class="['rounded-md px-2.5 py-1 transition-colors', sideTab === tab.key ? 'bg-[#eaeaea] font-medium' : 'text-neutral-500 hover:bg-black/5']"
              @click="openSideTab(tab.key)"
            >{{ tab.label }}</button>
          </nav>
          <Button variant="ghost" size="icon" aria-label="收起侧边栏" title="收起侧边栏" @click="panelOpen = false"><PanelRightClose /></Button>
        </div>
        <ScrollArea class="min-h-0 flex-1" viewport-class="p-4">
          <!-- 概览 -->
          <div v-if="sideTab === 'overview'">
            <div class="rounded-xl border bg-white p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="truncate text-sm font-medium">{{ application.name }}</h2>
                  <p v-if="application.description" class="mt-1.5 line-clamp-3 text-xs leading-5 text-muted-foreground">{{ application.description }}</p>
                </div>
                <Badge :class="STATUS_META[application.status]?.class ?? 'border-neutral-300 text-neutral-500'">{{ STATUS_META[application.status]?.label ?? application.status }}</Badge>
              </div>
              <div class="mt-3 flex items-center gap-2 border-t pt-3">
                <Button variant="outline" size="sm" :disabled="overviewRefreshing" title="重新读取应用信息与已保存的消息" @click="refreshOverview">
                  <RotateCw :class="{ 'animate-spin': overviewRefreshing }" />刷新
                </Button>
                <span v-if="overviewNotice" role="status" class="min-w-0 truncate text-xs text-muted-foreground">{{ overviewNotice }}</span>
                <Button variant="ghost" size="sm" class="ml-auto text-neutral-400 hover:text-red-600" title="删除应用" @click="deleteAppOpen = true"><Trash2 />删除</Button>
              </div>
            </div>

            <div class="mt-3 space-y-3 rounded-xl border bg-white p-4 text-sm">
              <div class="flex items-center justify-between"><span class="text-xs text-muted-foreground">当前提交</span><span class="font-mono text-xs">{{ shortCommit(application.currentCommit) }}</span></div>
              <div class="flex items-center justify-between"><span class="text-xs text-muted-foreground">创建时间</span><span class="text-xs">{{ formatTime(application.createdAt) }}</span></div>
              <div class="flex items-center justify-between"><span class="text-xs text-muted-foreground">更新时间</span><span class="text-xs">{{ formatTime(application.updatedAt) }}</span></div>
            </div>

            <div class="mt-6 rounded-xl border border-dashed p-6 text-center">
              <p class="text-sm text-neutral-400">概览内容占位</p>
              <p class="mt-2 text-xs leading-6 text-muted-foreground">后续将在这里展示项目进度摘要、关键指标与快捷入口。</p>
            </div>
          </div>
          <!-- 文档 -->
          <div v-else-if="sideTab === 'documents'">
            <div class="space-y-0.5">
              <button
                v-for="document in DOCUMENTS"
                :key="document.path"
                :aria-current="activeDocument?.path === document.path ? 'page' : undefined"
                :class="['flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors', activeDocument?.path === document.path ? 'bg-[#eaeaea] font-medium' : 'text-neutral-600 hover:bg-black/5']"
                @click="loadDocument(document.path)"
              >
                <component :is="document.kind === 'json' ? FileJson : FileText" class="size-3.5 shrink-0 text-neutral-400" />
                <span class="min-w-0 truncate">{{ document.label }}</span>
              </button>
            </div>
            <div class="mt-4">
              <p v-if="documentLoading" class="flex items-center gap-2 py-6 text-xs text-muted-foreground"><LoaderCircle class="animate-spin" />加载文档…</p>
              <p v-else-if="documentError" class="py-6 text-xs leading-6 text-red-600">{{ documentError }}</p>
              <template v-else-if="activeDocument">
                <p v-if="!activeDocument.content" class="py-6 text-center text-xs text-muted-foreground">文档内容为空</p>
                <template v-else>
                  <p class="mb-3 font-mono text-[11px] text-neutral-400">{{ activeDocument.path }}</p>
                  <MarkdownView v-if="DOCUMENTS.find((item) => item.path === activeDocument?.path)?.kind === 'markdown'" :content="activeDocument.content" />
                  <pre v-else class="overflow-x-auto rounded-lg bg-[#f8f8f8] p-3 font-mono text-[11px] leading-5">{{ prettyJson(activeDocument.content) }}</pre>
                </template>
              </template>
            </div>
          </div>
          <!-- 版本 -->
          <div v-else-if="sideTab === 'revisions'">
            <p v-if="revisionsLoading && revisions.length === 0" class="flex items-center gap-2 py-6 text-xs text-muted-foreground"><LoaderCircle class="animate-spin" />加载版本…</p>
            <p v-else-if="revisionsError && revisions.length === 0" class="py-6 text-xs text-red-600">{{ revisionsError }}</p>
            <div v-else-if="revisions.length === 0" class="flex flex-col items-center py-8 text-center">
              <History class="mb-3 size-5 text-neutral-300" />
              <p class="text-sm text-neutral-400">暂无版本记录</p>
            </div>
            <div v-else class="space-y-2.5">
              <div v-for="revision in revisions" :key="revision.id" class="rounded-lg border bg-white p-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="font-mono text-xs font-medium">{{ shortCommit(revision.commitHash) }}</p>
                  <p class="text-[11px] text-neutral-400">{{ formatTime(revision.createdAt) }}</p>
                </div>
                <p class="mt-1.5 text-xs leading-5 text-muted-foreground">{{ revision.summary || '初始版本' }}</p>
              </div>
              <Button v-if="canLoadMoreRevisions" variant="outline" size="sm" class="w-full" :disabled="revisionsLoading" @click="loadRevisions()">
                <LoaderCircle v-if="revisionsLoading" class="animate-spin" />加载更多版本
              </Button>
            </div>
          </div>
          <!--
            记忆：项目记忆就是工作区里的 AGENTS.md，不是数据库记录（见 docs/memory.md）。
            AGENTS.md 已从「文档」标签的列表里移除，只在这里展示，两个标签不重复列同一个文件。
          -->
          <div v-else>
            <div class="flex items-center gap-2.5">
              <NotebookText class="size-4 shrink-0 text-neutral-500" />
              <h2 class="text-sm font-medium">项目记忆</h2>
              <span class="ml-auto font-mono text-[11px] text-neutral-400">AGENTS.md</span>
              <Button variant="ghost" size="icon" class="size-7" aria-label="刷新项目记忆" title="刷新项目记忆" :disabled="memoryLoading" @click="loadMemory">
                <LoaderCircle v-if="memoryLoading" class="animate-spin" />
                <RotateCw v-else />
              </Button>
            </div>
            <div class="mt-4">
              <p v-if="memoryError" class="py-6 text-xs leading-6 text-red-600">{{ memoryError }}</p>
              <div v-else-if="memoryMissing" class="rounded-xl border border-dashed px-4 py-8 text-center">
                <p class="text-xs text-neutral-400">还没有 AGENTS.md</p>
                <p class="mt-2 text-xs leading-6 text-muted-foreground">在对话里让 AI 把项目偏好和已确认的决策记下来，就会生成这个文件。</p>
              </div>
              <template v-else-if="memoryDocument">
                <p v-if="!memoryDocument.content" class="py-6 text-center text-xs text-muted-foreground">AGENTS.md 内容为空</p>
                <MarkdownView v-else :content="memoryDocument.content" />
              </template>
              <p v-else class="py-6 text-center text-xs text-muted-foreground">尚未加载</p>
            </div>
          </div>
        </ScrollArea>
      </aside>

      <!-- 收起时：右侧窄轨，仅保留展开入口 -->
      <div v-else class="flex w-11 shrink-0 flex-col items-center border-l bg-[#fafafa] py-2">
        <Button variant="ghost" size="icon" aria-label="展开侧边栏" title="展开侧边栏" @click="panelOpen = true"><PanelRightOpen /></Button>
      </div>

      <ConfirmDialog
        :open="deleteAppOpen"
        title="删除应用"
        :description="`确定删除「${application.name}」？工作区目录、全部会话消息、对话任务与版本记录都会被清理，且无法恢复。`"
        confirm-text="删除应用"
        destructive
        :loading="deletingApp"
        :error="deleteAppError"
        @update:open="deleteAppOpen = $event"
        @confirm="confirmDeleteApplication"
      />
  </div>
</template>
