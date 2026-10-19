<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import Toaster from '@/components/ui/sonner.vue'

const route = useRoute()
</script>

<template>
  <component :is="route.meta.public ? 'div' : AppLayout">
    <RouterView />
  </component>
  <Toaster />
</template>
