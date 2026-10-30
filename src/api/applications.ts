import { request } from '@/lib/http'

export interface PageResult<T> {
  records: T[]
  total: number
  page: number
  size: number
}

export type ApplicationStatus = 'INITIALIZING' | 'READY' | 'FAILED'

export interface Application {
  id: string
  name: string
  description: string
  status: ApplicationStatus
  currentCommit: string
  createdAt: string
  updatedAt: string
}

export interface ApplicationRequest {
  name: string
  description: string
}

export interface Revision {
  id: string
  applicationId: string
  commitHash: string
  summary: string
  createdAt: string
}

export interface DocumentView {
  path: string
  content: string
}

export interface ProgressNode {
  id: string
  title: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  acceptanceCriteria: string[]
  notes: string
}
export interface ProgressSummary {
  schemaVersion: string
  features: ProgressNode[]
  completed: number
  inProgress: number
  pending: number
  total: number
  completion: string
  percent: number
}
export const getProgress = (id: string) => request<ProgressSummary>(`/applications/${id}/progress`)

export interface GitState {
  head: string
  branch: string
  changed: string[]
  clean: boolean
}
export interface GitCommit {
  hash: string
  parents: string[]
  message: string
  author: string
  createdAt: string
  head: boolean
}
export interface GitHistory {
  head: string
  branch: string
  commits: GitCommit[]
  truncated: boolean
}
export const getGitTree = (id: string, limit = 100) => request<GitHistory>(`/applications/${id}/git/tree?limit=${limit}`)
export const getGitStatus = (id: string) => request<GitState>(`/applications/${id}/git/status`)
export const commitGit = (id: string, message: string, expectedHead: string, files: string[]) => request<GitState>(`/applications/${id}/git/commits`, {
  method: 'POST', body: JSON.stringify({ message, expectedHead, files }),
})
export const rollbackGit = (id: string, target: string, expectedHead: string) => request<GitState>(`/applications/${id}/git/rollback`, {
  method: 'POST', body: JSON.stringify({ target, expectedHead }), signal: AbortSignal.timeout(120_000),
})

export const listApplications = (page = 1, size = 20) =>
  request<PageResult<Application>>(`/applications?page=${page}&size=${size}`)

/**
 * 创建应用。后端是同步初始化（建目录、写项目文档、git 首次提交后才返回 READY），
 * 因此耗时明显长于普通请求，单独放宽超时（默认 15 秒不够）。
 */
export const createApplication = (payload: ApplicationRequest) =>
  request<Application>('/applications', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  })

export const getApplication = (id: string) => request<Application>(`/applications/${id}`)

export const updateApplication = (id: string, payload: ApplicationRequest) =>
  request<Application>(`/applications/${id}`, { method: 'PUT', body: JSON.stringify(payload) })

/**
 * 删除应用。后端会清理工作区目录（含 .git）、会话消息、对话任务与版本记录，并自动停止该应用全部回复，
 * 前端不需要先取消。初始化中返回 409 APPLICATION_BUSY；目录清理失败返回 500 WORKSPACE_DELETE_FAILED
 * 且保留数据库记录，可重试。
 *
 * 目录里可能有依赖与产物，删干净耗时明显长于普通请求，所以单独放宽超时（默认 15 秒）。
 */
export const deleteApplication = (id: string) =>
  request<null>(`/applications/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(120_000) })

export const listRevisions = (id: string, page = 1, size = 20) =>
  request<PageResult<Revision>>(`/applications/${id}/revisions?page=${page}&size=${size}`)

export const getDocument = (id: string, path: string) =>
  request<DocumentView>(`/applications/${id}/documents?path=${encodeURIComponent(path)}`)
