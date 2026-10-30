<script setup lang="ts">
/**
 * 工作台首页：用户把需求写进输入框，回车即开始。
 *
 * 提交后自动串起三步（全部复用现有后端接口，不改后端）：
 * 1. `POST /applications` —— 后端同步初始化工作区，返回时状态已是 READY；
 * 2. `POST /applications/{id}/conversations` —— 建一个「新建会话」；
 * 3. 需求写入 sessionStorage，跳到应用工作区由它作为第一条消息发出。
 */
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RequirementComposer from '@/components/RequirementComposer.vue'
import { createApplication } from '@/api/applications'
import { savePendingPrompt } from '@/lib/pendingPrompt'
import { describeError } from '@/lib/errors'
import { useWorkspaceStore } from '@/stores/workspace'

const DRAFT_KEY = 'drawsite:requirement-draft'
/** 后端 application.name 上限 100，取短一些更适合当标题 */
const NAME_MAX = 30
/** 后端 application.description 上限 2000 */
const DESCRIPTION_MAX = 2000

const router = useRouter()
const workspace = useWorkspaceStore()

const draft = ref(sessionStorage.getItem(DRAFT_KEY) ?? '')
const creating = ref(false)
const stage = ref('')
const error = ref('')

/** 浏览器会话内自动保存草稿，刷新不丢。 */
watch(draft, (value) => {
  if (value.trim()) sessionStorage.setItem(DRAFT_KEY, value)
  else sessionStorage.removeItem(DRAFT_KEY)
})

/** 从需求里截出应用名：取第一段有效文本，去掉 Markdown 前缀，过长截断。 */
function deriveName(content: string): string {
  const line = content
    .split(/\r?\n/)
    .map((item) => item.replace(/^[\s>#*+\-\d.、)]+/, '').trim())
    .find((item) => item.length > 0) ?? ''
  const name = line.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim()
  return name || '未命名应用'
}

async function submit(content: string) {
  if (creating.value) return
  const text = content.trim()
  if (!text) return
  creating.value = true
  error.value = ''
  stage.value = '正在创建应用…'
  // 应用已建成但会话没建成时要区别提示，否则用户会误以为应用没创建成功
  let createdId = ''
  try {
    const application = await createApplication({
      name: deriveName(text),
      description: text.slice(0, DESCRIPTION_MAX),
    })
    createdId = application.id
    stage.value = '正在创建会话…'
    const conversation = await workspace.createConversation(application.id)
    savePendingPrompt({ applicationId: application.id, conversationId: conversation.id, content: text })
    sessionStorage.removeItem(DRAFT_KEY)
    draft.value = ''
    void workspace.refreshApplications()
    await router.push({
      name: 'application-detail',
      params: { id: application.id },
      query: { conversation: conversation.id },
    })
  } catch (cause) {
    // 失败时不动输入框，用户写好的一段话不能丢
    const reason = describeError(cause, createdId ? '创建会话失败' : '创建应用失败')
    if (createdId) {
      error.value = `应用已创建，但${reason}。可从「我的应用」进入后手动新建会话，需求仍保留在输入框。`
      void workspace.refreshApplications()
    } else {
      error.value = reason
    }
  } finally {
    creating.value = false
    stage.value = ''
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <section class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 pt-8 pb-16 md:pb-28">
      <RequirementComposer
        v-model="draft"
        :disabled="creating"
        @submit="submit"
      />
      <p v-if="stage" role="status" class="mt-3 text-xs leading-6 text-muted-foreground">{{ stage }}</p>
      <p v-if="error" role="alert" class="mt-3 text-xs leading-6 text-red-600">{{ error }}</p>
    </section>
  </div>
</template>
