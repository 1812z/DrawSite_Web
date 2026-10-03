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

export const listRevisions = (id: string, page = 1, size = 20) =>
  request<PageResult<Revision>>(`/applications/${id}/revisions?page=${page}&size=${size}`)

export const getDocument = (id: string, path: string) =>
  request<DocumentView>(`/applications/${id}/documents?path=${encodeURIComponent(path)}`)
