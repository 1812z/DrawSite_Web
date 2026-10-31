import { ref } from 'vue'
import type { ProjectTool } from '@/api/agent'

/**
 * 工具目录的模块级缓存。
 *
 * 工具是平台级能力，和「哪个应用、哪个会话」无关，所以没必要跟着输入框组件一起重建。
 * 放在模块作用域后，即使组件被卸载重建（切应用、父级重新挂载），
 * 目录直接复用、请求不会再来一次，用户勾选的模块也不会被重置。
 *
 * 只在从未成功拉到过时才请求；失败会留下 toolsError，下次挂载自动重试。
 */
const toolCatalog = ref<ProjectTool[]>([])
const toolsLoading = ref(false)
const toolsError = ref('')
const selectedToolIds = ref<string[]>([])

export function useToolCache() {
  return { toolCatalog, toolsLoading, toolsError, selectedToolIds }
}
