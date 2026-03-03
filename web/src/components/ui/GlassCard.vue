<script setup lang="ts">
defineProps<{
  class?: string
}>()
</script>

<template>
  <div
    class="rounded-lg bg-white/40 backdrop-blur-md shadow dark:bg-gray-800/40"
    :class="$props.class"
  >
    <slot />
  </div>
</template>
