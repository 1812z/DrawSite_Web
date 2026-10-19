import { request } from '@/lib/http'
import type { User } from '@/api/auth'
import type { PageResult } from '@/api/applications'

export interface ProfileRequest {
  username: string
  displayName: string
}

export interface PasswordRequest {
  oldPassword: string
  newPassword: string
}

export interface AdminUser {
  id: string
  username: string
  displayName: string
  role: 'USER' | 'ADMIN'
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminUpdateRequest {
  username: string
  displayName: string
  role: 'USER' | 'ADMIN'
  enabled: boolean
}

export const updateProfile = (payload: ProfileRequest) =>
  request<User>('/users/me', { method: 'PUT', body: JSON.stringify(payload) })

export const changePassword = (payload: PasswordRequest) =>
  request<null>('/users/me/password', { method: 'PUT', body: JSON.stringify(payload) })

export const listUsers = (page = 1, size = 20) => request<PageResult<AdminUser>>(`/admin/users?page=${page}&size=${size}`)

export const getUser = (id: string) => request<AdminUser>(`/admin/users/${id}`)

export const updateUser = (id: string, payload: AdminUpdateRequest) =>
  request<AdminUser>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) })

export const resetUserPassword = (id: string, newPassword: string) =>
  request<null>(`/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ newPassword }) })
