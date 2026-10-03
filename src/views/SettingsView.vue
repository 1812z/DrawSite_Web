<script setup lang="ts">
import { RotateCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useSystemStore } from '@/stores/system'
const system = useSystemStore()
</script>

<template>
  <section class="mx-auto w-full max-w-3xl px-6 py-10">
    <h1 class="text-2xl font-medium tracking-tight">设置</h1><p class="mt-3 text-sm text-muted-foreground">查看平台连接与当前开发环境。</p>
    <div class="mt-8 rounded-xl border p-6"><div class="flex items-center justify-between gap-4"><div><h2 class="text-sm font-medium">后端服务</h2><p role="status" class="mt-2 text-sm text-muted-foreground">{{ system.label }}</p></div><Button variant="outline" size="sm" :disabled="system.loading" @click="system.checkHealth"><RotateCw :class="{ 'animate-spin': system.loading }" />重新检查</Button></div><p v-if="system.health" class="mt-4 text-xs text-muted-foreground">检查时间：{{ new Date(system.health.timestamp).toLocaleString('zh-CN') }}</p><p v-if="system.error" role="alert" class="mt-4 text-xs leading-6 text-muted-foreground">连接失败，请确认后端已启动于 8080 端口。</p></div>
    <div class="mt-4 rounded-xl border p-6"><h2 class="text-sm font-medium">当前阶段</h2><p class="mt-3 text-sm leading-7 text-muted-foreground">已接入账号（注册/登录/会话）、应用管理（创建/编辑/分页）与应用工作区（会话、消息、项目文档只读、版本列表）。消息仅保存，AI 开发能力与平台设置接口尚未实现。</p></div>
  </section>
</template>
