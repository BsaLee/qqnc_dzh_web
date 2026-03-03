<script setup lang="ts">
import { onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'

interface User {
  username: string
  createdAt: number
  isAdmin: boolean
  enabled: boolean
}

const users = ref<User[]>([])
const loading = ref(false)
const error = ref('')

async function loadUsers() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get('/api/users')
    if (res.data.ok) {
      users.value = res.data.data || []
    }
    else {
      error.value = res.data.error || '加载失败'
    }
  }
  catch (e: any) {
    error.value = e.response?.data?.error || e.message || '加载异常'
  }
  finally {
    loading.value = false
  }
}

async function toggleUser(username: string) {
  try {
    const res = await api.post(`/api/users/${username}/toggle`)
    if (res.data.ok) {
      const user = users.value.find(u => u.username === username)
      if (user) {
        user.enabled = res.data.data.enabled
      }
    }
  }
  catch (e: any) {
    error.value = e.response?.data?.error || e.message
  }
}

async function deleteUser(username: string) {
  if (!confirm(`确定要删除用户 "${username}" 吗？`)) return
  try {
    const res = await api.delete(`/api/users/${username}`)
    if (res.data.ok) {
      users.value = users.value.filter(u => u.username !== username)
    }
  }
  catch (e: any) {
    error.value = e.response?.data?.error || e.message
  }
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString()
}

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl text-gray-900 font-bold dark:text-white">
        用户管理
      </h1>
      <BaseButton variant="secondary" @click="loadUsers">
        刷新
      </BaseButton>
    </div>

    <div v-if="error" class="rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20 dark:text-red-400">
      {{ error }}
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="i-svg-spinners-90-ring-with-bg text-4xl text-blue-500" />
    </div>

    <div v-else-if="users.length === 0" class="rounded-lg bg-white/40 backdrop-blur-md p-8 text-center text-gray-500 shadow dark:bg-gray-800/40">
      暂无注册用户
    </div>

    <div v-else class="rounded-lg bg-white/40 backdrop-blur-md shadow dark:bg-gray-800/40 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="border-b bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/50">
          <tr>
            <th class="px-4 py-3 text-left text-gray-700 font-medium dark:text-gray-300">
              用户名
            </th>
            <th class="px-4 py-3 text-left text-gray-700 font-medium dark:text-gray-300">
              类型
            </th>
            <th class="px-4 py-3 text-left text-gray-700 font-medium dark:text-gray-300">
              状态
            </th>
            <th class="px-4 py-3 text-left text-gray-700 font-medium dark:text-gray-300">
              注册时间
            </th>
            <th class="px-4 py-3 text-right text-gray-700 font-medium dark:text-gray-300">
              操作
            </th>
          </tr>
        </thead>
        <tbody class="divide-y dark:divide-gray-700">
          <tr v-for="user in users" :key="user.username" class="hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white">
              {{ user.username }}
            </td>
            <td class="px-4 py-3">
              <span
                v-if="user.isAdmin"
                class="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              >
                管理员
              </span>
              <span
                v-else
                class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              >
                普通用户
              </span>
            </td>
            <td class="px-4 py-3">
              <span
                v-if="user.enabled"
                class="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300"
              >
                启用
              </span>
              <span
                v-else
                class="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300"
              >
                禁用
              </span>
            </td>
            <td class="px-4 py-3 text-gray-500 dark:text-gray-400">
              {{ formatDate(user.createdAt) }}
            </td>
            <td class="px-4 py-3 text-right">
              <template v-if="!user.isAdmin">
                <BaseButton
                  variant="secondary"
                  size="sm"
                  class="mr-2"
                  @click="toggleUser(user.username)"
                >
                  {{ user.enabled ? '禁用' : '启用' }}
                </BaseButton>
                <BaseButton
                  variant="secondary"
                  size="sm"
                  class="text-red-500 hover:text-red-600"
                  @click="deleteUser(user.username)"
                >
                  删除
                </BaseButton>
              </template>
              <span v-else class="text-xs text-gray-400">
                不可操作
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
