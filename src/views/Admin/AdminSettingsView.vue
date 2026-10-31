<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { LoaderCircle, Pencil, Plus, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import RefreshButton from '@/components/RefreshButton.vue'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ApiError } from '@/lib/http'
import * as settingsApi from '@/api/settings'
import type { AdminModelView, AdminSettings, ModelConfig } from '@/api/settings'

const loading = ref(true)
const loadError = ref('')
const settings = ref<AdminSettings | null>(null)
const saving = ref(false)

// 模型编辑对话框
const modelDialogOpen = ref(false)
const editingId = ref<string | null>(null)
const editingKeyConfigured = ref(false)
const deletingId = ref('')
const modelForm = reactive({
  id: '',
  displayName: '',
  provider: 'OPENAI_COMPATIBLE',
  modelName: '',
  baseUrl: '',
  apiKey: '',
  enabled: true,
  supportsTools: true,
  temperature: '0.2',
  timeoutSeconds: '120',
  supportsReasoning: false,
})
const modelFormError = ref('')

const PROVIDER_OPTIONS = [{ value: 'OPENAI_COMPATIBLE', label: 'OPENAI_COMPATIBLE' }]

/** 默认模型只能从已启用的模型中选择。 */
const enabledModelOptions = computed(() =>
  (settings.value?.models ?? [])
    .filter((model) => model.enabled)
    .map((model) => ({ value: model.id, label: `${model.displayName}（${model.id}）` })),
)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    settings.value = await settingsApi.getAdminSettings()
  } catch (cause) {
    loadError.value = cause instanceof Error ? cause.message : '加载平台设置失败'
  } finally {
    loading.value = false
  }
}

/**
 * 读取视图转提交体。读取视图只有 apiKeyConfigured，不含 apiKey；
 * 提交体省略 apiKey 表示保留服务端已存密钥，新建或换密钥时才带上。
 */
function currentConfigs(): ModelConfig[] {
  return (settings.value?.models ?? []).map((model) => ({
    id: model.id,
    displayName: model.displayName,
    provider: model.provider,
    modelName: model.modelName,
    baseUrl: model.baseUrl,
    enabled: model.enabled,
    supportsTools: model.supportsTools,
    temperature: model.temperature,
    timeoutSeconds: model.timeoutSeconds,
    supportsReasoning: model.supportsReasoning ?? null,
  }))
}

/**
 * 默认模型不再让管理员选择：保留仍有效的当前值，否则取第一个启用的模型。
 * 后端要求启用模型时默认项必须存在且启用，全部禁用时才允许为空。
 */
function resolveDefaultModelId(models: ModelConfig[], preferred: string | null): string | null {
  const enabled = models.filter((model) => model.enabled)
  if (enabled.length === 0) return null
  if (preferred && enabled.some((model) => model.id === preferred)) return preferred
  return enabled[0].id
}

/** 每次改动立即整体提交；versions 取自最近一次响应，避免乐观锁冲突。成功与失败均以 toast 提示。 */
async function persist(
  next: { registrationEnabled: boolean; models: ModelConfig[]; defaultModelId: string | null },
  notice: string,
): Promise<boolean> {
  const current = settings.value
  if (!current || saving.value) return false
  saving.value = true
  try {
    settings.value = await settingsApi.updateAdminSettings({
      registrationEnabled: next.registrationEnabled,
      models: next.models,
      defaultModelId: resolveDefaultModelId(next.models, next.defaultModelId),
      versions: current.versions,
    })
    toast.success(notice)
    return true
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'SETTINGS_CONFLICT') {
      toast.error('配置已被其他管理员修改，已重新加载最新配置，请重试。')
      void load()
    } else {
      toast.error(cause instanceof Error ? cause.message : '保存失败')
    }
    return false
  } finally {
    saving.value = false
  }
}

/** 注册开关由服务端值驱动，失败时开关保持原位。 */
async function changeRegistration(value: boolean) {
  const current = settings.value
  if (!current || saving.value) return
  await persist(
    { registrationEnabled: value, models: currentConfigs(), defaultModelId: current.defaultModelId },
    value ? '已开放新用户注册。' : '已关闭新用户注册。',
  )
}

/** 默认模型由管理员选择，改动立即提交。 */
async function changeDefaultModel(value: string) {
  const current = settings.value
  if (!current || saving.value) return
  await persist(
    { registrationEnabled: current.registrationEnabled, models: currentConfigs(), defaultModelId: value },
    '默认模型已更新。',
  )
}

function openCreateModel() {
  editingId.value = null
  editingKeyConfigured.value = false
  Object.assign(modelForm, {
    id: '',
    displayName: '',
    provider: 'OPENAI_COMPATIBLE',
    modelName: '',
    baseUrl: '',
    apiKey: '',
    enabled: true,
    supportsTools: true,
    temperature: '0.2',
    timeoutSeconds: '120',
    supportsReasoning: false,
  })
  modelFormError.value = ''
  modelDialogOpen.value = true
}

function openEditModel(model: AdminModelView) {
  editingId.value = model.id
  editingKeyConfigured.value = model.apiKeyConfigured
  Object.assign(modelForm, {
    id: model.id,
    displayName: model.displayName,
    provider: model.provider,
    modelName: model.modelName,
    baseUrl: model.baseUrl,
    apiKey: '', // 服务端不回传明文，编辑时留空表示保留原密钥
    enabled: model.enabled,
    supportsTools: model.supportsTools,
    temperature: String(model.temperature),
    timeoutSeconds: String(model.timeoutSeconds),
    supportsReasoning: Boolean(model.supportsReasoning),
  })
  modelFormError.value = ''
  modelDialogOpen.value = true
}

function validateModel(): string {
  const m = modelForm
  if (!/^[a-zA-Z0-9_:.-]{1,64}$/.test(m.id)) return '模型 ID 应为 1–64 位字母、数字、下划线、连字符、冒号或点'
  if (!m.displayName.trim() || m.displayName.trim().length > 100) return '模型名称必填且不超过 100 字符'
  if (m.provider !== 'OPENAI_COMPATIBLE') return '提供商当前仅支持 OPENAI_COMPATIBLE'
  if (!m.modelName.trim() || m.modelName.trim().length > 200) return '显示名称必填且不超过 200 字符'
  if (m.apiKey.length > 4096) return '密钥过长，最多 4096 字符'
  // 启用时必须保证有密钥：新模型必须填写；编辑已有模型时留空则沿用原密钥
  if (m.enabled && !m.apiKey.trim() && !(editingId.value !== null && editingKeyConfigured.value)) {
    return '启用模型必须填写 API 密钥'
  }
  if (currentConfigs().some((model) => model.id === m.id && model.id !== editingId.value)) {
    return '模型 ID 已存在，请换一个标识'
  }
  let url: URL
  try {
    url = new URL(m.baseUrl)
  } catch {
    return '接口地址必须是合法的 HTTP(S) URL'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '接口地址必须是 HTTP(S) 协议'
  if (url.username || url.password || url.search || url.hash) return '接口地址不能包含凭据、查询参数或片段'
  const temperature = Number(m.temperature)
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) return '温度取值应为 0–2'
  const timeout = Number(m.timeoutSeconds)
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600) return '超时时间应为 1–600 秒'
  return ''
}

/** 保存即提交，不再依赖页面级保存按钮。 */
async function saveModel() {
  const current = settings.value
  if (!current || saving.value) return
  const error = validateModel()
  if (error) {
    modelFormError.value = error
    return
  }
  const key = modelForm.apiKey.trim()
  const config: ModelConfig = {
    id: modelForm.id,
    displayName: modelForm.displayName.trim(),
    provider: modelForm.provider,
    modelName: modelForm.modelName.trim(),
    baseUrl: modelForm.baseUrl.trim(),
    enabled: modelForm.enabled,
    supportsTools: modelForm.supportsTools,
    temperature: Number(modelForm.temperature),
    timeoutSeconds: Number(modelForm.timeoutSeconds),
    supportsReasoning: modelForm.supportsReasoning,
  }
  if (key) config.apiKey = key

  const models = currentConfigs()
  if (editingId.value !== null) {
    const index = models.findIndex((model) => model.id === editingId.value)
    if (index < 0) {
      modelFormError.value = '该模型已不存在，请关闭后重新加载。'
      return
    }
    models[index] = config
  } else {
    models.push(config)
  }

  modelFormError.value = ''
  const ok = await persist(
    { registrationEnabled: current.registrationEnabled, models, defaultModelId: current.defaultModelId },
    '模型已保存。',
  )
  if (ok) modelDialogOpen.value = false
}

async function removeModel(model: AdminModelView) {
  const current = settings.value
  if (!current || saving.value) return
  const models = currentConfigs().filter((item) => item.id !== model.id)
  const ok = await persist(
    { registrationEnabled: current.registrationEnabled, models, defaultModelId: current.defaultModelId },
    '模型已删除。',
  )
  if (ok) deletingId.value = ''
}

onMounted(load)
</script>

<template>
  <section class="mx-auto w-full max-w-4xl px-6 py-10">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-medium tracking-tight">平台设置</h1>
        <p class="mt-3 text-sm text-muted-foreground">维护注册开关与可用模型。每次改动立即保存，密钥只存服务端，页面不展示明文。</p>
      </div>
      <RefreshButton variant="outline" class="size-8" :loading="loading" label="重新加载设置" @click="load" />
    </div>

    <div v-if="loading" class="mt-10 flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><LoaderCircle class="animate-spin" />正在加载设置…</div>
    <div v-else-if="loadError" class="mt-10 rounded-xl border p-8 text-center">
      <p class="text-sm text-red-600">{{ loadError }}</p>
      <RefreshButton variant="outline" class="mt-4 size-8" label="重新加载设置" @click="load" />
    </div>
    <template v-else-if="settings">
      <!-- 注册开关 -->
      <div class="mt-8 rounded-xl border p-6">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-sm font-medium">允许新用户注册</h2>
            <p class="mt-2 text-xs leading-6 text-muted-foreground">关闭后注册接口返回 403，不影响已有账号登录。登录页会根据公开配置隐藏注册入口。</p>
          </div>
          <div class="flex shrink-0 items-center gap-2.5">
            <span class="text-sm text-neutral-500">{{ settings.registrationEnabled ? '开启' : '关闭' }}</span>
            <Switch
              :model-value="settings.registrationEnabled"
              :disabled="saving"
              aria-label="允许新用户注册"
              @update:model-value="changeRegistration"
            />
          </div>
        </div>
      </div>

      <!-- 模型列表 -->
      <div class="mt-4 rounded-xl border p-6">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-sm font-medium">可用模型</h2>
            <p class="mt-2 text-xs leading-6 text-muted-foreground">最多 100 个；启用的模型才会出现在公共配置中，供对话任务选择。</p>
          </div>
          <Button variant="outline" size="sm" :disabled="saving" @click="openCreateModel"><Plus />添加模型</Button>
        </div>
        <div v-if="settings.models.length === 0" class="mt-5 rounded-lg border border-dashed p-6 text-center">
          <p class="text-sm text-neutral-400">尚未配置模型</p>
          <p class="mt-2 text-xs text-muted-foreground">添加并启用模型后，工作区才能发起对话。</p>
        </div>
        <div v-else class="mt-5 space-y-2.5">
          <div v-for="model in settings.models" :key="model.id" class="flex items-start justify-between gap-3 rounded-lg border p-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-medium">{{ model.displayName }}</p>
                <Badge :class="model.enabled ? 'border-neutral-800 text-neutral-800' : 'border-neutral-300 text-neutral-500'">{{ model.enabled ? '启用' : '禁用' }}</Badge>
                <Badge v-if="model.supportsTools" class="border-neutral-300 text-neutral-500">支持工具</Badge>
                <Badge v-if="model.supportsReasoning" class="border-neutral-300 text-neutral-500">支持推理</Badge>
                <Badge :class="model.apiKeyConfigured ? 'border-neutral-300 text-neutral-500' : 'border-red-300 text-red-600'">{{ model.apiKeyConfigured ? '密钥已配置' : '密钥未配置' }}</Badge>
                <Badge v-if="settings.defaultModelId === model.id" class="border-neutral-300 text-neutral-500">默认</Badge>
              </div>
              <p class="mt-1.5 font-mono text-xs text-neutral-400">{{ model.id }} · {{ model.modelName }}</p>
              <p class="mt-1 text-xs text-neutral-400">{{ model.baseUrl }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <template v-if="deletingId === model.id">
                <span class="mr-1 text-[11px] text-neutral-400">确认删除？</span>
                <Button variant="outline" size="sm" :disabled="saving" @click="deletingId = ''">取消</Button>
                <Button size="sm" :disabled="saving" @click="removeModel(model)"><LoaderCircle v-if="saving" class="animate-spin" /><Trash2 v-else />删除</Button>
              </template>
              <template v-else>
                <Button variant="ghost" size="icon" aria-label="编辑模型" title="编辑" :disabled="saving" @click="openEditModel(model)"><Pencil /></Button>
                <Button variant="ghost" size="icon" aria-label="删除模型" title="删除" :disabled="saving" @click="deletingId = model.id"><Trash2 /></Button>
              </template>
            </div>
          </div>
        </div>
        <div class="mt-5 border-t pt-5">
          <div class="max-w-sm space-y-1.5">
            <label for="default-model" class="text-xs text-muted-foreground">默认模型</label>
            <Select
              id="default-model"
              :model-value="settings.defaultModelId ?? ''"
              :items="enabledModelOptions"
              :disabled="saving || enabledModelOptions.length === 0"
              :placeholder="enabledModelOptions.length === 0 ? '无（全部禁用）' : '请选择默认模型'"
              @update:model-value="changeDefaultModel"
            />
            <p class="text-xs leading-5 text-neutral-400">启用任一模型时必须指定默认项；未指定时保存会自动取第一个启用的模型，全部禁用时为空。</p>
          </div>
        </div>
      </div>

      <!-- 模型编辑对话框 -->
      <Dialog :open="modelDialogOpen" :title="editingId !== null ? '编辑模型' : '添加模型'" @update:open="modelDialogOpen = $event">
        <form class="space-y-4" @submit.prevent="saveModel">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label for="model-id" class="text-xs text-muted-foreground">模型 ID</label>
              <Input id="model-id" v-model="modelForm.id" maxlength="64" placeholder="如 global:deepseek-v4.1-flash" />
            </div>
            <div class="space-y-1.5">
              <label for="model-displayName" class="text-xs text-muted-foreground">模型名称</label>
              <Input id="model-displayName" v-model="modelForm.displayName" maxlength="100" placeholder="如 deepseek-v4.1-flash" />
              <p class="text-xs leading-5 text-neutral-400">实际模型的名称，用于对话页面模型选择。</p>
            </div>
            <div class="space-y-1.5">
              <label for="model-modelName" class="text-xs text-muted-foreground">显示名称</label>
              <Input id="model-modelName" v-model="modelForm.modelName" maxlength="200" placeholder="如 DeepSeek V4.1 Flash" />
              <p class="text-xs leading-5 text-neutral-400">平台列表与默认模型选项中展示的友好名称。</p>
            </div>
            <div class="space-y-1.5">
              <label for="model-provider" class="text-xs text-muted-foreground">提供商</label>
              <Select id="model-provider" v-model="modelForm.provider" :items="PROVIDER_OPTIONS" />
            </div>
            <div class="space-y-1.5 sm:col-span-2">
              <label for="model-baseUrl" class="text-xs text-muted-foreground">接口地址</label>
              <Input id="model-baseUrl" v-model="modelForm.baseUrl" maxlength="1000" placeholder="https://provider.example/v1" />
            </div>
            <div class="space-y-1.5 sm:col-span-2">
              <label for="model-apiKey" class="text-xs text-muted-foreground">密钥</label>
              <Input id="model-apiKey" v-model="modelForm.apiKey" type="password" autocomplete="off" maxlength="4096" placeholder="填写 API 密钥" />
              <p class="text-xs leading-5 text-neutral-400">密钥直接保存在服务端；页面不展示明文。{{ editingId !== null && editingKeyConfigured ? '编辑时留空则保留已有密钥。' : '启用模型时必填。' }}</p>
            </div>
            <div class="space-y-1.5">
              <label for="model-temperature" class="text-xs text-muted-foreground">温度（0–2）</label>
              <Input id="model-temperature" v-model="modelForm.temperature" inputmode="decimal" placeholder="0.2" />
            </div>
            <div class="space-y-1.5">
              <label for="model-timeout" class="text-xs text-muted-foreground">超时时间（秒，1–600）</label>
              <Input id="model-timeout" v-model="modelForm.timeoutSeconds" inputmode="numeric" placeholder="120" />
            </div>
          </div>
          <div class="flex flex-wrap gap-x-6 gap-y-3 pt-1">
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <Switch v-model="modelForm.enabled" />启用
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <Switch v-model="modelForm.supportsTools" />支持工具调用
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <Switch v-model="modelForm.supportsReasoning" />支持推理
            </label>
          </div>
          <p v-if="modelFormError" role="alert" class="text-xs text-red-600">{{ modelFormError }}</p>
          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" :disabled="saving" @click="modelDialogOpen = false">取消</Button>
            <Button type="submit" :disabled="saving"><LoaderCircle v-if="saving" class="animate-spin" />保存</Button>
          </div>
        </form>
      </Dialog>
    </template>
  </section>
</template>
