<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useBackgroundStore } from '@/stores/background'

const router = useRouter()
const password = ref('')
const confirmPassword = ref('')
const username = ref('')
const error = ref('')
const loading = ref(false)
const token = useStorage('admin_token', '')
const userType = useStorage('user_type', '')
const currentUsername = useStorage('username', '')
const backgroundStore = useBackgroundStore()
const isRegister = ref(false)
const showAdminLogin = ref(false)

const backgroundStyle = computed(() => {
  if (backgroundStore.useCustomColor) {
    return {
      backgroundColor: backgroundStore.backgroundColor,
    }
  }
  return {
    backgroundImage: `url('${backgroundStore.backgroundImage}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }
})

const pageTitle = computed(() => {
  if (showAdminLogin.value) return '管理员登录'
  return isRegister.value ? '注册' : '登录'
})

function validateForm() {
  if (!showAdminLogin.value && !username.value.trim()) {
    error.value = '请输入用户名'
    return false
  }
  if (!showAdminLogin.value) {
    if (username.value.length < 3) {
      error.value = '用户名至少3个字符'
      return false
    }
    if (username.value.length > 32) {
      error.value = '用户名最多32个字符'
      return false
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username.value)) {
      error.value = '用户名只能包含字母、数字、下划线或中文'
      return false
    }
    const lowerName = username.value.toLowerCase()
    if (lowerName === 'admin' || lowerName === 'administrator' || lowerName === '管理员') {
      error.value = '该用户名已被保留，请使用其他用户名'
      return false
    }
  }
  if (!password.value) {
    error.value = '请输入密码'
    return false
  }
  if (isRegister.value) {
    if (password.value.length < 8) {
      error.value = '密码至少需要8个字符'
      return false
    }
    if (!/[a-z]/.test(password.value)) {
      error.value = '密码需包含小写字母'
      return false
    }
    if (!/[A-Z]/.test(password.value)) {
      error.value = '密码需包含大写字母'
      return false
    }
    if (!/\d/.test(password.value)) {
      error.value = '密码需包含数字'
      return false
    }
    if (password.value !== confirmPassword.value) {
      error.value = '两次输入的密码不一致'
      return false
    }
  }
  return true
}

async function handleUserLogin() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.post('/api/user/login', { username: username.value, password: password.value })
    if (res.data.ok) {
      token.value = res.data.data.token
      userType.value = res.data.data.userType
      currentUsername.value = res.data.data.username
      router.push('/accounts')
    }
    else {
      error.value = res.data.error || '登录失败'
    }
  }
  catch (e: any) {
    error.value = e.response?.data?.error || e.message || '登录异常'
  }
  finally {
    loading.value = false
  }
}

async function handleRegister() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.post('/api/user/register', { username: username.value, password: password.value })
    if (res.data.ok) {
      token.value = res.data.data.token
      userType.value = res.data.data.userType
      currentUsername.value = res.data.data.username
      router.push('/accounts')
    }
    else {
      error.value = res.data.error || '注册失败'
    }
  }
  catch (e: any) {
    error.value = e.response?.data?.error || e.message || '注册异常'
  }
  finally {
    loading.value = false
  }
}

async function handleAdminLogin() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.post('/api/admin/login', { password: password.value })
    if (res.data.ok) {
      token.value = res.data.data.token
      userType.value = 'admin'
      currentUsername.value = '管理员'
      router.push('/accounts')
    }
    else {
      error.value = res.data.error || '登录失败'
    }
  }
  catch (e: any) {
    error.value = e.response?.data?.error || e.message || '登录异常'
  }
  finally {
    loading.value = false
  }
}

function handleSubmit() {
  if (!validateForm()) return
  
  if (showAdminLogin.value) {
    handleAdminLogin()
  }
  else if (isRegister.value) {
    handleRegister()
  }
  else {
    handleUserLogin()
  }
}

function switchMode(toRegister: boolean) {
  isRegister.value = toRegister
  error.value = ''
  password.value = ''
  confirmPassword.value = ''
  username.value = ''
}

function switchToAdminLogin() {
  showAdminLogin.value = true
  error.value = ''
  password.value = ''
  confirmPassword.value = ''
  username.value = ''
}

function switchToUserLogin() {
  showAdminLogin.value = false
  error.value = ''
  password.value = ''
  confirmPassword.value = ''
  username.value = ''
}
</script>

<template>
  <div class="w-full flex items-start justify-center px-4 pt-[10vh] min-h-dvh sm:items-center sm:pt-0" :style="backgroundStyle">
    <div class="max-w-md w-full rounded-xl bg-white/60 backdrop-blur-md p-8 shadow-lg space-y-6 dark:bg-gray-800/60">
      <div class="mb-8 py-4 text-center">
        <h1 class="text-3xl text-gray-900 font-bold tracking-tight dark:text-white">
          QQ农场智能助手
        </h1>
        <h2 class="mt-3 text-3xl text-gray-900 font-bold tracking-tight dark:text-white">
          {{ pageTitle }}
        </h2>
      </div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div v-if="!showAdminLogin">
          <BaseInput
            id="username"
            v-model="username"
            type="text"
            placeholder="请输入用户名"
            required
          />
        </div>
        <div>
          <BaseInput
            id="password"
            v-model="password"
            type="password"
            :placeholder="showAdminLogin ? '请输入管理密码' : (isRegister ? '请输入密码（8位以上，含大小写字母和数字）' : '请输入密码')"
            required
          />
        </div>
        <div v-if="isRegister && !showAdminLogin">
          <BaseInput
            id="confirmPassword"
            v-model="confirmPassword"
            type="password"
            placeholder="请再次输入密码"
            required
          />
        </div>
        <div v-if="error" class="text-sm text-red-600">
          {{ error }}
        </div>
        <BaseButton
          type="submit"
          variant="primary"
          block
          :loading="loading"
        >
          {{ showAdminLogin ? '管理员登录' : (isRegister ? '注册' : '登录') }}
        </BaseButton>
      </form>

      <div v-if="!showAdminLogin" class="text-center text-sm">
        <button
          class="text-blue-500 hover:text-blue-600"
          @click="switchMode(!isRegister)"
        >
          {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
        </button>
      </div>

      <div v-if="!showAdminLogin && !isRegister" class="text-center text-sm">
        <button
          class="text-gray-400 hover:text-gray-600"
          @click="switchToAdminLogin"
        >
          管理员入口
        </button>
      </div>

      <div v-if="showAdminLogin" class="text-center text-sm">
        <button
          class="text-gray-400 hover:text-gray-600"
          @click="switchToUserLogin"
        >
          返回用户登录
        </button>
      </div>
    </div>
  </div>
</template>
