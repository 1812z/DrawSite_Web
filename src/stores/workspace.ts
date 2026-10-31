import { computed, reactive, ref } from 'vue'
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
  const applicationsTotal = ref(0)
  const applicationsPage = ref(0)
  const hasMoreApplications = computed(() => applications.value.length < applicationsTotal.value)
  const conversationsTotal = reactive<Record<string, number>>({})
  const conversationsPage = reactive<Record<string, number>>({})
  const conversationsError = reactive<Record<string, string>>({})
  let generation = 0
  let appRequest = 0
  const conversationRequests: Record<string, number> = {}
  function merge<T extends { id: string }>(items: T[]): T[] { return [...new Map(items.map(item => [item.id, item])).values()] }
  function hasMoreConversations(id: string) { return (conversationsByApplication[id]?.length ?? 0) < (conversationsTotal[id] ?? 0) }

  async function refreshApplications(append = false): Promise<void> {
    if (append && (loading.value || !hasMoreApplications.value)) return
    const request = ++appRequest
    const epoch = generation
    const pages = append ? applicationsPage.value + 1 : Math.max(1, applicationsPage.value)
    loading.value = true
    error.value = ''
    try {
      const results = []
      for (let p = append ? pages : 1; p <= pages; p++) {
        const result = await applicationsApi.listApplications(p, 20)
        if (epoch !== generation || request !== appRequest) return
        results.push(result)
        if (p * 20 >= result.total) break
      }
      const result = results[results.length - 1]!
      applications.value = merge([...(append ? applications.value : []), ...results.flatMap(item => item.records)])
      applicationsTotal.value = result.total
      applicationsPage.value = append ? pages : results.length
      if (expandedIds.size === 0 && result.records.length > 0) {
        expandedIds.add(result.records[0].id)
        void loadConversations(result.records[0].id)
      }
    } catch (cause) {
      if (epoch === generation && request === appRequest) error.value = cause instanceof Error ? cause.message : '加载最近应用失败'
    } finally {
      if (epoch === generation && request === appRequest) loading.value = false
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
    if (conversationsPage[applicationId] || conversationsLoading[applicationId]) return
    await fetchConversations(applicationId, false)
  }

  /** 强制重新拉取会话列表：首轮回复后服务端会生成会话标题，需要刷新侧栏。 */
  async function refreshConversations(applicationId: string): Promise<void> {
    await fetchConversations(applicationId, false)
  }
  async function loadMoreConversations(applicationId: string): Promise<void> {
    if (conversationsLoading[applicationId] || !hasMoreConversations(applicationId)) return
    await fetchConversations(applicationId, true)
  }
  async function fetchConversations(applicationId: string, append: boolean): Promise<void> {
    const epoch = generation
    const request = (conversationRequests[applicationId] ?? 0) + 1
    conversationRequests[applicationId] = request
    const valid = () => epoch === generation && conversationRequests[applicationId] === request
    const pages = append ? (conversationsPage[applicationId] ?? 0) + 1 : Math.max(1, conversationsPage[applicationId] ?? 0)
    conversationsLoading[applicationId] = true
    conversationsError[applicationId] = ''
    try {
      const results = []
      for (let p = append ? pages : 1; p <= pages; p++) {
        const result = await conversationsApi.listConversations(applicationId, p, 20)
        if (!valid()) return
        results.push(result)
        if (p * 20 >= result.total) break
      }
      const result = results[results.length - 1]!
      conversationsByApplication[applicationId] = merge([...(append ? conversationsByApplication[applicationId] ?? [] : []), ...results.flatMap(item => item.records)])
      conversationsTotal[applicationId] = result.total
      conversationsPage[applicationId] = append ? pages : results.length
    } catch (cause) {
      if (valid()) conversationsError[applicationId] = cause instanceof Error ? cause.message : '加载会话失败'
    } finally {
      if (valid()) conversationsLoading[applicationId] = false
    }
  }

  /** 新建会话固定使用“新建会话”标题，不需要用户输入。 */
  async function createConversation(applicationId: string): Promise<Conversation> {
    const created = await conversationsApi.createConversation(applicationId, NEW_CONVERSATION_TITLE)
    await refreshConversations(applicationId)
    if (!conversationsByApplication[applicationId]?.some(item => item.id === created.id)) {
      conversationsByApplication[applicationId] = [created, ...(conversationsByApplication[applicationId] ?? [])]
    }
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
    await refreshConversations(applicationId)
  }

  /** 删除应用。后端会连带清理工作区目录、会话消息、对话任务与版本记录。 */
  async function deleteApplication(id: string): Promise<void> {
    await applicationsApi.deleteApplication(id)
    const index = applications.value.findIndex((item) => item.id === id)
    if (index >= 0) applications.value.splice(index, 1)
    delete conversationsByApplication[id]
    delete conversationsLoading[id]
    expandedIds.delete(id)
    conversationRequests[id] = (conversationRequests[id] ?? 0) + 1
    delete conversationsTotal[id]
    delete conversationsPage[id]
    delete conversationsError[id]
    await refreshApplications()
  }

  function reset(): void {
    generation++
    loading.value = false
    applicationsTotal.value = 0
    applicationsPage.value = 0
    applications.value = []
    error.value = ''
    expandedIds.clear()
    for (const key of Object.keys(conversationsByApplication)) delete conversationsByApplication[key]
    for (const key of Object.keys(conversationsLoading)) delete conversationsLoading[key]
    for (const map of [conversationsTotal, conversationsPage, conversationsError, conversationRequests]) for (const key of Object.keys(map)) delete map[key]
  }

  return {
    applications,
    loading,
    error,
    expandedIds,
    conversationsByApplication,
    conversationsLoading,
    applicationsTotal, hasMoreApplications, hasMoreConversations, conversationsError,
    loadMoreApplications: () => refreshApplications(true), loadMoreConversations,
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
