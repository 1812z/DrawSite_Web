import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getHealth, type HealthStatus } from '@/api/system'

export const useSystemStore = defineStore('system', () => {
  const health = ref<HealthStatus | null>(null)
  const loading = ref(false)
  const error = ref('')
  const label = computed(() => loading.value ? '连接中' : health.value?.status === 'UP' ? '已连接' : '已断开')

  async function checkHealth() {
    if (loading.value) return
    loading.value = true
    error.value = ''
    try {
      health.value = await getHealth()
    } catch (cause) {
      health.value = null
      error.value = cause instanceof Error ? cause.message : '无法连接后端服务'
    } finally {
      loading.value = false
    }
  }

  return { health, loading, error, label, checkHealth }
})
