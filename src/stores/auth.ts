import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import type { User } from '@/api/auth'
import { clearSession, getStoredUser, getToken, saveSession, saveUser } from '@/lib/session'
import { UNAUTHORIZED_EVENT } from '@/lib/http'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getToken())
  const user = ref<User | null>(getStoredUser())
  const loading = ref(false)

  const isAuthenticated = computed(() => Boolean(token.value))
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  async function login(username: string, password: string): Promise<User> {
    loading.value = true
    try {
      const response = await authApi.login(username, password)
      token.value = response.token
      user.value = response.user
      saveSession(response.token, response.user)
      return response.user
    } finally {
      loading.value = false
    }
  }

  async function register(payload: authApi.RegisterRequest): Promise<void> {
    loading.value = true
    try {
      await authApi.register(payload)
    } finally {
      loading.value = false
    }
  }

  /** 恢复会话后刷新当前用户；Token 失效由 request 的 401 逻辑兜底。 */
  async function ensureUser(): Promise<void> {
    if (!token.value || user.value) return
    try {
      user.value = await authApi.getMe()
      saveUser(user.value)
    } catch {
      clear()
    }
  }

  function clear(): void {
    token.value = ''
    user.value = null
    clearSession()
  }

  /** 资料编辑成功后更新本地用户信息。 */
  function setUser(next: User): void {
    user.value = next
    saveUser(next)
  }

  async function logout(): Promise<void> {
    try {
      if (token.value) await authApi.logout()
    } catch {
      // 服务端失效或网络异常时仍清理本地会话
    } finally {
      clear()
    }
  }

  window.addEventListener(UNAUTHORIZED_EVENT, clear)

  return { token, user, loading, isAuthenticated, isAdmin, login, register, ensureUser, setUser, logout, clear }
})
