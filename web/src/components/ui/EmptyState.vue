<script setup lang="ts">
defineProps<{
  icon?: string
  title?: string
  description?: string
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 rounded-lg bg-white/40 backdrop-blur-md p-12 text-center text-gray-500 shadow dark:bg-gray-800/40">
    <div :class="icon || 'i-carbon-connection-signal-off'" class="text-4xl text-gray-400 dark:text-gray-500" />
    <div class="flex flex-col">
      <div class="text-lg text-gray-700 font-medium dark:text-gray-300">
        {{ title || '账号未登录' }}
      </div>
      <div v-if="description" class="mt-1 text-sm text-gray-400">
        {{ description }}
      </div>
    </div>
    <slot />
  </div>
</template>
