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
    { path: '/deployments', redirect: '/applications' },
    { path: '/admin/deployments', name: 'admin-deployments', component: () => import('@/views/Admin/AdminDeploymentsView.vue'), meta: { title: '部署管理', admin: true } },
    { path: '/admin/docker', redirect: '/settings?tab=docker' },
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
  if (to.meta.admin && !auth.isAdmin) return { path: '/' }
  return true
})

// 标题不在这里设置：App.vue 里按「是否打开会话」统一处理（会话标题 / 绘站）
