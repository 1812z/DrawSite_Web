import { onActivated, onMounted, watch } from 'vue'

/**
 * 侧边栏标签的「缓存 + 按需校验」策略：标签被 KeepAlive 缓存后不再每次重挂，
 * 但重新进入时必须判断数据是否还新鲜，命中以下任一条件就重新拉一次：
 *
 * 1. 从没加载成功过；
 * 2. `revision` 变了（详情页里等于消息条数，AI 动过东西就一定变）；
 * 3. `running` 由 true 变 false（一轮任务刚结束，产物已改写）；
 * 4. 距上次加载超过 `ttl`（默认 60s），兜住后端/他人改动这类没有信号的变化。
 *
 * 首次挂载时 Vue 会在 mounted 之后紧接一次 activated，这里靠加载时间戳挡掉，不会重复请求。
 */
export interface TabRefreshOptions {
  /** 数据变更信号，变了就重新拉 */
  revision?: () => number | string
  /** 任务运行态，true → false 时重新拉 */
  running?: () => boolean
  /** 距上次加载超过该时长后，重新进入标签时静默刷新（毫秒） */
  ttl?: number
  /** 首次挂载是否立即加载，默认 true */
  immediate?: boolean
}

export function useTabRefresh(load: () => unknown, options: TabRefreshOptions = {}) {
  const ttl = options.ttl ?? 60_000
  let loadedAt = 0
  let loadedRevision = options.revision?.()

  function refresh() {
    // 先记时间再 await：首次激活紧跟在 mounted 之后，靠它判断「刚加载过」
    loadedAt = Date.now()
    loadedRevision = options.revision?.()
    return load()
  }

  function stale(): boolean {
    if (!loadedAt) return true
    if (options.revision && options.revision() !== loadedRevision) return true
    return Date.now() - loadedAt > ttl
  }

  if (options.immediate !== false) onMounted(() => { void refresh() })

  // 只对 KeepAlive 缓存的实例生效；普通重挂的组件由 mounted 负责
  onActivated(() => {
    if (stale()) void refresh()
  })

  if (options.running) {
    watch(options.running, (running, wasRunning) => {
      if (wasRunning && !running) void refresh()
    })
  }

  return { refresh }
}
