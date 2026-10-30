<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RotateCw, Undo2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { getGitTree, getGitStatus, rollbackGit, commitGit } from '@/api/applications'
import type { GitHistory, GitState } from '@/api/applications'

const props = defineProps<{ applicationId: string; running: boolean }>()
const emit = defineEmits<{ restored: [] }>()
const history = ref<GitHistory | null>(null)
const state = ref<GitState | null>(null)
const loading = ref(false)
const restoring = ref('')
const error = ref('')
const notice = ref('')
const limit = ref(100)
const selected = ref<string[]>([])
const message = ref('feat: ')
const committing = ref(false)
async function load() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const [tree, status] = await Promise.all([getGitTree(props.applicationId, limit.value), getGitStatus(props.applicationId)])
    history.value = tree
    state.value = status
    selected.value = selected.value.filter(path => status.changed.includes(path))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '加载版本失败' }
  finally { loading.value = false }
}
async function restore(hash: string) {
  if (!history.value || restoring.value || props.running) return
  restoring.value = hash
  error.value = ''
  notice.value = ''
  try {
    await rollbackGit(props.applicationId, hash, history.value.head)
    notice.value = '已恢复目标版本，并创建新的回滚提交'
    emit('restored')
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '回滚失败' }
  finally { restoring.value = '' }
}
onMounted(load)
async function commit() {
  if (!state.value || !selected.value.length || committing.value || props.running) return
  committing.value = true
  error.value = ''
  try {
    await commitGit(props.applicationId, message.value, state.value.head, selected.value)
    selected.value = []
    notice.value = '已提交所选文件'
    await load()
    emit('restored')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '提交失败' }
  finally { committing.value = false }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h3 class="text-sm font-medium">Git 版本树</h3>
        <p v-if="history" class="mt-1 font-mono text-[11px] text-neutral-400">{{ history.branch }} · {{ history.head.slice(0, 8) }}</p>
      </div>
      <Button size="icon" variant="secondary" class="size-8 bg-neutral-100 hover:bg-neutral-200" aria-label="刷新版本" title="刷新版本" :disabled="loading || !!restoring || committing" @click="load"><RotateCw :class="['size-4', loading ? 'animate-spin' : '']" /></Button>
    </div>
    <p v-if="error" role="alert" class="text-xs leading-6 text-red-600">{{ error }}</p>
    <p v-if="notice" role="status" class="text-xs leading-6 text-neutral-600">{{ notice }}</p>
    <div v-if="state && !state.clean" class="space-y-3 rounded-xl border p-3 text-xs text-neutral-600">
      <div class="flex items-center justify-between">
        <span>{{ state.changed.length }} 个未提交代码文件</span>
        <button class="rounded bg-neutral-100 px-2 py-1 hover:bg-neutral-200" :disabled="committing" @click="selected = selected.length === state.changed.length ? [] : [...state.changed]">{{ selected.length === state.changed.length ? '取消全选' : '全选' }}</button>
      </div>
      <div class="max-h-60 space-y-2 overflow-auto">
        <label v-for="path in state.changed" :key="path" class="flex cursor-pointer items-start gap-2 break-all font-mono text-[11px]">
          <input v-model="selected" type="checkbox" :value="path" :disabled="committing || running" class="mt-0.5 accent-neutral-800" />{{ path }}
        </label>
      </div>
      <input v-model="message" maxlength="200" placeholder="feat: 功能说明 / fix: 修复说明" aria-label="提交说明" class="w-full rounded-lg border px-3 py-2 text-xs" :disabled="committing" />
      <Button size="sm" class="w-full" :disabled="!selected.length || committing || running || !!restoring" @click="commit">{{ committing ? '提交中…' : `提交所选文件（${selected.length}）` }}</Button>
    </div>
    <p class="text-[11px] leading-5 text-neutral-400">回滚保留历史；未提交修改会先自动保存为快照。项目运行任务时不能回滚。</p>
    <ol v-if="history" class="ml-2 border-l border-neutral-300">
      <li v-for="commit in history.commits" :key="commit.hash" class="relative pb-5 pl-5">
        <span :class="['absolute -left-[5px] top-3 size-2 rounded-full border', commit.head ? 'border-neutral-900 bg-neutral-900' : 'border-neutral-400 bg-white']" />
        <div class="rounded-xl border bg-white p-3">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs">{{ commit.hash.slice(0, 8) }}</span>
            <span v-if="commit.head" class="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px]">HEAD</span>
            <Button v-if="!commit.head" size="sm" class="ml-auto h-7 gap-1.5 bg-neutral-800 px-2.5 text-[11px] text-white hover:bg-neutral-700" :disabled="running || !!restoring || loading || committing" @click="restore(commit.hash)"><Undo2 class="size-3" />{{ restoring === commit.hash ? '回滚中…' : '回滚到此版本' }}</Button>
          </div>
          <p class="mt-2 whitespace-pre-wrap break-words text-xs leading-5">{{ commit.message }}</p>
          <p class="mt-2 text-[10px] text-neutral-400">{{ commit.author }} · {{ new Date(commit.createdAt).toLocaleString('zh-CN') }}</p>
          <p v-if="commit.parents.length" class="mt-1 break-all font-mono text-[10px] text-neutral-400">父节点 {{ commit.parents.map(parent => parent.slice(0, 8)).join(' · ') }}</p>
        </div>
      </li>
    </ol>
    <Button v-if="history?.truncated && limit < 500" variant="outline" size="sm" class="w-full" @click="limit += 100; load()">加载更多</Button>
  </section>
</template>
