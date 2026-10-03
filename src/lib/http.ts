import { clearSession, getToken } from '@/lib/session'

export interface ApiResponse<T> {
  code: string
  message: string
  data: T
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** 401 且请求携带过 Token 时触发，通知认证状态清理并跳转登录页。 */
export const UNAUTHORIZED_EVENT = 'drawsite:unauthorized'

async function redirectToLogin(): Promise<void> {
  const { router } = await import('@/router')
  const current = router.currentRoute.value
  if (current.path === '/login') return
  void router.replace({ path: '/login', query: current.path === '/' ? {} : { redirect: current.fullPath } })
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body && typeof options.body === 'string') headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(15_000),
  })
  let body: ApiResponse<T>
  try {
    body = await response.json()
  } catch {
    // 网关/代理等返回非 JSON（如后端未启动的 502）时给出可读错误
    body = { code: 'NETWORK_ERROR', message: `请求失败（HTTP ${response.status}）`, data: null as T }
  }
  if (!response.ok || body.code !== 'OK') {
    if (response.status === 401 && token) {
      clearSession()
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
      await redirectToLogin()
    }
    throw new ApiError(body.message || '请求失败', body.code, response.status)
  }
  return body.data
}
