import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createPinia } from 'pinia'
import { router } from './router'
import { setLoginRedirector } from './lib/navigation'

/**
 * 401 处理：清完会话后由 http 层回调到这里跳登录页。
 * 只在这一处持有 router 实例，http 层因此不需要 import router。
 */
setLoginRedirector(() => {
  const current = router.currentRoute.value
  if (current.path === '/login') return
  void router.replace({ path: '/login', query: current.path === '/' ? {} : { redirect: current.fullPath } })
})

createApp(App).use(createPinia()).use(router).mount('#app')
