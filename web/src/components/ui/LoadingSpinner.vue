<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md' | 'lg'
  text?: string
}>()

const sizeClasses = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-8 text-center text-gray-500">
    <div
      class="i-svg-spinners-90-ring-with-bg text-blue-500"
      :class="sizeClasses[size || 'md']"
    />
    <div v-if="text">{{ text }}</div>
    <slot />
  </div>
</template>
