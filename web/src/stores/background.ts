import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useBackgroundStore = defineStore('background', () => {
  const backgroundImage = useStorage('background_image', '/background.png')
  const backgroundColor = useStorage('background_color', '#1a202c')
  const useCustomColor = useStorage('use_custom_color', true)

  function setBackgroundImage(url: string) {
    backgroundImage.value = url
  }

  function resetBackgroundImage() {
    backgroundImage.value = '/background.png'
  }

  function setBackgroundColor(color: string) {
    backgroundColor.value = color
  }

  function setUseCustomColor(value: boolean) {
    useCustomColor.value = value
  }

  function resetAll() {
    backgroundImage.value = '/background.png'
    backgroundColor.value = '#1a202c'
    useCustomColor.value = false
  }

  return {
    backgroundImage,
    backgroundColor,
    useCustomColor,
    setBackgroundImage,
    resetBackgroundImage,
    setBackgroundColor,
    setUseCustomColor,
    resetAll,
  }
})
