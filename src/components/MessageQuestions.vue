<script setup lang="ts">
import ClarificationForm from '@/components/ClarificationForm.vue'
import type { Clarification, DetailAnswer } from '@/api/agent'
defineProps<{ items: Clarification[]; submitting: boolean; error: string }>()
defineEmits<{ submit: [item: Clarification, answers: DetailAnswer[]] }>()
</script>

<template>
  <div v-for="item in items" :key="item.id" class="mt-3 w-full">
    <ClarificationForm v-if="item.status === 'PENDING'" :item="item" :submitting="submitting" :error="error" @submit="$emit('submit', item, $event)" />
    <details v-else class="rounded-lg border px-3 py-2 text-left text-xs text-neutral-500">
      <summary class="cursor-pointer">{{ item.status === 'ANSWERED' ? '已回答询问细节' : '询问已停止' }}</summary>
      <div v-for="(question, index) in item.questions" :key="index" class="mt-3 space-y-1">
        <p>{{ question.question }}</p>
        <p>{{ item.answers.find(answer => answer.questionIndex === index)?.selectedOptions.join('、') }}</p>
        <p class="whitespace-pre-wrap">{{ item.answers.find(answer => answer.questionIndex === index)?.customText }}</p>
      </div>
    </details>
  </div>
</template>
