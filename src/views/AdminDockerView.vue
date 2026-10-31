<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Download, LoaderCircle, Pencil, Plus, RotateCw, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '@/stores/auth'
import type { DockerTemplate } from '@/api/docker'
import {
  config as fetchConfig, engineStatus, pull, removeTemplate as deleteTemplate,
  saveConfig, saveTemplate as updateTemplate, templates as fetchTemplates,
} from '@/api/docker'

const auth = useAuthStore()
defineProps<{ embedded?: boolean }>()

const templates = ref<DockerTemplate[]>([])
const configLoaded = ref(false)
const quotaSaving = ref(false)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const output = ref('')

/** 输入框统一用字符串承载，提交时再转数字，避免 v-model.number 在空值上变成 0。 */
const quota = reactive({
  maxRunning: '2', maxContainers: '4', maxPlatformRunning: '10',
  diskMiB: '2048', memoryMiB: '2048', cpus: '2', pids: '512', temporaryMinutes: '60',
})
const network = reactive({ publicHost: '', portStart: '40001', portEnd: '50000' })
const quotaFields = [
  { key: 'maxRunning', label: '每用户运行数' },
  { key: 'maxContainers', label: '每用户容器数' },
  { key: 'maxPlatformRunning', label: '平台运行上限' },
  { key: 'diskMiB', label: '可写层 MiB' },
  { key: 'memoryMiB', label: '内存 MiB' },
  { key: 'cpus', label: 'CPU 核数' },
  { key: 'pids', label: 'PID 上限' },
  { key: 'temporaryMinutes', label: '临时存活分钟' },
] as const

const templateDialogOpen = ref(false)
const editingTemplateId = ref<string | null>(null)
const templateSaving = ref(false)
const templateFormError = ref('')
const templateForm = reactive({ id: '', name: '', image: '', internalPort: '8080', command: 'sleep infinity', healthPath: '/', enabled: true, instructions: '' })
const deletingTemplateId = ref('')

/** 模板命令统一以 sh -lc 包裹，编辑时只回填真正的命令部分。 */
function commandText(command: string[]): string {
  return command.slice(0, 2).join(' ') === 'sh -lc' ? command.slice(2).join(' ') : command.join(' ')
}

async function load() {
  loading.value = true
  try {
    const [config, defs] = await Promise.all([fetchConfig(), fetchTemplates(true)])
    Object.assign(quota, {
      maxRunning: String(config.config.maxRunning), maxContainers: String(config.config.maxContainers),
      maxPlatformRunning: String(config.config.maxPlatformRunning), diskMiB: String(config.config.diskMiB),
      memoryMiB: String(config.config.memoryMiB), cpus: String(config.config.cpus),
      pids: String(config.config.pids), temporaryMinutes: String(config.config.temporaryMinutes),
    })
    network.publicHost = config.config.publicHost
    network.portStart = String(config.config.portStart)
    network.portEnd = String(config.config.portEnd)
    configLoaded.value = true
    templates.value = defs
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

function numberOf(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label}需要填写数字`)
  return parsed
}

function saveQuota() {
  quotaSaving.value = true
  return run(async () => {
    await saveConfig({
      maxRunning: numberOf(quota.maxRunning, '每用户运行数'),
      maxContainers: numberOf(quota.maxContainers, '每用户容器数'),
      maxPlatformRunning: numberOf(quota.maxPlatformRunning, '平台运行上限'),
      diskMiB: numberOf(quota.diskMiB, '可写层'),
      memoryMiB: numberOf(quota.memoryMiB, '内存'),
      cpus: numberOf(quota.cpus, 'CPU 核数'),
      pids: numberOf(quota.pids, 'PID 上限'),
      temporaryMinutes: numberOf(quota.temporaryMinutes, '临时存活分钟'),
      publicHost: network.publicHost.trim(),
      portStart: numberOf(network.portStart, '端口起始'),
      portEnd: numberOf(network.portEnd, '端口结束'),
    })
  }, '配额已保存，新容器生效。').finally(() => { quotaSaving.value = false })
}

function openCreateTemplate() {
  editingTemplateId.value = null
  Object.assign(templateForm, { id: '', name: '', image: '', internalPort: '8080', command: 'sleep infinity', healthPath: '/', enabled: true, instructions: '' })
  templateFormError.value = ''
  templateDialogOpen.value = true
}

function openEditTemplate(item: DockerTemplate) {
  editingTemplateId.value = item.id
  Object.assign(templateForm, {
    id: item.id, name: item.name, image: item.image,
    internalPort: String(item.internalPort), command: commandText(item.command),
    healthPath: item.healthPath, enabled: item.enabled, instructions: item.instructions ?? '',
  })
  templateFormError.value = ''
  templateDialogOpen.value = true
}

function validateTemplate(): string {
  const form = templateForm
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(form.id.trim())) return '模板 ID 只能用 1–64 位字母、数字、下划线、点或连字符'
  if (!form.name.trim()) return '请填写模板名称'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]{0,250}$/.test(form.image.trim())) return '镜像地址不合法，例如 nginxinc/nginx-unprivileged:alpine'
  const port = Number(form.internalPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return '内部端口应为 1–65535 的整数'
  if (!form.command.trim()) return '请填写启动命令'
  if (!form.healthPath.trim().startsWith('/') || form.healthPath.includes('\n')) return '健康检查路径必须以 / 开头'
  if (templates.value.some((item) => item.id === form.id.trim() && item.id !== editingTemplateId.value)) return '模板 ID 已存在，请换一个标识'
  return ''
}

async function saveTemplate() {
  if (templateSaving.value) return
  const invalid = validateTemplate()
  if (invalid) {
    templateFormError.value = invalid
    return
  }
  templateSaving.value = true
  templateFormError.value = ''
  const isEditing = editingTemplateId.value !== null
  try {
    await updateTemplate({
      id: templateForm.id.trim(),
      name: templateForm.name.trim(),
      image: templateForm.image.trim(),
      command: ['sh', '-lc', templateForm.command.trim()],
      internalPort: Number(templateForm.internalPort),
      healthPath: templateForm.healthPath.trim(),
      enabled: templateForm.enabled,
      instructions: templateForm.instructions.trim(),
    })
    await load()
    templateDialogOpen.value = false
    toast.success(isEditing ? '模板已更新。' : '模板已创建。')
  } catch (cause) {
    templateFormError.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    templateSaving.value = false
  }
}

async function removeTemplate(id: string) {
  if (await run(() => deleteTemplate(id), '模板已删除')) deletingTemplateId.value = ''
}

onMounted(() => { if (auth.isAdmin) void load() })
</script>

<template>
  <div v-if="!auth.isAdmin" class="p-8 text-sm">仅管理员可访问</div>
  <div v-else :class="embedded ? '' : 'flex-1 overflow-y-auto p-6'">
    <div class="mx-auto max-w-4xl space-y-4">
      <header class="flex items-end justify-between gap-4">
        <div>
          <h1 class="text-xl font-medium tracking-tight">Docker 管理</h1>
          <p class="mt-2 text-sm text-muted-foreground">维护环境模板与资源配额。容器与已上线站点在「部署管理」查看。</p>
        </div>
        <Button variant="outline" size="sm" :disabled="loading || busy" @click="load"><RotateCw :class="{ 'animate-spin': loading }" />刷新</Button>
      </header>

      <p v-if="error" role="alert" class="rounded-lg border border-red-200 p-3 text-sm leading-6 text-red-600">{{ error }}</p>

      <!-- 资源配额 -->
      <section v-if="configLoaded" class="rounded-xl border p-6">
        <h2 class="text-sm font-medium">资源配额</h2>
        <p class="mt-2 text-xs leading-6 text-muted-foreground">磁盘为容器可写层限额，不含挂载的项目目录；宿主机不支持 storage-opt size 时会拒绝创建。改动对新容器生效。</p>
        <div class="mt-5 grid gap-4 sm:grid-cols-4">
          <div v-for="field in quotaFields" :key="field.key" class="space-y-1.5">
            <label :for="`quota-${field.key}`" class="text-xs text-muted-foreground">{{ field.label }}</label>
            <Input :id="`quota-${field.key}`" v-model="quota[field.key]" inputmode="decimal" />
          </div>
        </div>
        <div class="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-3">
          <div class="space-y-1.5 sm:col-span-1">
            <label for="quota-publicHost" class="text-xs text-muted-foreground">公网主机</label>
            <Input id="quota-publicHost" v-model="network.publicHost" placeholder="服务器 IPv4 或域名" />
          </div>
          <div class="space-y-1.5">
            <label for="quota-portStart" class="text-xs text-muted-foreground">端口起始</label>
            <Input id="quota-portStart" v-model="network.portStart" inputmode="numeric" />
          </div>
          <div class="space-y-1.5">
            <label for="quota-portEnd" class="text-xs text-muted-foreground">端口结束</label>
            <Input id="quota-portEnd" v-model="network.portEnd" inputmode="numeric" />
          </div>
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <Button :disabled="busy" @click="saveQuota"><LoaderCircle v-if="quotaSaving" class="animate-spin" />保存配额</Button>
          <Button variant="outline" :disabled="busy" @click="run(async () => { output = await engineStatus() }, '已获取引擎状态')">检查 Docker</Button>
        </div>
      </section>

      <!-- 环境模板 -->
      <section class="rounded-xl border p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-sm font-medium">环境模板</h2>
            <p class="mt-2 text-xs leading-6 text-muted-foreground">模板决定容器的镜像、端口与启动命令，创建容器前需要先拉取镜像。停用的模板不再出现在创建列表里。</p>
          </div>
          <Button variant="outline" size="sm" :disabled="busy" @click="openCreateTemplate"><Plus />新增模板</Button>
        </div>

        <div v-if="templates.length === 0" class="mt-5 rounded-lg border border-dashed px-6 py-10 text-center">
          <p class="text-sm text-neutral-400">还没有环境模板</p>
          <p class="mt-2 text-xs leading-6 text-muted-foreground">新增一个模板并拉取镜像后，项目就能创建临时环境或常驻服务。</p>
          <Button variant="outline" size="sm" class="mt-4" :disabled="busy" @click="openCreateTemplate"><Plus />新增模板</Button>
        </div>
        <div v-else class="mt-5 space-y-2.5">
          <div v-for="item in templates" :key="item.id" class="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="truncate text-sm font-medium">{{ item.name }}</p>
                <Badge :class="item.enabled ? 'border-neutral-800 text-neutral-800' : 'border-neutral-300 text-neutral-500'">{{ item.enabled ? '启用' : '停用' }}</Badge>
              </div>
              <p class="mt-1.5 break-all font-mono text-xs text-neutral-400">{{ item.image }}</p>
              <p v-if="item.instructions" :title="item.instructions" class="mt-2 line-clamp-3 break-words text-xs leading-5 text-neutral-500">{{ item.instructions }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-500">
                <span>内部端口 {{ item.internalPort }}</span>
                <span>健康检查 {{ item.healthPath }}</span>
                <span class="break-all font-mono text-neutral-400">{{ commandText(item.command) }}</span>
              </div>
              <p class="mt-2 font-mono text-[11px] text-neutral-400">ID {{ item.id }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <Button variant="ghost" size="icon" aria-label="编辑模板" title="编辑" :disabled="busy" @click="openEditTemplate(item)"><Pencil /></Button>
              <Button variant="outline" size="sm" :disabled="busy" @click="run(async () => { output = await pull(item.id) }, '镜像已拉取')"><Download />拉取镜像</Button>
              <template v-if="deletingTemplateId === item.id">
                <span class="text-[11px] text-neutral-400">确认删除？</span>
                <Button variant="outline" size="sm" :disabled="busy" @click="deletingTemplateId = ''">取消</Button>
                <Button size="sm" :disabled="busy" @click="removeTemplate(item.id)"><Trash2 />删除</Button>
              </template>
              <Button v-else variant="ghost" size="icon" aria-label="删除模板" title="删除" :disabled="busy" @click="deletingTemplateId = item.id"><Trash2 /></Button>
            </div>
          </div>
        </div>
      </section>

      <!-- 执行输出 -->
      <section v-if="output" class="overflow-hidden rounded-xl border">
        <div class="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 class="text-sm font-medium">执行输出</h2>
          <Button variant="ghost" size="sm" @click="output = ''">清空</Button>
        </div>
        <pre class="max-h-96 overflow-auto whitespace-pre-wrap break-all px-5 py-4 text-xs leading-6">{{ output }}</pre>
      </section>

      <!-- 平台容器与平台部署已移到「部署管理」（/admin/deployments） -->

      <!-- 模板编辑对话框 -->
      <Dialog :open="templateDialogOpen" :title="editingTemplateId ? '编辑环境模板' : '新增环境模板'" @update:open="templateDialogOpen = $event">
        <form class="space-y-4" @submit.prevent="saveTemplate">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label for="template-id" class="text-xs text-muted-foreground">模板 ID</label>
              <Input id="template-id" v-model="templateForm.id" :disabled="editingTemplateId !== null" maxlength="64" placeholder="如 node22" />
              <p class="text-xs leading-5 text-neutral-400">{{ editingTemplateId ? 'ID 是模板的唯一标识，创建后不可修改。' : '字母、数字、下划线、点或连字符。' }}</p>
            </div>
            <div class="space-y-1.5">
              <label for="template-name" class="text-xs text-muted-foreground">模板名称</label>
              <Input id="template-name" v-model="templateForm.name" maxlength="100" placeholder="如 Node 22 构建环境" />
            </div>
            <div class="space-y-1.5 sm:col-span-2">
              <label for="template-image" class="text-xs text-muted-foreground">镜像</label>
              <Input id="template-image" v-model="templateForm.image" maxlength="251" placeholder="如 nginxinc/nginx-unprivileged:alpine" />
            </div>
            <div class="space-y-1.5">
              <label for="template-port" class="text-xs text-muted-foreground">内部端口</label>
              <Input id="template-port" v-model="templateForm.internalPort" inputmode="numeric" placeholder="8080" />
            </div>
            <div class="space-y-1.5">
              <label for="template-health" class="text-xs text-muted-foreground">健康检查路径</label>
              <Input id="template-health" v-model="templateForm.healthPath" maxlength="200" placeholder="/" />
            </div>
            <div class="space-y-1.5 sm:col-span-2">
              <label for="template-command" class="text-xs text-muted-foreground">启动命令</label>
              <Input id="template-command" v-model="templateForm.command" placeholder="sleep infinity" />
              <p class="text-xs leading-5 text-neutral-400">容器内实际执行的命令，平台会以 sh -lc 方式运行。</p>
            </div>
          </div>
          <div class="space-y-2">
            <label for="template-instructions" class="text-xs text-muted-foreground">使用说明（AI 提示）</label>
            <textarea id="template-instructions" v-model="templateForm.instructions" rows="5" maxlength="4000" placeholder="说明模板用途、构建命令、产物目录，以及是否需要常驻运行。例如：仅用于静态构建，npm run build 后发布 dist，不启动 Vite 开发服务器。" class="block w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" />
          </div>
          <label class="flex cursor-pointer items-center gap-2 text-sm"><Switch v-model="templateForm.enabled" />启用模板</label>
          <p v-if="templateFormError" role="alert" class="text-xs leading-5 text-red-600">{{ templateFormError }}</p>
          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" :disabled="templateSaving" @click="templateDialogOpen = false">取消</Button>
            <Button type="submit" :disabled="templateSaving"><LoaderCircle v-if="templateSaving" class="animate-spin" />{{ editingTemplateId ? '保存修改' : '创建模板' }}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  </div>
</template>
