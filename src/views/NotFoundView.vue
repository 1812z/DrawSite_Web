<script setup lang="ts">
import { Button } from '@/components/ui/button'
</script>
<template>
  <section class="flex flex-1 flex-col items-center justify-center gap-5 p-8"><p class="text-sm text-muted-foreground">404</p><h1 class="text-2xl font-medium">页面不存在</h1><Button as-child variant="outline"><RouterLink to="/">返回工作台</RouterLink></Button></section>
</template>
