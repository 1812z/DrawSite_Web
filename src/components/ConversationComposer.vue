<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import RequirementComposer from '@/components/RequirementComposer.vue'
import SelectedElementCard from '@/components/SelectedElementCard.vue'
import ToolPicker from '@/components/ToolPicker.vue'
import * as agentApi from '@/api/agent'
import { describeError } from '@/lib/errors'
import { useToolCache } from '@/lib/tool-cache'
import type { ReasoningEffort } from '@/api/agent'
import type { PublicModel } from '@/api/settings'
import type { SelectedElement } from '@/lib/preview-selector'

/**
 * 会话底部输入区：输入框 + 模型 / 思考强度 / 工具 / 记忆。
 * 切换会话时它保持挂载，工具目录只拉一次、模型与工具的勾选也保留；
 */
const props = defineProps<{
  draft: string
  modelId: string
  memoryEnabled: boolean
  /** 平台公开的模型配置 */
  models: PublicModel[]
  settingsLoaded: boolean
  /** 有任务在进行（发送中 / 生成中 / 压缩上下文）：整体禁用输入与选项 */
  submitting: boolean
  disabled: boolean
  /** 仅“正在生成回复”，用来切换停止按钮与提示文案 */
  running: boolean
  stopping: boolean
  error: string
  selectedElement: SelectedElement | null
}>()

/** 提交时一并下发本次的调用选项，父级不再需要自己拼 */
interface ComposerSubmit {
  content: string
  reasoningEffort?: ReasoningEffort
  toolsEnabled?: boolean
  toolNames?: string[]
}

const emit = defineEmits<{
  'update:draft': [value: string]
  'update:modelId': [value: string]
  'update:memoryEnabled': [value: boolean]
  submit: [payload: ComposerSubmit]
  stop: []
  'cancel-element': []
}>()

const draftValue = computed({ get: () => props.draft, set: (value: string) => emit('update:draft', value) })
const modelIdValue = computed({ get: () => props.modelId, set: (value: string) => emit('update:modelId', value) })
const memoryValue = computed({ get: () => props.memoryEnabled, set: (value: boolean) => emit('update:memoryEnabled', value) })

const selectedModel = computed(() => props.models.find((item) => item.id === props.modelId) ?? null)
const hasModel = computed(() => props.models.length > 0)
const modelOptions = computed(() => props.models.map((model) => ({ value: model.id, label: model.displayName })))
const canUseReasoning = computed(() => Boolean(selectedModel.value?.supportsReasoning))
const canUseTools = computed(() => Boolean(selectedModel.value?.supportsTools))

// 思考强度只在本组件内维护：切换会话不影响，切模型时按支持情况自动停用
const reasoningEffort = ref<ReasoningEffort>('DEFAULT')
const REASONING_OPTIONS = [
  { value: 'DEFAULT', label: '默认' },
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
]
/** Select 的 v-model 是 string，这里转回联合类型，避免下拉写入越界值。 */
const reasoningEffortValue = computed({
  get: () => reasoningEffort.value,
  set: (value: string) => {
    reasoningEffort.value = value as ReasoningEffort
  },
})

/**
 * 工具目录与勾选放在模块缓存里（见 lib/tool-cache）：目录与具体会话/应用无关，
 * 组件万一被重建也不会重新请求、不会丢勾选。
 */
const { toolCatalog, toolsLoading, toolsError, selectedToolIds } = useToolCache()
/**
 * 没有总开关，工具是自动开关：模型支持工具、且至少勾选一个模块，才算本次开启。
 * 两个条件缺一就完全不下发 toolsEnabled / toolNames——模型没开 supportsTools 时下发会直接 400。
 */
const effectiveToolsEnabled = computed(() => canUseTools.value && selectedToolIds.value.length > 0)

const hint = computed(() => {
  if (props.running) return '正在生成回复，可点击“停止”中断'
  if (props.submitting) return '提交中…'
  if (!props.settingsLoaded) return '正在加载模型配置…'
  if (!hasModel.value) return '平台未配置可用模型'
  if (props.disabled) return '请选择会话并等待消息加载完成'
  return 'Enter 发送，Shift + Enter 换行'
})

async function loadTools() {
  toolsLoading.value = true
  toolsError.value = ''
  try {
    const tools = await agentApi.listTools()
    toolCatalog.value = tools
    const ids = new Set(tools.map((tool) => tool.id))
    selectedToolIds.value = selectedToolIds.value.length === 0
      ? tools.map((tool) => tool.id)
      : selectedToolIds.value.filter((id) => ids.has(id))
  } catch (cause) {
    toolCatalog.value = []
    toolsError.value = describeError(cause, '加载工具列表失败')
  } finally {
    toolsLoading.value = false
  }
}

function buildPayload(content: string): ComposerSubmit {
  return {
    content,
    reasoningEffort: canUseReasoning.value && reasoningEffort.value !== 'DEFAULT' ? reasoningEffort.value : undefined,
    toolsEnabled: effectiveToolsEnabled.value ? true : undefined,
    toolNames: effectiveToolsEnabled.value ? selectedToolIds.value : undefined,
  }
}

function handleSubmit(content: string) {
  const text = content.trim()
  if (!text || props.disabled || props.submitting) return
  emit('submit', buildPayload(text))
}

/** 供父级程序化提交（如首页带入的需求）：可显式传入内容，否则用输入框当前值 */
function submitCurrent(content?: string) {
  handleSubmit(content ?? props.draft)
}

defineExpose({ submit: submitCurrent })

/** 目录已在模块缓存里就直接用（重建不重拉）；首次进入或上次失败才请求 */
onMounted(() => {
  if (toolsLoading.value || toolCatalog.value.length > 0) return
  void loadTools()
})
</script>

<template>
  <div class="shrink-0 bg-background pt-3 pb-6">
    <p v-if="settingsLoaded && !hasModel" role="status" class="mb-3 rounded-lg border border-dashed px-4 py-3 text-xs leading-6 text-muted-foreground">平台尚未配置可用模型。管理员在“设置 → 平台管理”添加并启用模型后即可开始对话。</p>
    <SelectedElementCard v-if="selectedElement" :key="selectedElement.url + selectedElement.selector" class="mb-2" :element="selectedElement" cancellable @cancel="emit('cancel-element')" />
    <RequirementComposer
      v-model="draftValue"
      heading="这个会话，想构建什么？"
      subheading="描述应用需求，提交后由所选模型生成回复。"
      :show-intro="false"
      :hint="hint"
      :disabled="disabled || submitting"
      :running="running"
      :stopping="stopping"
      @submit="handleSubmit"
      @stop="emit('stop')"
    >
      <template #toolbar>
        <Select
          v-model="modelIdValue"
          :items="modelOptions"
          :disabled="submitting || !hasModel"
          placeholder="未配置模型"
          aria-label="选择模型"
          class="h-8 w-32 px-2 text-xs"
        />
        <Select
          v-model="reasoningEffortValue"
          :items="REASONING_OPTIONS"
          :disabled="submitting || !canUseReasoning"
          aria-label="思考强度"
          class="h-8 w-16 px-2 text-xs"
        />
        <ToolPicker
          :tools="toolCatalog"
          :loading="toolsLoading"
          :error="toolsError"
          :supported="canUseTools"
          :enabled="effectiveToolsEnabled"
          :disabled="submitting"
          v-model:selected="selectedToolIds"
        />
        <label
          class="flex cursor-pointer items-center gap-2 text-xs text-neutral-500"
          title="开启：注入你的全局记忆，并允许 AI 读取和更新项目记忆 AGENTS.md。关闭：都不注入，且 AI 看不到、也改不了 AGENTS.md。"
        >
          <Switch v-model="memoryValue" :disabled="submitting" />
          记忆
        </label>
      </template>
    </RequirementComposer>
    <p v-if="error" role="alert" class="mt-3 text-xs text-red-600">{{ error }}</p>
  </div>
</template>
