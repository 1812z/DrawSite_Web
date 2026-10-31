<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight, KeyRound, LoaderCircle, Pencil, UserRound } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import RefreshButton from '@/components/RefreshButton.vue'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '@/stores/auth'
import * as usersApi from '@/api/users'
import type { AdminUser } from '@/api/users'

const auth = useAuthStore()
const router = useRouter()

const users = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const error = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

// 编辑
const editOpen = ref(false)
const editing = ref<AdminUser | null>(null)
const editForm = reactive({ username: '', displayName: '', role: 'USER' as 'USER' | 'ADMIN', enabled: true })
const editSaving = ref(false)
const editError = ref('')

const ROLE_OPTIONS = [
  { value: 'USER', label: '用户' },
  { value: 'ADMIN', label: '管理员' },
]
/** Select 的 v-model 是 string，这里转回联合类型，避免下拉写入越界值。 */
const roleValue = computed({
  get: () => editForm.role,
  set: (value: string) => {
    editForm.role = value as 'USER' | 'ADMIN'
  },
})

// 重置密码
const resetOpen = ref(false)
const resetTarget = ref<AdminUser | null>(null)
const resetPassword = ref('')
const resetSaving = ref(false)
const resetError = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await usersApi.listUsers(page.value, pageSize)
    users.value = result.records
    total.value = result.total
  } catch (cause) {
    users.value = []
    error.value = cause instanceof Error ? cause.message : '加载用户失败'
  } finally {
    loading.value = false
  }
}

function openEdit(user: AdminUser) {
  editing.value = user
  Object.assign(editForm, { username: user.username, displayName: user.displayName, role: user.role, enabled: user.enabled })
  editError.value = ''
  editOpen.value = true
}

async function saveEdit() {
  if (!editing.value || editSaving.value) return
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(editForm.username) || !editForm.displayName.trim()) {
    editError.value = '用户名需为 3–32 位字母/数字/下划线，显示名称不能为空'
    return
  }
  editSaving.value = true
  editError.value = ''
  try {
    const updated = await usersApi.updateUser(editing.value.id, {
      username: editForm.username,
      displayName: editForm.displayName.trim(),
      role: editForm.role,
      enabled: editForm.enabled,
    })
    const index = users.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) users.value[index] = updated
    editOpen.value = false
    toast.success('用户信息已保存。')
    // 编辑自己且角色/启用状态变化时，后端会注销自身会话
    if (auth.user && updated.id === auth.user.id && (updated.role !== auth.user.role || !updated.enabled)) {
      auth.clear()
      await router.replace({ path: '/login', query: { notice: '你的角色或启用状态已变更，请重新登录。' } })
    }
  } catch (cause) {
    editError.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    editSaving.value = false
  }
}

function openReset(user: AdminUser) {
  resetTarget.value = user
  resetPassword.value = ''
  resetError.value = ''
  resetOpen.value = true
}

async function saveReset() {
  if (!resetTarget.value || resetSaving.value) return
  if (resetPassword.value.length < 8) {
    resetError.value = '新密码至少 8 个字符'
    return
  }
  resetSaving.value = true
  resetError.value = ''
  try {
    await usersApi.resetUserPassword(resetTarget.value.id, resetPassword.value)
    resetOpen.value = false
    toast.success('密码已重置。')
  } catch (cause) {
    resetError.value = cause instanceof Error ? cause.message : '重置失败'
  } finally {
    resetSaving.value = false
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

onMounted(load)
</script>

<template>
  <section class="mx-auto w-full max-w-4xl px-6 py-10">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-medium tracking-tight">用户管理</h1>
        <p class="mt-3 text-sm text-muted-foreground">查看与编辑平台用户，调整角色、启用状态或重置密码。</p>
      </div>
      <RefreshButton variant="outline" class="size-8" :loading="loading" label="刷新用户" @click="load" />
    </div>

    <div v-if="loading && users.length === 0" class="mt-10 flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><LoaderCircle class="animate-spin" />正在加载用户…</div>
    <div v-else-if="error && users.length === 0" class="mt-10 rounded-xl border p-8 text-center">
      <p class="text-sm text-red-600">{{ error }}</p>
      <RefreshButton variant="outline" class="mt-4 size-8" label="重新加载用户" @click="load" />
    </div>
    <template v-else>
      <div class="mt-8 overflow-x-auto rounded-xl border">
        <table class="w-full min-w-[640px] text-sm">
          <thead>
            <tr class="border-b bg-[#f8f8f8] text-left text-xs text-muted-foreground">
              <th class="px-4 py-3 font-medium">用户</th>
              <th class="px-4 py-3 font-medium">角色</th>
              <th class="px-4 py-3 font-medium">状态</th>
              <th class="px-4 py-3 font-medium">创建时间</th>
              <th class="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-b last:border-0 hover:bg-muted">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2.5">
                  <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#ececec]"><UserRound class="size-3.5 text-neutral-500" /></div>
                  <div class="min-w-0">
                    <p class="truncate font-medium">{{ user.displayName }}<span v-if="auth.user?.id === user.id" class="ml-1.5 text-xs text-neutral-400">（我）</span></p>
                    <p class="mt-0.5 truncate font-mono text-xs text-neutral-400">@{{ user.username }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3"><Badge :class="user.role === 'ADMIN' ? 'border-neutral-800 text-neutral-800' : 'border-neutral-300 text-neutral-500'">{{ user.role === 'ADMIN' ? '管理员' : '用户' }}</Badge></td>
              <td class="px-4 py-3"><Badge :class="user.enabled ? 'border-neutral-800 text-neutral-800' : 'border-red-300 text-red-600'">{{ user.enabled ? '启用' : '禁用' }}</Badge></td>
              <td class="px-4 py-3 text-xs text-muted-foreground">{{ formatTime(user.createdAt) }}</td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label="编辑用户" @click="openEdit(user)"><Pencil /></Button>
                  <Button variant="ghost" size="icon" aria-label="重置密码" @click="openReset(user)"><KeyRound /></Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="totalPages > 1" class="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>共 {{ total }} 个用户 · 第 {{ page }} / {{ totalPages }} 页</span>
        <div class="flex items-center gap-1">
          <Button variant="outline" size="sm" :disabled="page <= 1" @click="page -= 1; load()"><ChevronLeft />上一页</Button>
          <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page += 1; load()">下一页<ChevronRight /></Button>
        </div>
      </div>

      <!-- 编辑用户对话框 -->
      <Dialog :open="editOpen" title="编辑用户" @update:open="editOpen = $event">
        <form class="space-y-4" @submit.prevent="saveEdit">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label for="user-username" class="text-xs text-muted-foreground">用户名</label>
              <Input id="user-username" v-model="editForm.username" maxlength="32" placeholder="3–32 位字母、数字或下划线" />
            </div>
            <div class="space-y-1.5">
              <label for="user-displayName" class="text-xs text-muted-foreground">显示名称</label>
              <Input id="user-displayName" v-model="editForm.displayName" maxlength="64" placeholder="不超过 64 字符" />
            </div>
            <div class="space-y-1.5">
              <label for="user-role" class="text-xs text-muted-foreground">角色</label>
              <Select id="user-role" v-model="roleValue" :items="ROLE_OPTIONS" />
            </div>
            <div class="space-y-1.5">
              <label class="flex h-10 items-center gap-2 text-sm"><Switch v-model="editForm.enabled" />启用账号</label>
            </div>
          </div>
          <p v-if="editing && auth.user?.id === editing.id" class="text-xs leading-5 text-neutral-400">调整自己的角色或启用状态后，当前会话将失效，需要重新登录。</p>
          <p v-if="editError" role="alert" class="text-xs text-red-600">{{ editError }}</p>
          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" @click="editOpen = false">取消</Button>
            <Button type="submit" :disabled="editSaving"><LoaderCircle v-if="editSaving" class="animate-spin" />保存</Button>
          </div>
        </form>
      </Dialog>

      <!-- 重置密码对话框 -->
      <Dialog :open="resetOpen" :title="`重置密码 · ${resetTarget?.displayName ?? ''}`" @update:open="resetOpen = $event">
        <form class="space-y-4" @submit.prevent="saveReset">
          <div class="space-y-1.5">
            <label for="reset-password" class="text-xs text-muted-foreground">新密码</label>
            <Input id="reset-password" v-model="resetPassword" type="password" autocomplete="new-password" placeholder="至少 8 个字符" />
            <p class="text-xs leading-5 text-neutral-400">重置后该用户的所有会话将失效，需要重新登录。</p>
          </div>
          <p v-if="resetError" role="alert" class="text-xs text-red-600">{{ resetError }}</p>
          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" @click="resetOpen = false">取消</Button>
            <Button type="submit" :disabled="resetSaving || resetPassword.length < 8"><LoaderCircle v-if="resetSaving" class="animate-spin" />重置密码</Button>
          </div>
        </form>
      </Dialog>
    </template>
  </section>
</template>
