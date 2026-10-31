<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Component, ComponentPublicInstance } from 'vue'
import { PanelRightClose, PanelRightOpen } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import DeploymentsView from '@/views/DeploymentsView.vue'
import OverviewTab from './OverviewTab.vue'
import DocumentsTab from './DocumentsTab.vue'
import MemoriesTab from './MemoriesTab.vue'
import ProjectGit from './ProjectGit.vue'
import ProjectPreview from './ProjectPreview.vue'
import ProjectTests from './ProjectTests.vue'
import type { Application } from '@/api/applications'
import type { SelectedElement } from '@/lib/preview-selector'

/**
 * 右半的多标签侧边栏：标签栏、收起/展开、拖拽调宽都在这里，
 * 各标签的内容各自成组件（概览 / 文档 / 记忆），部署、测试、预览、版本复用已有组件。
 */
const props = defineProps<{
  application: Application
  applicationId: string
  conversationId: string
  modelId: string
  memoryEnabled: boolean
  running: boolean
  revision: number
  /** 概览的刷新与提示由父级持有（刷新要连带重取消息），这里只负责展示 */
  refreshing: boolean
  notice: string
  /** 父级的 flex 容器，拖拽时按它的宽度换算百分比 */
  containerEl: HTMLElement | null
}>()

const emit = defineEmits<{
  'select-element': [element: SelectedElement]
  refresh: []
  'refresh-messages': []
  'context-progress': [text: string, busy: boolean]
}>()

type SideTab = 'overview' | 'documents' | 'revisions' | 'memories' | 'deployments' | 'tests' | 'preview'
const tabs: { key: SideTab; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'documents', label: '文档' },
  { key: 'revisions', label: '版本' },
  { key: 'memories', label: '记忆' },
  { key: 'deployments', label: '部署' },
  { key: 'tests', label: '测试' },
  { key: 'preview', label: '预览' },
]
const tab = ref<SideTab>('overview')

/**
 * 标签用「动态组件 + KeepAlive」渲染（切换动效见 playTabEnter）。
 * markRaw 避免组件定义被当成响应式对象代理。
 */
const TAB_COMPONENTS: Record<SideTab, Component> = {
  overview: markRaw(OverviewTab),
  documents: markRaw(DocumentsTab),
  revisions: markRaw(ProjectGit),
  memories: markRaw(MemoriesTab),
  deployments: markRaw(DeploymentsView),
  tests: markRaw(ProjectTests),
  preview: markRaw(ProjectPreview),
}
const activeComponent = computed(() => TAB_COMPONENTS[tab.value])
const activeProps = computed<Record<string, unknown>>(() => {
  const base = { applicationId: props.applicationId, revision: props.revision, running: props.running }
  switch (tab.value) {
    case 'overview':
      return {
        application: props.application,
        ...base,
        conversationId: props.conversationId,
        modelId: props.modelId,
        memoryEnabled: props.memoryEnabled,
        refreshing: props.refreshing,
        notice: props.notice,
        onRefresh: () => emit('refresh'),
        onContextProgress: (text: string, busy: boolean) => emit('context-progress', text, busy),
        onContextCompleted: () => emit('refresh-messages'),
      }
    case 'revisions':
      return { ...base, onRestored: () => emit('refresh') }
    case 'deployments':
      // 部署视图认的是 projectId，且换应用要换实例，key 由外层 KeepAlive 的 applicationId 保证
      return { projectId: props.applicationId }
    case 'preview':
      return { ...base, onSelectElement: (element: SelectedElement) => emit('select-element', element) }
    default:
      return base
  }
})
const panelOpen = ref(true)
/**
 * 收起动画期间内容还要在场才能淡出，动画结束后再卸载：
 * 这样部署轮询、预览 iframe 这些组件不会在窄轨里继续跑。
 */
const bodyVisible = ref(true)
const COLLAPSE_MS = 320
let bodyTimer: number | null = null

const PANEL_WIDTH_KEY = 'drawsite:side-panel-width'
const MIN_PANEL_PCT = 20
const MAX_PANEL_PCT = 70
const DEFAULT_PANEL_PCT = 40
const panelWidth = ref(readStoredPanelWidth())
const dragging = ref(false)

function readStoredPanelWidth(): number {
  const raw = localStorage.getItem(PANEL_WIDTH_KEY)
  if (!raw) return DEFAULT_PANEL_PCT
  const value = Number(raw)
  if (!Number.isFinite(value)) return DEFAULT_PANEL_PCT
  return Math.min(MAX_PANEL_PCT, Math.max(MIN_PANEL_PCT, value))
}

function clearBodyTimer() {
  if (bodyTimer !== null) {
    window.clearTimeout(bodyTimer)
    bodyTimer = null
  }
}

function openPanel() {
  clearBodyTimer()
  bodyVisible.value = true
  panelOpen.value = true
}

function closePanel() {
  panelOpen.value = false
  clearBodyTimer()
  bodyTimer = window.setTimeout(() => {
    bodyVisible.value = false
    bodyTimer = null
  }, COLLAPSE_MS)
}

function openTab(next: SideTab) {
  openPanel()
  tab.value = next
}

/**
 * 缓存标签后滚动视口是共用的，不归零会停在上一个标签的位置，
 * 看起来像「数据没换」。切换时统一回到顶部。
 */
const scrollArea = ref<ComponentPublicInstance | null>(null)
const stage = ref<HTMLElement | null>(null)

/**
 * 标签内容的淡入用 Web Animations API 手动播放，不能用 Transition：
 * 旧标签被 KeepAlive 从 DOM 摘走进缓存后，leave 的 transitionend 永远不会触发，
 * mode="out-in" 就会一直卡在占位注释上（整块白屏）；交叉模式又会让带 leave 样式的
 * 缓存节点在切回来时仍是 transparent。独立动画不参与卸载流程，最稳。
 */
function playTabEnter() {
  const el = stage.value
  if (!el?.animate) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate(
    [
      { opacity: 0.15, transform: 'translateY(4px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 180, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
  )
}

watch(tab, async () => {
  await nextTick()
  const viewport = (scrollArea.value?.$el as HTMLElement | undefined)?.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')
  viewport?.scrollTo({ top: 0 })
  playTabEnter()
})

function startResize() {
  dragging.value = true
  document.body.style.cursor = 'col-resize'
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

function onResize(event: MouseEvent) {
  const box = props.containerEl?.getBoundingClientRect()
  if (!box) return
  const pct = ((box.right - event.clientX) / box.width) * 100
  panelWidth.value = Math.min(MAX_PANEL_PCT, Math.max(MIN_PANEL_PCT, Math.round(pct)))
  localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth.value))
}

function stopResize() {
  dragging.value = false
  document.body.style.cursor = ''
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}

onBeforeUnmount(() => {
  stopResize()
  clearBodyTimer()
})
</script>

<template>
  <!-- 拖拽分隔条：收起时宽度归零，不占位也不可拖 -->
  <div
    class="sp-handle shrink-0 cursor-col-resize bg-neutral-200 hover:bg-neutral-400"
    :class="[panelOpen ? 'w-1 opacity-100' : 'pointer-events-none w-0 opacity-0', dragging ? 'bg-neutral-400' : '']"
    role="separator"
    aria-orientation="vertical"
    title="拖拽调整侧边栏宽度"
    @mousedown.prevent="startResize"
  />

  <aside
    class="sp-aside relative flex min-h-0 shrink-0 flex-col overflow-hidden border-l bg-[#fafafa]"
    :data-open="panelOpen ? 'true' : 'false'"
    :data-dragging="dragging ? 'true' : 'false'"
    :style="{ width: panelOpen ? `${panelWidth}%` : '2.75rem' }"
  >
    <Transition name="sp-body">
      <div v-if="bodyVisible" class="sp-body flex min-h-0 flex-1 flex-col">
        <div class="flex h-11 shrink-0 items-center justify-between border-b px-3">
          <nav class="flex items-center gap-1 text-sm" aria-label="侧边栏标签">
            <button
              v-for="item in tabs"
              :key="item.key"
              :aria-current="tab === item.key ? 'page' : undefined"
              :class="['rounded-md px-2.5 py-1 transition-colors', tab === item.key ? 'bg-[#eaeaea] font-medium' : 'text-neutral-500 hover:bg-black/5']"
              @click="openTab(item.key)"
            >{{ item.label }}</button>
          </nav>
          <Button variant="ghost" size="icon" aria-label="收起侧边栏" title="收起侧边栏" @click="closePanel"><PanelRightClose /></Button>
        </div>

        <ScrollArea ref="scrollArea" class="min-h-0 flex-1" viewport-class="p-4">
          <!--
            标签实例用 KeepAlive 缓存：切回来不重挂、不重拉，是否过期由各标签的 useTabRefresh 判断。
            切换动效挂在 stage 上，由 playTabEnter 播放（不能套 Transition，原因见函数注释）。
          -->
          <div ref="stage">
            <KeepAlive :key="applicationId" :max="7">
              <component :is="activeComponent" :key="tab" v-bind="activeProps" />
            </KeepAlive>
          </div>
        </ScrollArea>
      </div>
    </Transition>

    <!-- 收起后的窄轨：铺在面板右侧，展开时淡出并让出点击 -->
    <div
      class="sp-rail absolute inset-y-0 right-0 flex w-11 flex-col items-center overflow-hidden bg-[#fafafa] pt-1 pb-2"
      :class="panelOpen ? 'pointer-events-none opacity-0' : 'opacity-100'"
    >
      <Button variant="ghost" size="icon" aria-label="展开侧边栏" title="展开侧边栏" @click="openPanel"><PanelRightOpen /></Button>
    </div>
  </aside>
</template>

<style scoped>
/* 与左侧导航同一条缓动曲线：宽度真正在动，而不是换一块 DOM */
.sp-aside {
  transition: width 320ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* 拖拽跟手，不能有 320ms 的延迟 */
.sp-aside[data-dragging='true'] {
  transition: none;
}

.sp-handle {
  transition:
    width 320ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 200ms ease,
    background-color 150ms ease;
}

.sp-rail {
  transition: opacity 220ms ease 60ms;
}

/* 收起：内容快速淡出并轻微右移，把舞台让给窄轨 */
.sp-aside[data-open='false'] .sp-body {
  opacity: 0;
  transform: translateX(10px);
  pointer-events: none;
  transition:
    opacity 120ms ease,
    transform 320ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* 展开：等宽度铺开一点再淡入内容 */
.sp-body-enter-active {
  transition:
    opacity 200ms ease 120ms,
    transform 320ms cubic-bezier(0.32, 0.72, 0, 1) 120ms;
}

.sp-body-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

@media (prefers-reduced-motion: reduce) {
  .sp-aside,
  .sp-handle,
  .sp-rail,
  .sp-body,
  .sp-body-enter-active {
    transition-duration: 1ms !important;
    transition-delay: 0ms !important;
  }
}
</style>
