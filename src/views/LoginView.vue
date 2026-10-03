<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Blocks, LoaderCircle } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const displayName = ref('')
const error = ref('')
const notice = ref('')
const submitting = computed(() => auth.loading)
const canSubmit = computed(() => {
  const validUser = /^[a-zA-Z0-9_]{3,32}$/.test(username.value)
  if (mode.value === 'register') return validUser && password.value.length >= 8 && displayName.value.trim().length > 0
  return username.value.trim().length > 0 && password.value.length > 0
})

async function submit() {
  error.value = ''
  notice.value = ''
  try {
    if (mode.value === 'register') {
      await auth.register({ username: username.value, password: password.value, displayName: displayName.value.trim() })
      notice.value = '注册成功，请登录。'
      mode.value = 'login'
      password.value = ''
    } else {
      await auth.login(username.value, password.value)
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
      await router.replace(redirect)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败，请稍后重试'
  }
}

function switchMode(next: 'login' | 'register') {
  mode.value = next
  error.value = ''
  notice.value = ''
}
</script>

<template>
  <section class="flex min-h-dvh flex-col items-center justify-center bg-[#fafafa] px-6">
    <div class="w-full max-w-sm">
      <div class="mb-8 flex items-center justify-center gap-2.5">
        <Blocks class="size-6" />
        <span class="text-lg font-semibold tracking-tight">绘站</span>
        <span class="text-xs text-muted-foreground">DrawSite</span>
      </div>
      <div class="rounded-2xl border bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div class="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
          <button type="button" :class="['rounded-md py-1.5 transition-colors', mode === 'login' ? 'bg-white font-medium shadow-sm' : 'text-neutral-500']" @click="switchMode('login')">登录</button>
          <button type="button" :class="['rounded-md py-1.5 transition-colors', mode === 'register' ? 'bg-white font-medium shadow-sm' : 'text-neutral-500']" @click="switchMode('register')">注册</button>
        </div>
        <form class="space-y-4" @submit.prevent="submit">
          <div class="space-y-1.5">
            <label for="username" class="text-xs text-muted-foreground">用户名</label>
            <Input id="username" v-model="username" autocomplete="username" placeholder="3–32 位字母、数字或下划线" />
          </div>
          <div v-if="mode === 'register'" class="space-y-1.5">
            <label for="displayName" class="text-xs text-muted-foreground">显示名称</label>
            <Input id="displayName" v-model="displayName" autocomplete="nickname" placeholder="不超过 64 个字符" />
          </div>
          <div class="space-y-1.5">
            <label for="password" class="text-xs text-muted-foreground">密码</label>
            <Input id="password" v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :placeholder="mode === 'register' ? '至少 8 个字符' : '输入密码'" />
          </div>
          <p v-if="error" role="alert" class="text-xs leading-5 text-red-600">{{ error }}</p>
          <p v-if="notice" role="status" class="text-xs leading-5 text-muted-foreground">{{ notice }}</p>
          <Button type="submit" class="w-full" :disabled="!canSubmit || submitting">
            <LoaderCircle v-if="submitting" class="animate-spin" />
            {{ mode === 'login' ? '登录' : '注册' }}
          </Button>
        </form>
      </div>
      <p class="mt-6 text-center text-xs leading-5 text-neutral-400">登录后即可创建应用，管理会话、文档与版本。</p>
    </div>
  </section>
</template>
