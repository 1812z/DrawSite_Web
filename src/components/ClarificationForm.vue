<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import type { Clarification, DetailAnswer } from '@/api/agent'

const props = defineProps<{ item: Clarification; submitting?: boolean; error?: string }>()
const emit = defineEmits<{ submit: [answers: DetailAnswer[]] }>()
const answers = ref<DetailAnswer[]>([])
watch(() => props.item.id, () => {
  answers.value = props.item.questions.map((_, questionIndex) => ({ questionIndex, selectedOptions: [], customText: '' }))
}, { immediate: true })
const complete = computed(() => answers.value.length === props.item.questions.length
  && answers.value.every(answer => answer.selectedOptions.length > 0 || answer.customText.trim().length > 0))
function toggle(index: number, option: string) {
  const answer = answers.value[index]
  if (!answer || props.submitting) return
  answer.selectedOptions = answer.selectedOptions.includes(option)
    ? answer.selectedOptions.filter(value => value !== option) : [...answer.selectedOptions, option]
}
</script>

<template>
  <form class="mt-3 space-y-4 rounded-xl border bg-white p-4" @submit.prevent="complete && emit('submit', answers)">
    <div>
      <p class="text-sm font-medium">询问细节</p>
      <p class="mt-1 text-xs text-neutral-500">请回答全部问题后一起提交，AI 会继续当前任务。候选项可多选，也可补充自定义需求。</p>
    </div>
    <div v-for="(question, index) in item.questions" :key="index" class="space-y-2">
      <p class="text-sm">{{ index + 1 }}. {{ question.question }}</p>
      <div v-if="question.options.length" class="flex flex-wrap gap-2">
        <button v-for="option in question.options" :key="option" type="button" :disabled="submitting"
          :aria-pressed="answers[index]?.selectedOptions.includes(option)"
          :class="['rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50', answers[index]?.selectedOptions.includes(option) ? 'border-neutral-800 bg-neutral-800 text-white' : 'hover:bg-neutral-100']"
          @click="toggle(index, option)">{{ option }}</button>
      </div>
      <textarea v-if="answers[index]" v-model="answers[index]!.customText" :disabled="submitting" maxlength="4000" rows="2"
        :aria-label="`第 ${index + 1} 题自定义需求`" placeholder="输入自定义需求或补充说明"
        class="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:opacity-50" />
    </div>
    <p v-if="error" role="alert" class="text-xs text-red-600">{{ error }}</p>
    <Button type="submit" size="sm" :disabled="!complete || submitting">{{ submitting ? '提交中…' : '提交全部回答并继续' }}</Button>
  </form>
</template>
