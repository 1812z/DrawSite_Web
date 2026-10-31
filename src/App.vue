<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import Toaster from '@/components/ui/sonner.vue'
import { useWorkspaceStore } from '@/stores/workspace'

const route = useRoute()
const workspace = useWorkspaceStore()

/**
 * 同一个路由组件在不同参数间跳转时会被复用（Vue Router 默认行为），
 * 应用详情页的数据都在 setup 里按 id 取一次，复用会拿着旧应用的状态显示新路径。
 * 按「路由名 + id」做 key，切换应用时重建组件；会话切换只改 query，不触发重建。
 */
const viewKey = computed(() => `${String(route.name ?? '')}:${String(route.params.id ?? '')}`)

/**
 * 标题规则：打开会话时显示会话标题，其它页面一律「绘站」。
 * 标题以侧栏会话列表（workspace store）为准，直接粘链接进来时会话列表加载完成后会自动补上；
 * 重命名会话也会同步刷新。
 */
const conversationTitle = computed(() => {
  if (route.name !== 'application-detail') return ''
  const applicationId = String(route.params.id ?? '')
  const conversationId = typeof route.query.conversation === 'string' ? route.query.conversation : ''
  if (!applicationId || !conversationId) return ''
  return workspace.conversationsByApplication[applicationId]?.find(item => item.id === conversationId)?.title?.trim() ?? ''
})
watchEffect(() => { document.title = conversationTitle.value || '绘站' })
</script>

<template>
  <component :is="route.meta.public ? 'div' : AppLayout">
    <RouterView :key="viewKey" />
  </component>
  <Toaster />
</template>
