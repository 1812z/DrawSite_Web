import { clearSession, getToken } from '@/lib/session'
import { redirectToLogin } from '@/lib/navigation'

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

/** 统一失败处理：401 且请求携带过 Token 时清理会话并跳转登录页。 */
export async function rejectResponse<T>(response: Response, token: string, body: ApiResponse<T> | null): Promise<ApiError> {
  const code = body?.code ?? 'NETWORK_ERROR'
  // 网关/代理等返回非 JSON（如后端未启动的 502）时给出可读错误
  const message = body?.message || `请求失败（HTTP ${response.status}）`
  if (response.status === 401 && token) {
    clearSession()
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    // 具体跳转动作由 main.ts 注入，这里不 import router（否则成环或触发无效动态导入）
    redirectToLogin()
  }
  return new ApiError(message, code, response.status)
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
  let body: ApiResponse<T> | null = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok || !body || body.code !== 'OK') {
    throw await rejectResponse(response, token, body)
  }
  return body.data
}
