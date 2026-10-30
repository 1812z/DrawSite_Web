/**
 * 首页「创建应用」后把需求接力给应用工作区。
 *
 * 为什么不走路由 query：需求最长 20000 字符，URL 装不下也不该出现在历史记录里。
 * sessionStorage 只在当前浏览器会话内有效，页面刷新后仍可用；离开即丢弃。
 */
export interface PendingPrompt {
  applicationId: string
  conversationId: string
  content: string
}

const KEY = 'drawsite:pending-prompt'

export function savePendingPrompt(value: PendingPrompt): void {
  sessionStorage.setItem(KEY, JSON.stringify(value))
}

/**
 * 取出并清除与当前会话匹配的待发送需求。
 * 不匹配时保留原值 —— 用户可能同时开了多个标签页，不能把别的会话的需求吞掉。
 */
export function takePendingPrompt(applicationId: string, conversationId: string): string {
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return ''
  try {
    const value = JSON.parse(raw) as Partial<PendingPrompt>
    if (value.applicationId !== applicationId || value.conversationId !== conversationId) return ''
    sessionStorage.removeItem(KEY)
    return typeof value.content === 'string' ? value.content.trim() : ''
  } catch {
    sessionStorage.removeItem(KEY)
    return ''
  }
}
