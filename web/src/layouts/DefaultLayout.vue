<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from '@/components/Sidebar.vue'
import { useAppStore } from '@/stores/app'
import { useBackgroundStore } from '@/stores/background'

const appStore = useAppStore()
const backgroundStore = useBackgroundStore()
const { sidebarOpen } = storeToRefs(appStore)
const route = useRoute()
const contentScrollRef = ref<HTMLElement | null>(null)

const backgroundStyle = computed(() => {
  if (backgroundStore.useCustomColor) {
    return {
      height: '100dvh',
      backgroundColor: backgroundStore.backgroundColor,
    }
  }
  return {
    height: '100dvh',
    backgroundImage: `url('${backgroundStore.backgroundImage}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
    backgroundRepeat: 'no-repeat',
    backgroundColor: '#1a202c',
  }
})

watch(
  () => route.fullPath,
  () => {
    nextTick(() => {
      if (contentScrollRef.value)
        contentScrollRef.value.scrollTop = 0
    })
  },
)
</script>

<template>
  <div class="w-screen flex overflow-hidden" :style="backgroundStyle">
    <!-- Mobile Sidebar Overlay -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm transition-opacity lg:hidden"
      @click="appStore.closeSidebar"
    />

    <Sidebar />

    <main class="relative h-full min-w-0 flex flex-1 flex-col overflow-hidden">
      <!-- Top Bar (Mobile/Tablet only or for additional actions) -->
      <header class="h-16 flex shrink-0 items-center justify-between border-b border-gray-200/30 bg-white/40 backdrop-blur-md px-6 lg:hidden dark:border-gray-700/30 dark:bg-gray-800/40">
        <div class="flex items-center gap-2 text-lg font-bold">
          <div class="i-carbon-sprout text-green-500" />
          <span>QQ农场智能助手</span>
        </div>
        <button
          class="flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100/50 dark:text-gray-400 dark:hover:bg-gray-700/50"
          @click="appStore.toggleSidebar"
        >
          <div class="i-carbon-menu text-xl" />
        </button>
      </header>

      <!-- Main Content Area -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <div ref="contentScrollRef" class="custom-scrollbar flex flex-1 flex-col overflow-y-auto p-2 md:p-6 sm:p-4">
          <RouterView v-slot="{ Component, route: currentRoute }">
            <Transition name="slide-fade" mode="out-in">
              <component :is="Component" :key="currentRoute.path" />
            </Transition>
          </RouterView>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Slide Fade Transition */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease-out;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
