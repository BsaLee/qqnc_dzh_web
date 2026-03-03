<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useSettingStore } from '@/stores/setting'

const settingStore = useSettingStore()
const accountStore = useAccountStore()
const farmStore = useFarmStore()

const { settings, loading } = storeToRefs(settingStore)
const { currentAccountId, accounts } = storeToRefs(accountStore)
const { seeds } = storeToRefs(farmStore)

const userType = useStorage('user_type', '')
const isAdmin = computed(() => userType.value === 'admin')

const cropFilterVisible = ref(false)

const saving = ref(false)
const passwordSaving = ref(false)
const offlineSaving = ref(false)

const bannedAccounts = ref<any[]>([])

const modalVisible = ref(false)
const modalConfig = ref({
  title: '',
  message: '',
  type: 'primary' as 'primary' | 'danger',
  isAlert: true,
})

function showAlert(message: string, type: 'primary' | 'danger' = 'primary') {
  modalConfig.value = {
    title: type === 'danger' ? '错误' : '提示',
    message,
    type,
    isAlert: true,
  }
  modalVisible.value = true
}

const currentAccountName = computed(() => {
  const acc = accounts.value.find((a: any) => a.id === currentAccountId.value)
  return acc ? (acc.name || acc.nick || acc.id) : null
})

const localSettings = ref({
  plantingStrategy: 'preferred',
  preferredSeedId: 0,
  plantDelaySeconds: 1,
  intervals: { farmMin: 2, farmMax: 2, friendMin: 10, friendMax: 10 },
  friendQuietHours: { enabled: false, start: '23:00', end: '07:00' },
  excludedSeedIds: [] as number[],
  automation: {
    farm: false,
    task: false,
    sell: false,
    friend: false,
    farm_push: false,
    land_upgrade: false,
    autoWater: true,
    autoWeed: true,
    autoBug: true,
    friend_steal: false,
    friend_help: false,
    friend_bad: false,
    friend_help_exp_limit: false,
    email: false,
    fertilizer_gift: false,
    fertilizer_buy: false,
    free_gifts: false,
    share_reward: false,
    vip_gift: false,
    month_card: false,
    open_server_gift: false,
    fertilizer: 'none',
  },
})

const localOffline = ref({
  channel: 'webhook',
  reloginUrlMode: 'none',
  endpoint: '',
  token: '',
  title: '',
  msg: '',
  offlineDeleteSec: 120,
})

const passwordForm = ref({
  old: '',
  new: '',
  confirm: '',
})

function syncLocalSettings() {
  if (settings.value) {
    localSettings.value = JSON.parse(JSON.stringify({
      plantingStrategy: settings.value.plantingStrategy,
      preferredSeedId: settings.value.preferredSeedId,
      plantDelaySeconds: settings.value.plantDelaySeconds || 1,
      intervals: settings.value.intervals,
      friendQuietHours: settings.value.friendQuietHours,
      excludedSeedIds: settings.value.stealExcludePlants || [],
      automation: settings.value.automation,
    }))

    // Default automation values if missing
    if (!localSettings.value.automation) {
      localSettings.value.automation = {
        farm: false,
        task: false,
        sell: false,
        friend: false,
        farm_push: false,
        land_upgrade: false,
        autoWater: true,
        autoWeed: true,
        autoBug: true,
        friend_steal: false,
        friend_help: false,
        friend_bad: false,
        friend_help_exp_limit: false,
        email: false,
        fertilizer_gift: false,
        fertilizer_buy: false,
        free_gifts: false,
        share_reward: false,
        vip_gift: false,
        month_card: false,
        open_server_gift: false,
        fertilizer: 'none',
      }
    }
    else {
      // Merge with defaults to ensure all keys exist
      const defaults = {
        farm: false,
        task: false,
        sell: false,
        friend: false,
        farm_push: false,
        land_upgrade: false,
        friend_steal: false,
        friend_help: false,
        friend_bad: false,
        friend_help_exp_limit: false,
        email: false,
        fertilizer_gift: false,
        fertilizer_buy: false,
        free_gifts: false,
        share_reward: false,
        vip_gift: false,
        month_card: false,
        open_server_gift: false,
        fertilizer: 'none',
      }
      localSettings.value.automation = {
        ...defaults,
        ...localSettings.value.automation,
      }
    }

    // Sync offline settings (global)
    if (settings.value.offlineReminder) {
      localOffline.value = JSON.parse(JSON.stringify(settings.value.offlineReminder))
    }
  }
}

async function loadData() {
  if (currentAccountId.value) {
    await settingStore.fetchSettings(currentAccountId.value)
    syncLocalSettings()
    // Always fetch seeds to ensure correct locked status for current account
    await farmStore.fetchSeeds(currentAccountId.value)
  }
}

onMounted(() => {
  loadData()
  loadBannedAccounts()
})

async function loadBannedAccounts() {
  try {
    const res = await fetch('/api/banned-accounts')
    const data = await res.json()
    if (data.ok) {
      bannedAccounts.value = data.data || []
    }
  } catch (e) {
    console.error('加载黑名单失败:', e)
  }
}

async function removeBannedAccount(accountId: string) {
  try {
    const res = await fetch(`/api/banned-accounts/${accountId}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    if (data.ok) {
      bannedAccounts.value = data.data || []
    }
  } catch (e) {
    console.error('移除黑名单失败:', e)
  }
}

watch(currentAccountId, () => {
  loadData()
})

const fertilizerOptions = [
  { label: '普通 + 有机', value: 'both' },
  { label: '仅普通化肥', value: 'normal' },
  { label: '仅有机化肥', value: 'organic' },
  { label: '不施肥', value: 'none' },
]

const plantingStrategyOptions = [
  { label: '优先种植种子', value: 'preferred' },
  { label: '最高等级作物', value: 'level' },
  { label: '最大经验/时', value: 'max_exp' },
  { label: '最大普通肥经验/时', value: 'max_fert_exp' },
  { label: '最大净利润/时', value: 'max_profit' },
  { label: '最大普通肥净利润/时', value: 'max_fert_profit' },
]

const channelOptions = [
  { label: 'Webhook(自定义接口)', value: 'webhook' },
  { label: 'Qmsg 酱', value: 'qmsg' },
  { label: 'Server 酱', value: 'serverchan' },
  { label: 'Push Plus', value: 'pushplus' },
  { label: 'Push Plus Hxtrip', value: 'pushplushxtrip' },
  { label: '钉钉', value: 'dingtalk' },
  { label: '企业微信', value: 'wecom' },
  { label: 'Bark', value: 'bark' },
  { label: 'Go-cqhttp', value: 'gocqhttp' },
  { label: 'OneBot', value: 'onebot' },
  { label: 'Atri', value: 'atri' },
  { label: 'PushDeer', value: 'pushdeer' },
  { label: 'iGot', value: 'igot' },
  { label: 'Telegram', value: 'telegram' },
  { label: '飞书', value: 'feishu' },
  { label: 'IFTTT', value: 'ifttt' },
  { label: '企业微信群机器人', value: 'wecombot' },
  { label: 'Discord', value: 'discord' },
  { label: 'WxPusher', value: 'wxpusher' },
]

const CHANNEL_DOCS: Record<string, string> = {
  webhook: '',
  qmsg: 'https://qmsg.zendee.cn/',
  serverchan: 'https://sct.ftqq.com/',
  pushplus: 'https://www.pushplus.plus/',
  pushplushxtrip: 'https://pushplus.hxtrip.com/',
  dingtalk: 'https://open.dingtalk.com/document/group/custom-robot-access',
  wecom: 'https://guole.fun/posts/626/',
  wecombot: 'https://developer.work.weixin.qq.com/document/path/91770',
  bark: 'https://github.com/Finb/Bark',
  gocqhttp: 'https://docs.go-cqhttp.org/api/',
  onebot: 'https://docs.go-cqhttp.org/api/',
  atri: 'https://blog.tianli0.top/',
  pushdeer: 'https://www.pushdeer.com/',
  igot: 'https://push.hellyw.com/',
  telegram: 'https://core.telegram.org/bots',
  feishu: 'https://www.feishu.cn/hc/zh-CN/articles/360024984973',
  ifttt: 'https://ifttt.com/maker_webhooks',
  discord: 'https://discord.com/developers/docs/resources/webhook#execute-webhook',
  wxpusher: 'https://wxpusher.zjiecode.com/docs/#/',
}

const reloginUrlModeOptions = [
  { label: '不需要', value: 'none' },
  { label: 'QQ直链', value: 'qq_link' },
  { label: '二维码链接', value: 'qr_link' },
]

const currentChannelDocUrl = computed(() => {
  const key = String(localOffline.value.channel || '').trim().toLowerCase()
  return CHANNEL_DOCS[key] || ''
})

function openChannelDocs() {
  const url = currentChannelDocUrl.value
  if (!url)
    return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const preferredSeedOptions = computed(() => {
  const options = [{ label: '自动选择', value: 0 }]
  if (seeds.value) {
    options.push(...seeds.value.map(seed => ({
      label: `${seed.requiredLevel}级 ${seed.name} (${seed.price}金)`,
      value: seed.seedId,
      disabled: seed.locked || seed.soldOut,
    })))
  }
  return options
})

const filterableSeeds = computed(() => {
  if (!seeds.value) return []
  return seeds.value
    .filter(s => !s.locked && !s.soldOut)
    .sort((a, b) => a.requiredLevel - b.requiredLevel)
})

function toggleSeedFilter(seedId: number) {
  const idx = localSettings.value.excludedSeedIds.indexOf(seedId)
  if (idx === -1) {
    localSettings.value.excludedSeedIds.push(seedId)
  } else {
    localSettings.value.excludedSeedIds.splice(idx, 1)
  }
}

function isSeedExcluded(seedId: number) {
  return localSettings.value.excludedSeedIds.includes(seedId)
}

const analyticsSortByMap: Record<string, string> = {
  max_exp: 'exp',
  max_fert_exp: 'fert',
  max_profit: 'profit',
  max_fert_profit: 'fert_profit',
}

const strategyPreviewLabel = ref<string | null>(null)

watchEffect(async () => {
  const strategy = localSettings.value.plantingStrategy
  if (strategy === 'preferred') {
    strategyPreviewLabel.value = null
    return
  }
  if (!seeds.value || seeds.value.length === 0) {
    strategyPreviewLabel.value = null
    return
  }
  const available = seeds.value.filter(s => !s.locked && !s.soldOut)
  if (available.length === 0) {
    strategyPreviewLabel.value = '暂无可用种子'
    return
  }
  if (strategy === 'level') {
    const best = [...available].sort((a, b) => b.requiredLevel - a.requiredLevel)[0]
    strategyPreviewLabel.value = best ? `${best.requiredLevel}级 ${best.name}` : null
    return
  }
  const sortBy = analyticsSortByMap[strategy]
  if (sortBy) {
    try {
      const res = await api.get(`/api/analytics?sort=${sortBy}`)
      const rankings: any[] = res.data.ok ? (res.data.data || []) : []
      const availableIds = new Set(available.map(s => s.seedId))
      const match = rankings.find(r => availableIds.has(Number(r.seedId)))
      if (match) {
        const seed = available.find(s => s.seedId === Number(match.seedId))
        strategyPreviewLabel.value = seed ? `${seed.requiredLevel}级 ${seed.name}` : null
      }
      else {
        strategyPreviewLabel.value = '暂无匹配种子'
      }
    }
    catch {
      strategyPreviewLabel.value = null
    }
  }
})

async function saveAccountSettings() {
  if (!currentAccountId.value)
    return
  saving.value = true
  try {
    const res = await settingStore.saveSettings(currentAccountId.value, localSettings.value)
    await settingStore.saveStealExcludePlants(currentAccountId.value, localSettings.value.excludedSeedIds)
    if (res.ok) {
      showAlert('账号设置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
  }
  finally {
    saving.value = false
  }
}

async function handleChangePassword() {
  if (!passwordForm.value.old || !passwordForm.value.new) {
    showAlert('请填写完整', 'danger')
    return
  }
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    showAlert('两次密码输入不一致', 'danger')
    return
  }
  if (passwordForm.value.new.length < 4) {
    showAlert('密码长度至少4位', 'danger')
    return
  }

  passwordSaving.value = true
  try {
    const res = await settingStore.changeAdminPassword(passwordForm.value.old, passwordForm.value.new)

    if (res.ok) {
      showAlert('密码修改成功')
      passwordForm.value = { old: '', new: '', confirm: '' }
    }
    else {
      showAlert(`修改失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    passwordSaving.value = false
  }
}

async function handleSaveOffline() {
  offlineSaving.value = true
  try {
    const res = await settingStore.saveOfflineConfig(localOffline.value)

    if (res.ok) {
      showAlert('下线提醒设置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    offlineSaving.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <div v-if="loading" class="py-4 text-center text-gray-500">
      <div class="i-svg-spinners-ring-resize mx-auto mb-2 text-2xl" />
      <p>加载中...</p>
    </div>

    <div v-else class="grid grid-cols-1 mt-12 gap-4 text-sm lg:grid-cols-2">
      <!-- Left Column -->
      <div class="flex flex-col gap-4">
        <!-- Card 1: Strategy & Automation -->
        <div v-if="currentAccountId" class="card h-full flex flex-col rounded-lg bg-white/40 backdrop-blur-md shadow dark:bg-gray-800/40">
          <!-- Strategy Header -->
          <div class="border-b rounded-t-lg bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
            <h3 class="flex items-center gap-2 text-base text-gray-900 font-bold dark:text-gray-100">
              <div class="i-fas-cogs" />
              策略设置
              <span v-if="currentAccountName" class="ml-2 text-sm text-gray-500 font-normal dark:text-gray-400">
                ({{ currentAccountName }})
              </span>
            </h3>
          </div>

        <!-- Strategy Content -->
        <div class="p-4 space-y-3">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <BaseSelect
              v-model="localSettings.plantingStrategy"
              label="种植策略"
              :options="plantingStrategyOptions"
            />
            <BaseSelect
              v-if="localSettings.plantingStrategy === 'preferred'"
              v-model="localSettings.preferredSeedId"
              label="优先种植种子"
              :options="preferredSeedOptions"
            />
            <!-- 预览区域：与 BaseSelect 同结构同样式，避免切换策略时布局跳动 -->
            <div v-else class="flex flex-col gap-1.5">
              <label class="text-sm text-gray-700 font-medium dark:text-gray-300">策略选种预览</label>
              <div
                class="w-full flex items-center justify-between border border-gray-200 rounded-lg bg-gray-50 px-3 py-2 text-gray-500 dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-400"
              >
                <span class="truncate">{{ strategyPreviewLabel ?? '加载中...' }}</span>
                <div class="i-carbon-chevron-down shrink-0 text-lg text-gray-400" />
              </div>
            </div>
          </div>

          <div class="-mx-4 border-b border-t bg-blue-50/50 px-4 py-3 dark:border-gray-700 dark:bg-blue-900/20">
            <div class="flex w-full items-center justify-between">
              <span class="text-sm text-blue-700 font-medium dark:text-blue-300">操作间隔说明</span>
            </div>
            <div class="mt-2 space-y-1.5 text-xs text-blue-600 dark:text-blue-400">
              <div>
                <span class="font-medium">1、</span>收获后种植间隔：每块土地依次随机延迟 2-3 秒种植，全部种植完成后统一施肥
              </div>
              <div>
                <span class="font-medium">2、</span>有机肥施肥间隔：每块土地之间随机延迟 1-3 秒，避免请求过快触发风控
              </div>
            </div>
            <p class="mt-2 text-xs text-blue-500/70 dark:text-blue-400/70">
              以上功能由后端自动执行，无需手动配置
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BaseInput
              v-model.number="localSettings.intervals.farmMin"
              label="农场巡查最小 (秒)"
              type="number"
              min="1"
            />
            <BaseInput
              v-model.number="localSettings.intervals.farmMax"
              label="农场巡查最大 (秒)"
              type="number"
              min="1"
            />
            <BaseInput
              v-model.number="localSettings.intervals.friendMin"
              label="好友巡查最小 (秒)"
              type="number"
              min="1"
            />
            <BaseInput
              v-model.number="localSettings.intervals.friendMax"
              label="好友巡查最大 (秒)"
              type="number"
              min="1"
            />
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-4 border-t pt-3 dark:border-gray-700">
            <BaseSwitch
              v-model="localSettings.friendQuietHours.enabled"
              label="启用静默时段"
            />
            <div class="flex items-center gap-2">
              <BaseInput
                v-model="localSettings.friendQuietHours.start"
                type="time"
                class="w-24"
                :disabled="!localSettings.friendQuietHours.enabled"
              />
              <span class="text-gray-500">-</span>
              <BaseInput
                v-model="localSettings.friendQuietHours.end"
                type="time"
                class="w-24"
                :disabled="!localSettings.friendQuietHours.enabled"
              />
            </div>
          </div>
        </div>

        <!-- Auto Control Header -->
        <div class="border-b border-t bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
          <h3 class="flex items-center gap-2 text-base text-gray-900 font-bold dark:text-gray-100">
            <div class="i-fas-toggle-on" />
            自动控制
          </h3>
        </div>

        <!-- Auto Control Content -->
        <div class="flex-1 p-4 space-y-4">
          <!-- Switches Grid -->
          <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
            <BaseSwitch v-model="localSettings.automation.farm" label="自动种植收获" />
            <BaseSwitch v-model="localSettings.automation.task" label="自动做任务" />
            <BaseSwitch v-model="localSettings.automation.sell" label="自动卖果实" />
            <BaseSwitch v-model="localSettings.automation.friend" label="自动好友互动" />
            <BaseSwitch v-model="localSettings.automation.farm_push" label="推送触发巡田" />
            <BaseSwitch v-model="localSettings.automation.land_upgrade" label="自动升级土地" />
            <BaseSwitch v-model="localSettings.automation.email" label="自动领取邮件" />
            <BaseSwitch v-model="localSettings.automation.free_gifts" label="自动商城礼包" />
            <BaseSwitch v-model="localSettings.automation.share_reward" label="自动分享奖励" />
            <BaseSwitch v-model="localSettings.automation.vip_gift" label="自动VIP礼包" />
            <BaseSwitch v-model="localSettings.automation.month_card" label="自动月卡奖励" />
            <BaseSwitch v-model="localSettings.automation.open_server_gift" label="自动开服红包" />
            <BaseSwitch v-model="localSettings.automation.fertilizer_gift" label="自动填充化肥" />
            <BaseSwitch v-model="localSettings.automation.fertilizer_buy" label="自动购买化肥" />
          </div>

          <!-- Farm Sub-controls -->
          <div v-if="localSettings.automation.farm" class="space-y-2">
            <div class="flex flex-wrap gap-4 rounded p-2 text-sm">
              <BaseSwitch v-model="localSettings.automation.autoWater" label="自动浇水" />
              <BaseSwitch v-model="localSettings.automation.autoWeed" label="自动除草" />
              <BaseSwitch v-model="localSettings.automation.autoBug" label="自动除虫" />
            </div>
          </div>

          <!-- Sub-controls -->
          <div v-if="localSettings.automation.friend" class="space-y-2">
            <div class="flex flex-wrap gap-4 rounded p-2 text-sm">
              <BaseSwitch v-model="localSettings.automation.friend_steal" label="自动偷菜" />
              <BaseSwitch v-model="localSettings.automation.friend_help" label="自动帮忙" />
              <BaseSwitch v-model="localSettings.automation.friend_bad" label="自动捣乱" />
              <BaseSwitch v-model="localSettings.automation.friend_help_exp_limit" label="经验上限停止帮忙" />
            </div>
            <div v-if="localSettings.automation.friend_steal" class="-mx-4 border-b border-t bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
              <div class="flex w-full items-center justify-between">
                <span class="text-sm text-gray-700 font-medium dark:text-gray-300">偷菜筛选</span>
                <BaseButton variant="text" size="sm" @click="cropFilterVisible = true">
                  配置 ({{ localSettings.excludedSeedIds.length }}个已排除)
                </BaseButton>
              </div>
              <p class="w-full text-xs text-gray-500 dark:text-gray-400">
                选中的农作物将被过滤不偷
              </p>
            </div>
          </div>

          <!-- Fertilizer -->
          <div>
            <BaseSelect
              v-model="localSettings.automation.fertilizer"
              label="施肥策略"
              class="w-full md:w-1/2"
              :options="fertilizerOptions"
            />
          </div>
        </div>

        <!-- Save Button -->
        <div class="mt-auto flex justify-end border-t rounded-b-lg bg-white/40 backdrop-blur-md px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="saving"
            @click="saveAccountSettings"
          >
            保存策略与自动控制
          </BaseButton>
        </div>
      </div>

      <div v-else class="card flex-1 flex flex-col items-center justify-center gap-4 rounded-lg bg-white/40 backdrop-blur-md p-12 text-center shadow dark:bg-gray-800/40">
        <div class="rounded-full bg-gray-50 p-4 dark:bg-gray-700/50">
          <div class="i-carbon-settings-adjust text-4xl text-gray-400 dark:text-gray-500" />
        </div>
        <div class="max-w-xs">
          <h3 class="text-lg text-gray-900 font-medium dark:text-gray-100">
            需要登录账号
          </h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            请先登录账号以配置策略和自动化选项。
          </p>
        </div>
      </div>

        <!-- Banned Accounts Card - Left Bottom -->
        <div class="flex flex-col rounded-lg bg-white/40 backdrop-blur-md shadow dark:bg-gray-800/40">
          <div class="border-b px-4 py-3 dark:border-gray-700">
            <h3 class="text-base text-gray-900 font-bold dark:text-gray-100">
              封禁好友黑名单
            </h3>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              状态异常的好友会自动加入黑名单，巡查时将跳过这些好友
            </p>
          </div>

          <div class="flex-1 p-4">
            <div v-if="bannedAccounts.length === 0" class="py-8 text-center text-gray-400">
              暂无封禁好友
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="acc in bannedAccounts"
                :key="acc.id"
                class="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20"
              >
                <div>
                  <div class="text-sm font-medium text-red-700 dark:text-red-400">
                    {{ acc.name || acc.id }}
                  </div>
                  <div class="text-xs text-red-500 dark:text-red-400">
                    GID: {{ acc.id }} · {{ acc.reason || '好友状态异常' }}
                  </div>
                  <div v-if="acc.bannedAt" class="text-xs text-gray-400">
                    {{ new Date(acc.bannedAt).toLocaleString() }}
                  </div>
                </div>
                <BaseButton
                  variant="secondary"
                  size="sm"
                  @click="removeBannedAccount(acc.id)"
                >
                  移除
                </BaseButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column - Wrapped Admin Password + Offline Reminder -->
      <div class="flex flex-col gap-4 flex-1">
        <!-- Card 2: Admin Password - Admin Only -->
        <div v-if="isAdmin" class="card rounded-lg bg-white/40 backdrop-blur-md shadow dark:bg-gray-800/40">
          <!-- Password Header -->
          <div class="border-b rounded-t-lg bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
            <h3 class="flex items-center gap-2 text-base text-gray-900 font-bold dark:text-gray-100">
              <div class="i-carbon-password" />
              管理密码
            </h3>
          </div>

          <!-- Password Content -->
          <div class="p-4 space-y-3">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <BaseInput
                v-model="passwordForm.old"
                label="当前密码"
                type="password"
                placeholder="当前管理密码"
              />
              <BaseInput
                v-model="passwordForm.new"
                label="新密码"
                type="password"
                placeholder="至少 4 位"
              />
              <BaseInput
                v-model="passwordForm.confirm"
                label="确认新密码"
                type="password"
                placeholder="再次输入新密码"
              />
            </div>

            <div class="flex items-center justify-between pt-1">
              <p class="text-xs text-gray-500">
                建议修改默认密码 (admin)
              </p>
              <BaseButton
                variant="primary"
                size="sm"
              :loading="passwordSaving"
              @click="handleChangePassword"
            >
              修改管理密码
            </BaseButton>
          </div>
        </div>

      <!-- Card 3: Offline Reminder - All Users -->
      <div class="card flex-1 flex flex-col rounded-lg bg-white/40 backdrop-blur-md shadow dark:bg-gray-800/40">
        <!-- Offline Header -->
        <div class="border-b rounded-t-lg bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
          <h3 class="flex items-center gap-2 text-base text-gray-900 font-bold dark:text-gray-100">
            <div class="i-carbon-notification" />
            下线提醒
          </h3>
        </div>

        <!-- Offline Content -->
        <div class="flex-1 bg-white/40 backdrop-blur-md p-4 space-y-3 dark:bg-gray-800/40">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-700 font-medium dark:text-gray-300">推送渠道</span>
                <BaseButton
                  variant="text"
                  size="sm"
                  :disabled="!currentChannelDocUrl"
                  @click="openChannelDocs"
                >
                  官网
                </BaseButton>
              </div>
              <BaseSelect
                v-model="localOffline.channel"
                :options="channelOptions"
              />
            </div>
            <BaseSelect
              v-model="localOffline.reloginUrlMode"
              label="重登录链接"
              :options="reloginUrlModeOptions"
            />
          </div>

          <BaseInput
            v-model="localOffline.endpoint"
            label="接口地址"
            type="text"
            :disabled="localOffline.channel !== 'webhook'"
          />

          <BaseInput
            v-model="localOffline.token"
            label="Token"
            type="text"
            placeholder="接收端 token"
          />

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <BaseInput
              v-model="localOffline.title"
              label="标题"
              type="text"
              placeholder="提醒标题"
            />
            <BaseInput
              v-model.number="localOffline.offlineDeleteSec"
              label="离线删除账号 (秒)"
              type="number"
              min="1"
              placeholder="默认 120"
            />
          </div>

          <BaseInput
            v-model="localOffline.msg"
            label="内容"
            type="text"
            placeholder="提醒内容"
          />
        </div>

        <!-- Save Offline Button -->
        <div class="mt-auto flex justify-end border-t rounded-b-lg bg-white/40 backdrop-blur-md px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="offlineSaving"
            @click="handleSaveOffline"
          >
            保存下线提醒设置
          </BaseButton>
        </div>
      </div>
      </div>
    </div>
  </div>

    <ConfirmModal
      :show="modalVisible"
      :title="modalConfig.title"
      :message="modalConfig.message"
      :type="modalConfig.type"
      :is-alert="modalConfig.isAlert"
      confirm-text="知道了"
      @confirm="modalVisible = false"
      @cancel="modalVisible = false"
    />

    <!-- Crop Filter Modal -->
    <div v-if="cropFilterVisible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="cropFilterVisible = false">
      <div class="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700">
          <h3 class="text-base text-gray-900 font-bold dark:text-gray-100">偷菜筛选</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="cropFilterVisible = false">
            <div class="i-carbon-close text-xl" />
          </button>
        </div>
        <div class="max-h-96 overflow-y-auto p-4">
          <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
            勾选的农作物将被排除，偷菜时不会偷取这些作物。可用于排除低价值或不需要的作物。
          </p>
          <div v-if="filterableSeeds.length === 0" class="py-4 text-center text-gray-400">
            暂无可用种子
          </div>
          <div v-else class="grid grid-cols-2 gap-2">
            <div
              v-for="seed in filterableSeeds"
              :key="seed.seedId"
              class="flex items-center gap-2 rounded border px-3 py-2 cursor-pointer transition-colors"
              :class="isSeedExcluded(seed.seedId) 
                ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20' 
                : 'border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800/50 dark:hover:bg-gray-700'"
              @click="toggleSeedFilter(seed.seedId)"
            >
              <div
                class="h-4 w-4 flex items-center justify-center rounded border transition-colors"
                :class="isSeedExcluded(seed.seedId) 
                  ? 'border-orange-500 bg-orange-500' 
                  : 'border-gray-300 dark:border-gray-500'"
              >
                <div v-if="isSeedExcluded(seed.seedId)" class="i-carbon-checkmark text-white text-xs" />
              </div>
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ seed.requiredLevel }}级 {{ seed.name }}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between border-t px-4 py-3 dark:border-gray-700">
          <span class="text-xs text-gray-500 dark:text-gray-400">
            已排除 {{ localSettings.excludedSeedIds.length }} 个农作物
          </span>
          <BaseButton variant="primary" size="sm" @click="cropFilterVisible = false">
            完成
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="postcss">
/* Custom styles if needed */
</style>
