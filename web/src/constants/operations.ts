export interface OpMeta {
  label: string
  icon: string
  color: string
}

export const OP_META: Record<string, OpMeta> = {
  harvest: { label: '收获', icon: 'i-carbon-crop-growth', color: 'text-green-500' },
  water: { label: '浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-400' },
  weed: { label: '除草', icon: 'i-carbon-cut-out', color: 'text-yellow-500' },
  bug: { label: '除虫', icon: 'i-carbon-warning-alt', color: 'text-red-400' },
  fertilize: { label: '施肥', icon: 'i-carbon-chemistry', color: 'text-emerald-500' },
  plant: { label: '种植', icon: 'i-carbon-tree', color: 'text-lime-500' },
  upgrade: { label: '土地升级', icon: 'i-carbon-upgrade', color: 'text-purple-500' },
  levelUp: { label: '账号升级', icon: 'i-carbon-user-certification', color: 'text-indigo-500' },
  steal: { label: '偷菜', icon: 'i-carbon-run', color: 'text-orange-500' },
  helpWater: { label: '帮浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-300' },
  helpWeed: { label: '帮除草', icon: 'i-carbon-cut-out', color: 'text-yellow-400' },
  helpBug: { label: '帮除虫', icon: 'i-carbon-warning-alt', color: 'text-red-300' },
  taskClaim: { label: '任务', icon: 'i-carbon-task-complete', color: 'text-indigo-500' },
  sell: { label: '出售', icon: 'i-carbon-shopping-cart', color: 'text-pink-500' },
}

export function getOpName(key: string | number): string {
  return OP_META[String(key)]?.label || String(key)
}

export function getOpIcon(key: string | number): string {
  return OP_META[String(key)]?.icon || 'i-carbon-circle-dash'
}

export function getOpColor(key: string | number): string {
  return OP_META[String(key)]?.color || 'text-gray-500'
}

export const LOG_TAG_STYLES: Record<string, string> = {
  错误: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  系统: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  警告: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  默认: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}

const DEFAULT_TAG_STYLE = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
const DEFAULT_MSG_STYLE = 'text-gray-700 dark:text-gray-300'

export function getLogTagClass(tag: string): string {
  return LOG_TAG_STYLES[tag] ?? DEFAULT_TAG_STYLE
}

export const LOG_MSG_STYLES: Record<string, string> = {
  错误: 'text-red-600 dark:text-red-400',
  警告: 'text-orange-600 dark:text-orange-400',
  默认: 'text-gray-700 dark:text-gray-300',
}

export function getLogMsgClass(tag: string): string {
  return LOG_MSG_STYLES[tag] ?? DEFAULT_MSG_STYLE
}
