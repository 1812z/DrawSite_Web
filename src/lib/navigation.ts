/**
 * 登录跳转桥：http 层收到 401 时要跳登录页，但不能直接依赖 router。
 *
 * - 静态 `import { router } from '@/router'` 会形成环：
 *   `lib/http` → `router` → `stores/auth` → `api/auth` → `lib/http`；
 * - 动态 `await import('@/router')` 又会触发构建告警
 *   `[INEFFECTIVE_DYNAMIC_IMPORT]`：router 已被 main.ts 静态导入，
 *   它无法被拆成独立 chunk，动态 import 只是白写。
 *
 * 所以这里只保留一个可注入的回调，由入口（main.ts）在启动时装配。
 * 本文件不 import 任何业务模块，随便谁引用都不会成环。
 */
type LoginRedirector = () => unknown

let redirector: LoginRedirector | null = null

/** 由入口装配：收到 401 时该做什么（当前实现即 router.replace 到 /login）。 */
export function setLoginRedirector(fn: LoginRedirector): void {
  redirector = fn
}

/** 触发登录跳转。未装配时静默跳过，不会抛错打断请求流程。 */
export function redirectToLogin(): void {
  const fn = redirector
  if (!fn) return
  try {
    void fn()
  } catch {
    // 跳转失败不影响调用方继续抛 ApiError
  }
}
