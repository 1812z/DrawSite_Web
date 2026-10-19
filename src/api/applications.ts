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

export const listApplications = (page = 1, size = 20) =>
  request<PageResult<Application>>(`/applications?page=${page}&size=${size}`)

export const createApplication = (payload: ApplicationRequest) =>
  request<Application>('/applications', { method: 'POST', body: JSON.stringify(payload) })

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
