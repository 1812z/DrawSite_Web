<script setup lang="ts">
import { ref } from 'vue'
import RequirementComposer from '@/components/RequirementComposer.vue'

const draft = ref(sessionStorage.getItem('drawsite:requirement-draft') ?? '')
const notice = ref('')

function saveDraft(content: string) {
  draft.value = content
  sessionStorage.setItem('drawsite:requirement-draft', draft.value)
  notice.value = '草稿已保存在当前浏览器会话中。创建应用后，可把它作为会话的第一条消息提交。'
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <section class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 pt-8 pb-16 md:pb-28">
      <RequirementComposer v-model="draft" hint="需求草稿 · 尚未接入 AI" @submit="saveDraft" />
      <p v-if="notice" role="status" class="mt-3 text-xs leading-6 text-muted-foreground">{{ notice }}</p>
    </section>
  </div>
</template>
