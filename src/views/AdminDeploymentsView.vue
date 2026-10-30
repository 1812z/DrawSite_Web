<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { LoaderCircle, RotateCw, ScrollText, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth'
import * as api from '@/api/docker'

const auth = useAuthStore()

const items = ref<api.Container[]>([])
const deployments = ref<api.Deployment[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const deletingContainerId = ref('')

/**
 * 日志放弹窗里读：原来写进页面底部的「执行输出」面板，
 * 容器一多面板就在屏幕之外，点按钮看着像没反应；日志为空时面板还会直接不渲染。
 */
const logsOpen = ref(false)
const logsContainerId = ref('')
const logsTitle = ref('')
const logsText = ref('')
const logsLoading = ref(false)
const logsError = ref('')

async function openLogs(item: api.Container) {
  logsContainerId.value = item.id
  logsTitle.value = item.name
  logsText.value = ''
  logsError.value = ''
  logsOpen.value = true
  await refreshLogs()
}

async function refreshLogs() {
  if (!logsContainerId.value || logsLoading.value) return
  logsLoading.value = true
  logsError.value = ''
  try {
    logsText.value = await api.logs(logsContainerId.value, true)
  } catch (cause) {
    logsError.value = cause instanceof Error ? cause.message : '读取日志失败'
  } finally {
    logsLoading.value = false
  }
}

const CONTAINER_STATUS: Record<string, { label: string; class: string }> = {
  RUNNING: { label: '运行中', class: 'border-neutral-800 text-neutral-800' },
  STOPPED: { label: '已停止', class: 'border-neutral-300 text-neutral-500' },
  CREATING: { label: '创建中', class: 'border-amber-300 text-amber-700' },
}
function containerStatus(value: string) {
  return CONTAINER_STATUS[value] ?? { label: value, class: 'border-neutral-300 text-neutral-500' }
}

async function load() {
  loading.value = true
  try {
    const [list, published] = await Promise.all([api.containers(true), api.deployments(true)])
    items.value = list
    deployments.value = published
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function run(action: () => Promise<unknown>, notice = ''): Promise<boolean> {
  if (busy.value) return false
  busy.value = true
  error.value = ''
  try {
    await action()
    await load()
    if (notice) toast.success(notice)
    return true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败'
    return false
  } finally {
    busy.value = false
  }
}

async function removeContainer(id: string) {
  if (await run(() => api.remove(id, true), '容器已删除')) deletingContainerId.value = ''
}

onMounted(() => { if (auth.isAdmin) void load() })
</script>

<template>
  <div v-if="!auth.isAdmin" class="p-8 text-sm">仅管理员可访问</div>
  <div v-else class="flex-1 overflow-y-auto p-6">
    <div class="mx-auto max-w-4xl space-y-4">
      <header class="flex items-end justify-between gap-4">
        <div>
          <h1 class="text-xl font-medium tracking-tight">部署管理</h1>
          <p class="mt-2 text-sm text-muted-foreground">平台上所有用户的容器与已上线站点。</p>
        </div>
        <Button variant="outline" size="sm" :disabled="loading || busy" @click="load"><RotateCw :class="{ 'animate-spin': loading }" />刷新</Button>
      </header>

      <p v-if="error" role="alert" class="rounded-lg border border-red-200 p-3 text-sm leading-6 text-red-600">{{ error }}</p>

      <!-- 平台容器 -->
      <section class="rounded-xl border p-6">
        <h2 class="text-sm font-medium">平台容器</h2>
        <p class="mt-2 text-xs leading-6 text-muted-foreground">临时环境到期后会自动停止，常驻服务需保持运行才能对外提供访问。</p>
        <div v-if="items.length === 0" class="mt-5 rounded-lg border border-dashed px-6 py-10 text-center">
          <p class="text-sm text-neutral-400">暂无容器</p>
          <p class="mt-2 text-xs leading-6 text-muted-foreground">用户在项目里创建容器后，这里会显示运行状态与端口映射。</p>
        </div>
        <div v-else class="mt-5 space-y-2.5">
          <div v-for="item in items" :key="item.id" class="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="truncate text-sm font-medium">{{ item.name }}</p>
                <Badge :class="containerStatus(item.status).class">{{ containerStatus(item.status).label }}</Badge>
                <Badge class="border-neutral-300 text-neutral-500">{{ item.purpose === 'TEMPORARY' ? '临时环境' : '常驻服务' }}</Badge>
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-500">
                <span class="break-all">用户 {{ item.ownerUserId }}</span>
                <span class="break-all">项目 {{ item.applicationId }}</span>
                <span>模板 {{ item.templateId }}</span>
                <span v-if="item.hostPort">宿主端口 {{ item.hostPort }} 映射 {{ item.internalPort }}</span>
              </div>
              <p v-if="item.expiresAt" class="mt-1.5 text-xs text-neutral-400">到期自动停止：{{ new Date(item.expiresAt).toLocaleString('zh-CN', { hour12: false }) }}</p>
              <p v-if="item.error" class="mt-1.5 break-all text-xs text-red-600">{{ item.error }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <Button variant="outline" size="sm" :disabled="busy" @click="run(() => api.action(item.id, item.status === 'RUNNING' ? 'stop' : 'start', true))">{{ item.status === 'RUNNING' ? '停止' : '启动' }}</Button>
              <Button variant="outline" size="sm" :disabled="busy" @click="openLogs(item)"><ScrollText />日志</Button>
              <template v-if="deletingContainerId === item.id">
                <span class="text-[11px] text-neutral-400">确认删除？</span>
                <Button variant="outline" size="sm" :disabled="busy" @click="deletingContainerId = ''">取消</Button>
                <Button size="sm" :disabled="busy" @click="removeContainer(item.id)"><Trash2 />删除</Button>
              </template>
              <Button v-else variant="ghost" size="icon" aria-label="删除容器" title="删除" :disabled="busy" @click="deletingContainerId = item.id"><Trash2 /></Button>
            </div>
          </div>
        </div>
      </section>

      <!-- 平台部署 -->
      <section class="rounded-xl border p-6">
        <h2 class="text-sm font-medium">平台部署</h2>
        <p class="mt-2 text-xs leading-6 text-muted-foreground">已上线的站点与服务。下线后地址立即失效，静态站点的文件会一并清理。</p>
        <div v-if="deployments.length === 0" class="mt-5 rounded-lg border border-dashed px-6 py-10 text-center">
          <p class="text-sm text-neutral-400">暂无上线内容</p>
          <p class="mt-2 text-xs leading-6 text-muted-foreground">用户在部署页上线静态网站或常驻服务后，这里会列出访问地址。</p>
        </div>
        <div v-else class="mt-5 space-y-2.5">
          <div v-for="item in deployments" :key="item.id" class="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <Badge class="border-neutral-300 text-neutral-500">{{ item.type === 'STATIC' ? '静态网站' : '应用服务' }}</Badge>
                <Badge :class="item.status === 'ONLINE' ? 'border-neutral-800 text-neutral-800' : 'border-red-300 text-red-600'">{{ item.status === 'ONLINE' ? '已上线' : '已下线' }}</Badge>
                <span v-if="item.type === 'STATIC' && item.directory" class="font-mono text-[11px] text-neutral-400">目录 {{ item.directory }}</span>
              </div>
              <a :href="item.url" target="_blank" rel="noopener noreferrer" class="mt-2 block break-all text-sm text-neutral-800 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-800">{{ item.url }}</a>
              <p v-if="item.type === 'SERVICE'" class="mt-1.5 break-all text-xs text-neutral-400">项目 {{ item.applicationId }}</p>
              <p v-if="item.error" class="mt-1.5 break-all text-xs text-red-600">{{ item.error }}</p>
            </div>
            <Button class="shrink-0" variant="outline" size="sm" :disabled="busy" @click="run(() => api.offline(item.id, true), '已下线')">下线</Button>
          </div>
        </div>
      </section>

      <!-- 执行输出面板已并入日志弹窗 -->

      <Dialog :open="logsOpen" :title="`容器日志 · ${logsTitle}`" class="max-w-3xl" @update:open="logsOpen = $event">
        <div class="space-y-3">
          <p v-if="logsError" role="alert" class="rounded-lg border border-red-200 px-3 py-2 text-xs leading-5 text-red-600">{{ logsError }}</p>
          <div class="max-h-[60vh] min-h-24 overflow-auto rounded-lg border bg-neutral-50 px-3 py-2">
            <p v-if="logsLoading" class="flex items-center justify-center gap-2 py-8 text-xs text-neutral-400"><LoaderCircle class="size-3 animate-spin" />读取日志…</p>
            <pre v-else-if="logsText" class="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-neutral-700">{{ logsText }}</pre>
            <p v-else class="py-8 text-center text-xs text-neutral-400">这个容器还没有输出</p>
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="outline" size="sm" :disabled="logsLoading" @click="refreshLogs"><RotateCw :class="{ 'animate-spin': logsLoading }" />刷新</Button>
            <Button size="sm" @click="logsOpen = false">关闭</Button>
          </div>
        </div>
      </Dialog>
    </div>
  </div>
</template>
