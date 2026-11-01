<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
const props = defineProps<{ hasMore: boolean; loading: boolean; error?: string; compact?: boolean; count?: number; hideSkeleton?: boolean }>()
const emit = defineEmits<{ load: [] }>()
const target = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let visible = false
let disposed = false
function check() { if (!disposed && visible && props.hasMore && !props.loading && !props.error) emit('load') }
onMounted(() => {
  observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; check() }, { rootMargin: '120px' })
  if (target.value) observer.observe(target.value)
})
watch(() => [props.loading, props.hasMore, props.count], async () => { await nextTick(); check() })
onUnmounted(() => { disposed = true; observer?.disconnect() })
</script>
<template>
  <div ref="target" class="min-h-px">
    <div v-if="(hasMore || loading) && !hideSkeleton" role="status" aria-label="正在加载更多条目" :class="compact ? 'space-y-2 py-2' : 'space-y-3 py-3'">
      <div v-for="n in compact ? 3 : 4" :key="n" :class="['animate-pulse rounded-lg bg-neutral-200/60 motion-reduce:animate-none', compact ? 'h-7' : 'h-28']" />
    </div>
    <button v-if="error" type="button" class="py-2 text-xs text-red-600" @click="emit('load')">{{ error }} · 点击重试</button>
  </div>
</template>
