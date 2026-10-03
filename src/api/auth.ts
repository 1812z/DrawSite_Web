import { request } from '@/lib/http'

export interface User {
  id: string
  username: string
  displayName: string
  role: 'USER' | 'ADMIN'
}

export interface LoginResponse {
  token: string
  tokenType: string
  expiresIn: number
  user: User
}

export interface RegisterRequest {
  username: string
  password: string
  displayName: string
}

export const register = (payload: RegisterRequest) =>
  request<User>('/auth/register', { method: 'POST', body: JSON.stringify(payload) })

export const login = (username: string, password: string) =>
  request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })

export const getMe = () => request<User>('/auth/me')

export const logout = () => request<null>('/auth/logout', { method: 'POST' })
