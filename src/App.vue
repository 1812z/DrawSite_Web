<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'

const route = useRoute()
</script>

<template>
  <component :is="route.meta.public ? 'div' : AppLayout">
    <RouterView />
  </component>
</template>
