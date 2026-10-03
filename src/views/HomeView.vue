<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUp, FileText, LayoutTemplate, ListChecks } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const draft = ref(sessionStorage.getItem('drawsite:requirement-draft') ?? '')
const notice = ref('')
const canSave = computed(() => draft.value.trim().length > 0)
const suggestions = [
  { title: '设计一个应用', description: '从目标、场景和业务需求开始', icon: LayoutTemplate, prompt: '我想开发一个应用，面向的用户是……，主要解决……问题，需要具备……功能。' },
  { title: '梳理需求', description: '把想法整理成清晰的需求说明', icon: FileText, prompt: '请帮助我分析下面的需求，明确业务场景、规则和验收条件：' },
  { title: '规划开发步骤', description: '明确模块、接口和验证目标', icon: ListChecks, prompt: '请根据以下应用需求，规划系统模块、数据实体、API 和测试目标：' },
]
function saveDraft() {
  if (!canSave.value) return
  sessionStorage.setItem('drawsite:requirement-draft', draft.value)
  notice.value = '草稿已保存在当前浏览器会话中。创建应用后，可把它作为会话的第一条消息提交。'
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 pt-8 pb-16 md:pb-28">
    <div class="mb-9"><p class="mb-3 text-sm text-muted-foreground">从一个想法开始</p><h1 class="text-3xl font-medium tracking-tight md:text-4xl">今天，想构建什么？</h1><p class="mt-4 text-sm leading-7 text-muted-foreground">描述你的应用，让需求、设计、实现与验证在同一个项目中持续推进。</p></div>
    <form class="rounded-2xl border bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]" @submit.prevent="saveDraft">
      <label for="requirement" class="sr-only">应用需求</label>
      <textarea id="requirement" v-model="draft" rows="4" maxlength="20000" placeholder="描述应用的使用场景、功能和你的想法…" class="w-full resize-y bg-transparent px-1 py-1 text-sm leading-7 outline-none placeholder:text-neutral-400" @input="notice = ''" />
      <div class="mt-3 flex items-center justify-between"><span class="text-xs text-muted-foreground">需求草稿 · 尚未接入 AI</span><Button type="submit" size="icon" class="rounded-full" :disabled="!canSave" aria-label="保存需求草稿"><ArrowUp /></Button></div>
    </form>
    <p v-if="notice" role="status" class="mt-3 text-xs leading-6 text-muted-foreground">{{ notice }}</p>
    <div class="mt-5 grid gap-3 sm:grid-cols-3">
      <button v-for="item in suggestions" :key="item.title" class="rounded-xl border p-4 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" @click="draft = item.prompt; notice = ''">
        <component :is="item.icon" class="mb-4 size-4 text-neutral-500" /><p class="text-sm font-medium">{{ item.title }}</p><p class="mt-2 text-xs leading-5 text-muted-foreground">{{ item.description }}</p>
      </button>
    </div>
  </section>
</template>
