<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import type { Container, Deployment, DockerTemplate } from '@/api/docker'
import {
  action as containerAction, containers, create as createContainer, deployments as fetchDeployments,
  execute, logs as fetchLogs, offline, publish, remove as removeContainer, templates as fetchTemplates,
} from '@/api/docker'

const items = ref<Container[]>([])
const templates = ref<DockerTemplate[]>([])
const deployments = ref<Deployment[]>([])
const props = defineProps<{ projectId: string }>()
const applicationId = ref('')
const templateId = ref('')
const purpose = ref('TEMPORARY')
const busy = ref(false)
const error = ref('')
const logs = ref<Record<string, string>>({})
const logsOpen = ref<Record<string, boolean>>({})
const outputs = ref<Record<string, string>>({})
const directory = ref('.')
const staticSite = computed(() => deployments.value.find(item => item.applicationId === props.projectId && item.type === 'STATIC'))
const commands = ref<Record<string, string>>({})
async function load() {
  const [list, defs, published] = await Promise.all([containers(), fetchTemplates(), fetchDeployments()])
  items.value = list.filter(item => item.applicationId === props.projectId)
  templates.value = defs; deployments.value = published
  const site = published.find(item => item.applicationId === props.projectId && item.type === 'STATIC')
  if (site?.directory) directory.value = site.directory
  applicationId.value = props.projectId
  if (!templateId.value) templateId.value = defs[0]?.id ?? ''
}
async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await action(); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '操作失败' }
  finally { busy.value = false }
}
function deployment(id: string) { return deployments.value.find(item => item.containerId === id) }
async function toggleLogs(id: string) {
  if (logsOpen.value[id]) { logsOpen.value[id] = false; return }
  await run(async () => { logs.value[id] = await fetchLogs(id); logsOpen.value[id] = true })
}
function toggleStatic() {
  const site = staticSite.value
  return run(() => site ? offline(site.id) : publish(props.projectId, 'STATIC', undefined, directory.value))
}
function toggleService(item: Container) {
  const published = deployment(item.id)
  return run(() => published ? offline(published.id) : publish(props.projectId, 'SERVICE', item.id))
}
onMounted(() => { void run(load) })
</script>

<template>
  <div>
    <div class="mx-auto max-w-5xl space-y-5">
      <header class="flex items-center justify-between"><div><h1 class="text-xl font-semibold">部署</h1><p class="mt-1 text-xs text-neutral-500">管理临时运行环境和常驻应用服务</p></div><Button variant="outline" :disabled="busy" @click="run(load)">刷新</Button></header>
      <p v-if="error" role="alert" class="rounded-lg border border-red-200 p-3 text-sm text-red-600">{{ error }}</p>
      <section class="space-y-3 rounded-xl border p-4">
        <div class="flex items-center justify-between gap-3"><h2 class="text-sm font-medium">静态网站</h2><div class="flex items-center gap-2"><span class="text-xs text-neutral-500">{{ staticSite ? '已上线' : '未上线' }}</span><button type="button" role="switch" aria-label="静态网站上线" :aria-checked="!!staticSite" :disabled="busy" :class="['relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', staticSite ? 'bg-neutral-900' : 'bg-neutral-300']" @click="toggleStatic"><span :class="['absolute top-0.5 size-4 rounded-full bg-white transition-transform', staticSite ? 'left-0.5 translate-x-4' : 'left-0.5']" /></button></div></div>
        <p class="text-xs leading-6 text-neutral-500">仅支持纯静态网站，Vue等框架需提前构建并配置静态目录</p>
        <div class="flex gap-2"><input v-model="directory" aria-label="静态目录" placeholder="静态目录，如 . 或 dist" class="min-w-0 flex-1 rounded border px-3 py-2 text-sm" /><Button v-if="staticSite" variant="outline" :disabled="busy" @click="run(() => publish(props.projectId, 'STATIC', undefined, directory))">更新网站</Button></div>
        <p v-if="staticSite" class="text-xs leading-6 text-neutral-500">修改代码后点击“更新网站”生效，访问地址不变，Vue等框架需先重新构建</p>
        <details class="text-xs text-neutral-500"><summary class="cursor-pointer">站点地址与路径设置</summary><div class="mt-2 space-y-2"><a v-if="staticSite" :href="staticSite.url" target="_blank" rel="noopener noreferrer" class="block break-all underline">{{ staticSite.url }}</a><p class="break-all">资源与路由基础路径：/sites/{{ props.projectId }}/</p><p>纯 HTML 使用相对资源路径；Vue 等构建 base 和路由 base 使用上述前缀。上线前检查目录及 index.html。</p></div></details>
      </section>
      <section class="space-y-3 rounded-xl border p-4">
        <h2 class="text-sm font-medium">创建容器</h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <select v-model="templateId" aria-label="环境模板" class="rounded border p-2 text-sm"><option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option></select>
          <select v-model="purpose" aria-label="容器用途" class="rounded border p-2 text-sm"><option value="TEMPORARY">临时编译 / 测试</option><option value="PUBLISH">常驻应用 / 发布</option></select>
        </div>
        <p v-if="!templates.length" class="text-xs text-neutral-500">暂无可用模板，请管理员先配置环境模板并拉取镜像。</p>
        <Button :disabled="busy || !applicationId || !templateId" @click="run(() => createContainer(applicationId, templateId, purpose))">创建并启动</Button>
      </section>
      <p v-if="!items.length" class="py-10 text-center text-sm text-neutral-400">暂无容器</p>
      <section v-for="item in items" :key="item.id" class="space-y-3 rounded-xl border p-5">
        <div class="flex flex-wrap items-center gap-2"><h2 class="text-sm font-medium">{{ item.templateId }}</h2><span class="rounded bg-neutral-100 px-2 py-1 text-[11px]">{{ item.status }}</span><span class="text-xs text-neutral-500">{{ item.purpose === 'TEMPORARY' ? '临时环境' : '常驻服务' }}</span></div>
        <p class="break-all text-[11px] text-neutral-400">{{ item.name }}</p>
        <p v-if="item.expiresAt" class="text-xs text-neutral-400">到期自动停止：{{ new Date(item.expiresAt).toLocaleString('zh-CN') }}</p>
        <p v-if="item.error" class="text-xs text-red-600">{{ item.error }}</p>
        <p v-if="item.hostPort && item.secondaryHostPort" class="text-xs text-neutral-500">宿主端口 {{ item.hostPort }} → 容器 {{ item.internalPort }} / 宿主端口 {{ item.secondaryHostPort }} → 容器 {{ item.secondaryInternalPort }}</p>
        <p v-else class="text-xs text-amber-700">此容器未配置宿主端口映射，更新后端后请删除并重新创建。</p>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" :disabled="busy" @click="run(() => containerAction(item.id, item.status === 'RUNNING' ? 'stop' : 'start'))">{{ item.status === 'RUNNING' ? '停止' : '启动' }}</Button>
          <Button size="sm" variant="outline" :disabled="busy" :aria-expanded="!!logsOpen[item.id]" @click="toggleLogs(item.id)">{{ logsOpen[item.id] ? '收起日志' : '查看日志' }}</Button>
          <Button size="sm" variant="outline" :disabled="busy || !!deployment(item.id)" @click="run(() => removeContainer(item.id))">删除</Button>
        </div>
        <div v-if="logsOpen[item.id]" class="space-y-2 rounded-lg bg-neutral-100 p-3"><div class="flex items-center justify-between"><span class="text-xs font-medium">容器日志</span><Button size="sm" variant="ghost" :disabled="busy" @click="run(async () => { logs[item.id] = await fetchLogs(item.id) })">刷新日志</Button></div><pre class="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{{ logs[item.id] || '暂无日志' }}</pre></div>
        <div class="flex gap-2"><input v-model="commands[item.id]" placeholder="容器内命令，例如 npm run build" class="min-w-0 flex-1 rounded border px-3 py-2 text-xs" /><Button size="sm" variant="outline" :disabled="busy || item.status !== 'RUNNING' || !commands[item.id]?.trim()" @click="run(async () => { const result = await execute(item.id, commands[item.id]!); outputs[item.id] = `退出码 ${result.exitCode}\n${result.output}` })">执行</Button></div>
        <details v-if="outputs[item.id]" open class="rounded-lg bg-neutral-100 p-3"><summary class="cursor-pointer text-xs">命令输出</summary><pre class="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{{ outputs[item.id] }}</pre></details>
        <div v-if="item.purpose === 'PUBLISH'" class="space-y-2 border-t pt-3">
          <div class="flex items-center justify-between"><span class="text-xs text-neutral-500">{{ deployment(item.id) ? '服务已上线' : '服务未上线' }}</span><button type="button" role="switch" aria-label="服务上线" :aria-checked="!!deployment(item.id)" :disabled="busy || (!deployment(item.id) && (item.status !== 'RUNNING' || !item.hostPort || !item.secondaryHostPort))" :class="['relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', deployment(item.id) ? 'bg-neutral-900' : 'bg-neutral-300']" @click="toggleService(item)"><span :class="['absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform', deployment(item.id) ? 'translate-x-4' : '']" /></button></div>
          <details v-if="deployment(item.id)" class="text-xs text-neutral-500"><summary class="cursor-pointer">服务地址</summary><div class="mt-2 space-y-1"><a :href="deployment(item.id)!.url" target="_blank" rel="noopener noreferrer" class="block break-all underline">{{ deployment(item.id)?.url }}</a><a :href="`/services/${item.id}/2/`" target="_blank" rel="noopener noreferrer" class="block break-all underline">/services/{{ item.id }}/2/</a></div></details>
        </div>
      </section>
    </div>
  </div>
</template>
