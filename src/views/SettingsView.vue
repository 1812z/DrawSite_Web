<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { KeyRound, LoaderCircle, UserRound } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth'
import * as usersApi from '@/api/users'
import AdminUsersView from '@/views/Admin/AdminUsersView.vue'
import AdminSettingsView from '@/views/Admin/AdminSettingsView.vue'
import MemorySettingsView from '@/views/MemorySettingsView.vue'
import AdminDockerView from '@/views/Admin/AdminDockerView.vue'

const auth = useAuthStore()
const router = useRouter()

type SettingTab = 'profile' | 'memory' | 'users' | 'settings' | 'docker'
const tabs = computed(() => {
  // 记忆管理是用户级设置（/users/me/memory），所有登录用户都有，和平台管理无关
  const list: { key: SettingTab; label: string }[] = [
    { key: 'profile', label: '个人信息' },
    { key: 'memory', label: '记忆管理' },
  ]
  if (auth.isAdmin) {
    list.push({ key: 'users', label: '用户管理' }, { key: 'settings', label: '平台管理' }, { key: 'docker', label: 'Docker 管理' })
  }
  return list
})
const activeTab = ref<SettingTab>(auth.isAdmin && useRoute().query.tab === 'docker' ? 'docker' : 'profile')

// 资料编辑
const profileForm = reactive({
  username: auth.user?.username ?? '',
  displayName: auth.user?.displayName ?? '',
})
const profileSaving = ref(false)
const profileError = ref('')
const canSaveProfile = computed(() => {
  const validUser = /^[a-zA-Z0-9_]{3,32}$/.test(profileForm.username)
  return validUser && profileForm.displayName.trim().length > 0
})

// 修改密码
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const passwordSaving = ref(false)
const passwordError = ref('')
const canSavePassword = computed(() => passwordForm.newPassword.length >= 8 && passwordForm.confirm === passwordForm.newPassword && passwordForm.oldPassword.length > 0)

async function saveProfile() {
  if (!canSaveProfile.value || profileSaving.value) return
  profileSaving.value = true
  profileError.value = ''
  try {
    const updated = await usersApi.updateProfile({ username: profileForm.username, displayName: profileForm.displayName.trim() })
    auth.setUser(updated)
    toast.success('资料已保存。')
  } catch (cause) {
    profileError.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    profileSaving.value = false
  }
}

async function savePassword() {
  if (!canSavePassword.value || passwordSaving.value) return
  passwordSaving.value = true
  passwordError.value = ''
  try {
    await usersApi.changePassword({ oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword })
    // 后端已注销当前会话，清除本地并引导重新登录
    auth.clear()
    toast.success('密码已修改，请使用新密码重新登录。')
    await router.replace({ path: '/login' })
  } catch (cause) {
    passwordError.value = cause instanceof Error ? cause.message : '修改失败'
  } finally {
    passwordSaving.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- 顶部标签（仅一个标签时隐藏） -->
    <div v-if="tabs.length > 1" class="shrink-0 border-b bg-background px-6">
      <nav class="flex items-center gap-1" aria-label="设置标签">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :aria-current="activeTab === tab.key ? 'page' : undefined"
          :class="['relative rounded-t-md px-4 py-3 text-sm transition-colors', activeTab === tab.key ? 'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-neutral-800' : 'text-neutral-500 hover:bg-muted']"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </nav>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- 个人信息 -->
      <section v-if="activeTab === 'profile'" class="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 class="text-2xl font-medium tracking-tight">设置</h1>
        <p class="mt-3 text-sm text-muted-foreground">管理账号信息与密码。</p>

        <!-- 账号信息 -->
        <div class="mt-8 rounded-xl border p-6">
          <div class="flex items-center gap-2.5">
            <UserRound class="size-4 text-neutral-500" />
            <h2 class="text-sm font-medium">账号信息</h2>
            <span class="ml-auto rounded-full border px-2 py-0.5 text-xs text-neutral-500">{{ auth.user?.role === 'ADMIN' ? '管理员' : '用户' }}</span>
          </div>
          <p v-if="auth.user" class="mt-2 text-xs text-muted-foreground">@{{ auth.user.username }} · 用户名修改后，下次登录使用新用户名。</p>
          <form class="mt-5 space-y-4" @submit.prevent="saveProfile">
            <div class="space-y-1.5">
              <label for="profile-username" class="text-xs text-muted-foreground">用户名</label>
              <Input id="profile-username" v-model="profileForm.username" maxlength="32" placeholder="3–32 位字母、数字或下划线" />
            </div>
            <div class="space-y-1.5">
              <label for="profile-displayName" class="text-xs text-muted-foreground">显示名称</label>
              <Input id="profile-displayName" v-model="profileForm.displayName" maxlength="64" placeholder="不超过 64 个字符" />
            </div>
            <p v-if="profileError" role="alert" class="text-xs text-red-600">{{ profileError }}</p>
            <div class="flex justify-end">
              <Button type="submit" :disabled="!canSaveProfile || profileSaving"><LoaderCircle v-if="profileSaving" class="animate-spin" />保存资料</Button>
            </div>
          </form>
        </div>

        <!-- 修改密码 -->
        <div class="mt-4 rounded-xl border p-6">
          <div class="flex items-center gap-2.5">
            <KeyRound class="size-4 text-neutral-500" />
            <h2 class="text-sm font-medium">修改密码</h2>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">修改成功后当前会话将失效，需要重新登录。</p>
          <form class="mt-5 space-y-4" @submit.prevent="savePassword">
            <div class="space-y-1.5">
              <label for="password-old" class="text-xs text-muted-foreground">原密码</label>
              <Input id="password-old" v-model="passwordForm.oldPassword" type="password" autocomplete="current-password" placeholder="输入原密码" />
            </div>
            <div class="space-y-1.5">
              <label for="password-new" class="text-xs text-muted-foreground">新密码</label>
              <Input id="password-new" v-model="passwordForm.newPassword" type="password" autocomplete="new-password" placeholder="至少 8 个字符" />
            </div>
            <div class="space-y-1.5">
              <label for="password-confirm" class="text-xs text-muted-foreground">确认新密码</label>
              <Input id="password-confirm" v-model="passwordForm.confirm" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
              <p v-if="passwordForm.confirm && passwordForm.confirm !== passwordForm.newPassword" class="text-xs text-red-600">两次输入的密码不一致</p>
            </div>
            <p v-if="passwordError" role="alert" class="text-xs text-red-600">{{ passwordError }}</p>
            <div class="flex justify-end">
              <Button type="submit" :disabled="!canSavePassword || passwordSaving"><LoaderCircle v-if="passwordSaving" class="animate-spin" />修改密码</Button>
            </div>
          </form>
        </div>

        <!-- 后端连接与阶段说明已移出设置页，进度见 DrawSite_Web/docs/frontend-progress.md -->
      </section>

      <!-- 记忆管理（用户级全局记忆，所有登录用户可见） -->
      <MemorySettingsView v-else-if="activeTab === 'memory'" />

      <!-- 用户管理（仅管理员标签可见） -->
      <AdminUsersView v-else-if="activeTab === 'users'" />

      <!-- 平台管理（仅管理员标签可见） -->
      <AdminSettingsView v-else-if="activeTab === 'settings'" />
      <AdminDockerView v-else-if="activeTab === 'docker' && auth.isAdmin" embedded />
    </div>
  </div>
</template>
