import { ApiError, rejectResponse } from '@/lib/http'
import { getToken } from '@/lib/session'

export interface ContextView { usedTokens: number; budgetTokens: number; estimated: boolean; compressing: boolean; hasSummary: boolean; compressionText: string }
export async function compressContext(base: string, modelId: string, memoryEnabled: boolean, update: (value: ContextView) => void): Promise<ContextView> {
  const token = getToken()
  const response = await fetch(`/api${base}/compress/events`, {
    method: 'POST', headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ modelId, memoryEnabled }), signal: AbortSignal.timeout(660000),
  })
  if (!response.ok) throw await rejectResponse(response, token, await response.json().catch(() => null))
  if (!response.body) throw new ApiError('无法读取压缩事件流', 'STREAM_UNAVAILABLE', response.status)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: ContextView | null = null
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let match = /\r?\n\r?\n/.exec(buffer)
      while (match) {
        const event = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        const name = event.split(/\r?\n/).find(line => line.startsWith('event:'))?.slice(6).trim()
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (data) {
          const value = JSON.parse(data)
          if (name === 'failed') throw new Error(value.message || '压缩失败')
          update(value as ContextView)
          if (name === 'done') result = value as ContextView
        }
        match = /\r?\n\r?\n/.exec(buffer)
      }
    }
    if (!result) throw new Error('压缩连接已断开，请刷新消息确认结果')
    return result
  } finally { void reader.cancel().catch(() => undefined) }
}
