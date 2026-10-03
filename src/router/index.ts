import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录', public: true } },
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '工作台' } },
    { path: '/applications', name: 'applications', component: () => import('@/views/ApplicationsView.vue'), meta: { title: '我的应用' } },
    { path: '/applications/:id', name: 'application-detail', component: () => import('@/views/ApplicationDetailView.vue'), meta: { title: '应用工作区' } },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '设置' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { title: '页面不存在', public: true } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.public) {
    if (to.name === 'login' && auth.isAuthenticated) return { path: '/' }
    return true
  }
  if (!auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  await auth.ensureUser()
  return true
})

router.afterEach((to) => { document.title = `${String(to.meta.title ?? '工作台')} · 绘站` })
