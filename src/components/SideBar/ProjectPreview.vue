<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import RefreshButton from '@/components/RefreshButton.vue'
import { Switch } from '@/components/ui/switch'
import { useTabRefresh } from '@/lib/tab-refresh'
import * as api from '@/api/docker'
import { request } from '@/lib/http'
import { installSelector, type SelectedElement } from '@/lib/preview-selector'

const props = defineProps<{ applicationId: string; running: boolean }>()
const emit = defineEmits<{ 'select-element': [element: SelectedElement] }>()
interface Address { label: string; url: string; containerId?: string; directory?: string }
const addresses = ref<Address[]>([])
const url = ref('')
const opened = ref('')
const selecting = ref(false)
const error = ref('')
const loading = ref(false)
const frame = ref<HTMLIFrameElement | null>(null)
let selector: ReturnType<typeof installSelector> | null = null
const current = computed(() => addresses.value.find(item => item.url === url.value))
async function load() {
  loading.value = true
  try {
    const [containers, deployments] = await Promise.all([api.containers(), api.deployments()])
    const site = deployments.find(d => d.applicationId === props.applicationId && d.type === 'STATIC')
    const list: Address[] = [{ label: '工作区静态页面', url: new URL(`/sites/${props.applicationId}/__preview/`, location.origin).href, directory: site?.directory ?? '.' }]
    list.push(...deployments.filter(d => d.applicationId === props.applicationId && d.type === 'STATIC').map(d => ({ label: '已发布静态网站', url: new URL(d.url, location.origin).href })))
    for (const c of containers.filter(c => c.applicationId === props.applicationId && c.status === 'RUNNING' && c.hostPort)) {
      list.push({ label: `${c.templateId} · ${c.name.slice(-8)} · 主端口 ${c.internalPort}`, url: new URL(`/services/${c.id}/1/`, location.origin).href, containerId: c.id })
      list.push({ label: `${c.templateId} · ${c.name.slice(-8)} · 备用端口 ${c.secondaryInternalPort}`, url: new URL(`/services/${c.id}/2/`, location.origin).href, containerId: c.id })
    }
    addresses.value = list
    if (!url.value) url.value = list[0]?.url ?? ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败' }
  finally { loading.value = false }
}
async function authorize() {
  const address = current.value
  if (address?.containerId) await request(`/applications/${props.applicationId}/preview/${address.containerId}`, { method: 'POST' })
  if (address?.directory !== undefined) await request(`/applications/${props.applicationId}/preview/static`, { method: 'POST', body: JSON.stringify({ directory: address.directory }) })
}
async function preview() {
  error.value = ''
  try {
    const target = new URL(url.value)
    if (!['https:', 'http:'].includes(target.protocol)) throw new Error('仅支持HTTP或HTTPS地址')
    await authorize()
    selector?.dispose(); selector = null
    const el = frame.value
    if (opened.value === target.href && el) {
      // 同地址刷新：给 iframe 赋一个相同的 src 并不保证触发 load，
      try { el.contentWindow?.location.reload() } catch { el.src = target.href }
    } else {
      opened.value = target.href
    }
    // 地址列表可能较长，点了能看到预览框，避免误以为没反应
    await nextTick()
    frame.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '预览失败' }
}
async function open() {
  error.value = ''
  // 先同步开空窗口再 await：授权是异步的，等回来再 window.open 会被浏览器当成非用户手势拦截
  const target = window.open('', '_blank')
  try {
    await authorize()
    if (!target) {
      error.value = '浏览器拦截了新标签页，请允许本站弹出窗口后重试'
      return
    }
    target.opener = null
    target.location.href = url.value
  } catch (cause) {
    target?.close()
    error.value = cause instanceof Error ? cause.message : '打开失败'
  }
}
function loaded() {
  selector?.dispose(); selector = null
  try {
    const doc = frame.value?.contentDocument
    if (!doc?.documentElement) throw new Error('无法访问页面')
    selector = installSelector(doc, value => emit('select-element', value)); selector.setEnabled(selecting.value)
    error.value = ''
  } catch { error.value = '此页面无法注入圈选功能，请使用平台同源服务地址；外部网页可能限制嵌入。' }
}
watch(selecting, value => {
  if (!value) { selector?.setEnabled(false); return }
  // 实例还在就只切开关；丢了（iframe 刚 load / 上一次刷新清掉）就按当前 iframe 重建一次，
  if (selector) selector.setEnabled(true)
  else if (opened.value && frame.value) loaded()
})
watch(() => props.running, (running, previous) => { if (previous && !running && opened.value) void preview() })
/** 地址列表（容器 / 已发布站点）可能被外部改动，重新进标签时超过 60s 就静默刷新一次 */
useTabRefresh(load, { ttl: 60_000 })
onUnmounted(() => selector?.dispose())
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between"><h2 class="text-sm font-medium">预览</h2><RefreshButton variant="ghost" class="size-7" :loading="loading" label="刷新地址" @click="load" /></div>
    <ul class="space-y-2">
      <li v-for="address in addresses" :key="address.url" class="rounded-lg border p-3">
        <p class="text-xs text-neutral-500">{{ address.label }}</p>
        <p class="mt-1 break-all text-xs text-neutral-400">{{ address.url }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" @click="url = address.url; open()">打开</Button>
          <Button size="sm" @click="url = address.url; preview()">实时预览</Button>
        </div>
      </li>
    </ul>
    <div class="flex gap-2"><input v-model="url" aria-label="预览地址" placeholder="https://…" class="min-w-0 flex-1 rounded-md border px-3 py-2 text-xs" /><Button size="sm" :disabled="!url" @click="preview">实时预览</Button><Button size="sm" variant="outline" :disabled="!url" @click="open">打开</Button></div>
    <div class="flex items-center justify-between gap-3"><div><h3 class="text-sm font-medium">圈选修改</h3><p class="mt-1 text-xs text-neutral-500">选定网页元素后Agent可以更精准地修改网页</p></div><Switch v-model="selecting" :disabled="!opened" /></div>
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    <iframe v-if="opened" ref="frame" :src="opened" title="应用实时预览" class="h-[65vh] min-h-96 w-full rounded-lg border bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-modals" referrerpolicy="no-referrer" @load="loaded" />
    <div v-else class="flex h-80 items-center justify-center rounded-lg border text-xs text-neutral-400">选择已启动服务或静态站点，点击“实时预览”在下方嵌入查看，或点击“打开”跳转新标签</div>
  </section>
</template>
