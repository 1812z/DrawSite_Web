import { ApiError, rejectResponse, request } from '@/lib/http'
import type { ApiResponse } from '@/lib/http'
import { apiErrorMessage } from '@/lib/errors'
import { getToken } from '@/lib/session'

/** 契约见 docs/agent.md；记忆见 docs/memory.md。 */

export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
export type ReasoningEffort = 'DEFAULT' | 'LOW' | 'MEDIUM' | 'HIGH'

export interface RunStep {
  id: string
  round: number
  type: 'WAITING_MODEL' | 'THINKING' | 'RESPONSE' | 'TOOL'
  title: string
  status: RunStatus
  content: string
  toolName: string | null
  startedAt: string
  finishedAt: string | null
}

export interface DetailQuestion {
  question: string
  options: string[]
}
export interface DetailAnswer {
  questionIndex: number
  selectedOptions: string[]
  customText: string
}
export interface Clarification {
  userMessageId: string
  id: string
  runId: string
  conversationId: string
  questions: DetailQuestion[]
  answers: DetailAnswer[]
  status: 'PENDING' | 'ANSWERED' | 'CANCELLED'
  createdAt: string
  answeredAt: string | null
}

export interface RunView {
  id: string
  conversationId: string
  status: RunStatus
  modelId: string
  reasoningEffort: ReasoningEffort
  memoryEnabled: boolean
  userMessageId: string
  assistantMessageId: string | null
  content: string
  errorCode: string | null
  createdAt: string
  finishedAt: string | null
  phase: string
  steps: RunStep[]
  pendingQuestion: Clarification | null
}

export interface ChatRequest {
  content: string
  /** 省略使用平台默认模型 */
  modelId?: string
  /** DEFAULT 不发送 reasoning_effort */
  reasoningEffort?: ReasoningEffort
  memoryEnabled?: boolean
  /**
   * 开启工具调用。仅传 `true` 且不带 `toolNames` 时开放全部工具（兼容旧请求）。
   * 传 `false` 时始终关闭。
   */
  toolsEnabled?: boolean
  /**
   * 非空数组 = 只开放这些工具（未知工具名提交前返回 400 TOOL_NOT_AVAILABLE）；
   * 空数组 = 关闭全部工具。仅传 toolNames 也会开启所选工具。
   */
  toolNames?: string[]
}

/** 项目文件工具，目录来自后端已注册的工具模块，全局共用（不区分应用）。 */
export interface ProjectTool {
  id: string
  name: string
  description: string
}

/**
 * 工具目录。需登录；后端按已注册模块动态生成，前端不硬编码工具名。
 * 选择状态由前端自己维护，每次请求携带。
 */
export const listTools = () => request<ProjectTool[]>('/agent/tools')

/**
 * 用户全局记忆：跨项目、每用户一条、最多 4000 字符（见 docs/memory.md）。
 * 没有记录时后端返回空 content 与 null updatedAt，不是 404。
 */
export interface UserMemory {
  content: string
  updatedAt: string | null
}

export const getUserMemory = () => request<UserMemory>('/users/me/memory')

/** 整体覆盖。content 必填、最多 4000 字符，可以为空（等价于只留一条空记录）。 */
export const saveUserMemory = (content: string) =>
  request<UserMemory>('/users/me/memory', { method: 'PUT', body: JSON.stringify({ content }) })

export const clearUserMemory = () => request<null>('/users/me/memory', { method: 'DELETE' })

/** 对话任务的错误码文案统一放在 `@/lib/errors`，这里只做语义化入口。 */
export function runErrorMessage(code: string | null | undefined, fallback = '对话失败'): string {
  return apiErrorMessage(code, fallback)
}

const runsBase = (applicationId: string, conversationId: string) =>
  `/applications/${applicationId}/conversations/${conversationId}/runs`

const questionsBase = (applicationId: string, conversationId: string) =>
  `/applications/${applicationId}/conversations/${conversationId}/clarifications`
export const listClarifications = (applicationId: string, conversationId: string) =>
  request<Clarification[]>(questionsBase(applicationId, conversationId))
export const answerClarification = (applicationId: string, conversationId: string, id: string, answers: DetailAnswer[]) =>
  request<Clarification>(`${questionsBase(applicationId, conversationId)}/${id}/answers`, {
    method: 'POST', body: JSON.stringify({ answers }),
  })

export const startRun = (applicationId: string, conversationId: string, payload: ChatRequest) =>
  request<RunView>(runsBase(applicationId, conversationId), { method: 'POST', body: JSON.stringify(payload) })

export const getRun = (applicationId: string, conversationId: string, runId: string) =>
  request<RunView>(`${runsBase(applicationId, conversationId)}/${runId}`)
export const getLatestRun = (applicationId: string, conversationId: string) =>
  request<RunView | null>(`${runsBase(applicationId, conversationId)}/latest`)

export const cancelRun = (applicationId: string, conversationId: string, runId: string) =>
  request<RunView>(`${runsBase(applicationId, conversationId)}/${runId}/cancel`, { method: 'POST' })

export interface StreamHandlers {
  signal?: AbortSignal
  /** 首次快照或后续增量合并后的完整状态，视图无需自行拼接。 */
  onSnapshot?: (run: RunView) => void
  /** 终态快照，之后服务端关闭连接。 */
  onDone?: (run: RunView) => void
}

interface TextPatch { offset: number; text: string }
interface RunDelta {
  sequence: number
  state: RunView
  content: TextPatch | null
  steps: { state: RunStep; content: TextPatch | null }[]
  removed: string[]
}
interface StreamState { run: RunView | null; sequence: number }
function applyText(before: string, patch: TextPatch | null): string {
  if (!patch) return before
  if (!Number.isInteger(patch.offset) || patch.offset < 0 || patch.offset > before.length) {
    throw new ApiError('流式内容不同步，请刷新会话', 'STREAM_OUT_OF_SYNC', 0)
  }
  return before.slice(0, patch.offset) + patch.text
}
function dispatchEvent(raw: string, handlers: StreamHandlers, stream: StreamState): void {
  let name = 'message'
  const data: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }
  if (data.length === 0) return
  let payload: unknown
  try {
    payload = JSON.parse(data.join('\n'))
  } catch {
    return
  }
  if (name === 'snapshot') {
    stream.run = payload as RunView
    stream.sequence = 0
    handlers.onSnapshot?.(stream.run)
  } else if (name === 'delta') {
    const delta = payload as RunDelta
    if (!stream.run || delta.state.id !== stream.run.id || delta.sequence !== stream.sequence + 1) {
      throw new ApiError('流式事件不同步，请刷新会话', 'STREAM_OUT_OF_SYNC', 0)
    }
    const removed = new Set(delta.removed)
    const steps = new Map(stream.run.steps.filter(step => !removed.has(step.id)).map(step => [step.id, step]))
    for (const change of delta.steps) {
      const before = steps.get(change.state.id)
      steps.set(change.state.id, { ...change.state, content: applyText(before?.content ?? '', change.content) })
    }
    stream.run = { ...delta.state, content: applyText(stream.run.content, delta.content), steps: [...steps.values()] }
    stream.sequence = delta.sequence
    handlers.onSnapshot?.(stream.run)
  } else if (name === 'done') {
    // 兼容旧后端的终态快照，新协议仅发送结束标记。
    const legacy = payload as Partial<RunView>
    if (legacy.status) stream.run = payload as RunView
    if (stream.run) handlers.onDone?.(stream.run)
  }
}

/**
 * 订阅任务事件流。原生 EventSource 无法附加 Authorization，因此用 fetch 手工解析 SSE。
 * 该接口不使用统一响应外壳，出错时按 ApiResponse 解析错误体。
 */
export async function streamRun(
  applicationId: string,
  conversationId: string,
  runId: string,
  handlers: StreamHandlers,
): Promise<void> {
  const headers = new Headers({ Accept: 'text/event-stream' })
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`/api${runsBase(applicationId, conversationId)}/${runId}/events`, {
    headers,
    signal: handlers.signal,
  })
  if (!response.ok) {
    let body: ApiResponse<unknown> | null = null
    try {
      body = (await response.json()) as ApiResponse<unknown>
    } catch {
      body = null
    }
    throw await rejectResponse(response, token, body)
  }
  if (!response.body) throw new ApiError('无法读取事件流', 'STREAM_UNAVAILABLE', response.status)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const separator = /\r?\n\r?\n/
  let buffer = ''
  const stream: StreamState = { run: null, sequence: 0 }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) buffer += decoder.decode(value, { stream: true })
      let match = separator.exec(buffer)
      while (match) {
        const chunk = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        if (chunk.trim()) {
          dispatchEvent(chunk, handlers, stream)
          // 一个网络分片可能含多条 SSE，让 Vue 有机会提交 DOM 并绘制，避免整批只显示最后状态。
          if (stream.run && !document.hidden) await new Promise<void>(resolve => {
            const fallback = window.setTimeout(resolve, 50)
            window.requestAnimationFrame(() => {
              window.clearTimeout(fallback)
              window.setTimeout(resolve, 0)
            })
          })
          if (handlers.signal?.aborted) return
        }
        match = separator.exec(buffer)
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined)
  }
}
