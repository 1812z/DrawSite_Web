import { request } from '@/lib/http'
import type { PageResult } from '@/api/applications'

export interface Conversation {
  id: string
  applicationId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  steps?: import('@/api/agent').RunStep[]
  id: string
  conversationId: string
  role: 'USER' | 'ASSISTANT'
  content: string
  createdAt: string
}

export const listConversations = (applicationId: string, page = 1, size = 20) =>
  request<PageResult<Conversation>>(`/applications/${applicationId}/conversations?page=${page}&size=${size}`)

export const createConversation = (applicationId: string, title: string) =>
  request<Conversation>(`/applications/${applicationId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  })

export const renameConversation = (applicationId: string, id: string, title: string) =>
  request<Conversation>(`/applications/${applicationId}/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  })

/**
 * 删除会话。后端会清除全部消息与对话任务并自动停止回复，前端不需要先调用 cancel；
 * 不影响应用源码、版本或应用/用户记忆。再次删除返回 404 CONVERSATION_NOT_FOUND。
 */
export const deleteConversation = (applicationId: string, id: string) =>
  request<null>(`/applications/${applicationId}/conversations/${id}`, { method: 'DELETE' })

export const listMessages = (applicationId: string, conversationId: string, page = 1, size = 50) =>
  request<PageResult<Message>>(`/applications/${applicationId}/conversations/${conversationId}/messages?page=${page}&size=${size}`)

export const addMessage = (applicationId: string, conversationId: string, content: string) =>
  request<Message>(`/applications/${applicationId}/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
