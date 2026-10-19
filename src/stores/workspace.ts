import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import * as applicationsApi from '@/api/applications'
import * as conversationsApi from '@/api/conversations'
import type { Application } from '@/api/applications'
import type { Conversation } from '@/api/conversations'

const NEW_CONVERSATION_TITLE = '新建会话'

export const useWorkspaceStore = defineStore('workspace', () => {
  const applications = ref<Application[]>([])
  const loading = ref(false)
  const error = ref('')
  const expandedIds = reactive(new Set<string>())
  const conversationsByApplication = reactive<Record<string, Conversation[]>>({})
  const conversationsLoading = reactive<Record<string, boolean>>({})

  async function refreshApplications(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const result = await applicationsApi.listApplications(1, 20)
      applications.value = result.records
      if (expandedIds.size === 0 && result.records.length > 0) {
        expandedIds.add(result.records[0].id)
        void loadConversations(result.records[0].id)
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载最近应用失败'
    } finally {
      loading.value = false
    }
  }

  function isExpanded(id: string): boolean {
    return expandedIds.has(id)
  }

  function toggle(id: string): void {
    if (expandedIds.has(id)) {
      expandedIds.delete(id)
    } else {
      expandedIds.add(id)
      void loadConversations(id)
    }
  }

  async function loadConversations(applicationId: string): Promise<void> {
    if (conversationsByApplication[applicationId]) return
    conversationsLoading[applicationId] = true
    try {
      const result = await conversationsApi.listConversations(applicationId, 1, 50)
      conversationsByApplication[applicationId] = result.records
    } catch {
      conversationsByApplication[applicationId] = []
    } finally {
      conversationsLoading[applicationId] = false
    }
  }

  /** 强制重新拉取会话列表：首轮回复后服务端会生成会话标题，需要刷新侧栏。 */
  async function refreshConversations(applicationId: string): Promise<void> {
    conversationsLoading[applicationId] = true
    try {
      const result = await conversationsApi.listConversations(applicationId, 1, 50)
      conversationsByApplication[applicationId] = result.records
    } catch {
      // 刷新失败保留原列表，不打断当前会话
    } finally {
      conversationsLoading[applicationId] = false
    }
  }

  /** 新建会话固定使用“新建会话”标题，不需要用户输入。 */
  async function createConversation(applicationId: string): Promise<Conversation> {
    const created = await conversationsApi.createConversation(applicationId, NEW_CONVERSATION_TITLE)
    if (!conversationsByApplication[applicationId]) conversationsByApplication[applicationId] = []
    conversationsByApplication[applicationId].unshift(created)
    expandedIds.add(applicationId)
    return created
  }

  async function renameConversation(applicationId: string, id: string, title: string): Promise<Conversation> {
    const updated = await conversationsApi.renameConversation(applicationId, id, title)
    const list = conversationsByApplication[applicationId]
    if (list) {
      const index = list.findIndex((item) => item.id === updated.id)
      if (index >= 0) list[index] = updated
    }
    return updated
  }

  /** 删除会话。后端已自动停止该会话回复并清理任务，这里只同步侧栏列表。 */
  async function deleteConversation(applicationId: string, id: string): Promise<void> {
    await conversationsApi.deleteConversation(applicationId, id)
    const list = conversationsByApplication[applicationId]
    if (list) {
      const index = list.findIndex((item) => item.id === id)
      if (index >= 0) list.splice(index, 1)
    }
  }

  /** 删除应用。后端会连带清理工作区目录、会话消息、对话任务与版本记录。 */
  async function deleteApplication(id: string): Promise<void> {
    await applicationsApi.deleteApplication(id)
    const index = applications.value.findIndex((item) => item.id === id)
    if (index >= 0) applications.value.splice(index, 1)
    delete conversationsByApplication[id]
    delete conversationsLoading[id]
    expandedIds.delete(id)
  }

  function reset(): void {
    applications.value = []
    error.value = ''
    expandedIds.clear()
    for (const key of Object.keys(conversationsByApplication)) delete conversationsByApplication[key]
    for (const key of Object.keys(conversationsLoading)) delete conversationsLoading[key]
  }

  return {
    applications,
    loading,
    error,
    expandedIds,
    conversationsByApplication,
    conversationsLoading,
    refreshApplications,
    isExpanded,
    toggle,
    loadConversations,
    refreshConversations,
    createConversation,
    renameConversation,
    deleteConversation,
    deleteApplication,
    reset,
  }
})
