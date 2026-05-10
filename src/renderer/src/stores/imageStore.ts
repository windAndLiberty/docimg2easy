import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ImageItem {
  id: string
  name: string
  path: string
  thumbnail: string
  originalUrl: string
  processedUrl?: string
  status: 'pending' | 'processing' | 'done' | 'error'
}

export const useImageStore = defineStore('image', () => {
  // State
  const taskId = ref('')
  const imageList = ref<ImageItem[]>([])
  const currentImageId = ref<string | null>(null)
  const processing = ref(false)
  const progress = ref(0)
  const skewAngle = ref(0)
  const history = ref<ImageItem[][]>([])

  // Getters
  const currentImage = computed(() =>
    imageList.value.find((img) => img.id === currentImageId.value) || null
  )

  const pendingCount = computed(() =>
    imageList.value.filter((img) => img.status === 'pending').length
  )

  const doneCount = computed(() =>
    imageList.value.filter((img) => img.status === 'done').length
  )

  // Actions
  async function importFolder(): Promise<void> {
    try {
      const folderPath = await window.api.openDirectory()
      if (!folderPath) return

      // Scan folder for images via main process
      const imagePaths: string[] = await window.api.scanFolder(folderPath)
      const newImages: ImageItem[] = imagePaths.map((p, idx) => ({
        id: `img-${Date.now()}-${idx}`,
        name: p.split(/[\\/]/).pop() || p,
        path: p,
        thumbnail: '', // will be generated lazily
        originalUrl: `file://${p}`,
        status: 'pending'
      }))

      imageList.value.push(...newImages)
      if (!currentImageId.value && newImages.length > 0) {
        currentImageId.value = newImages[0].id
      }
    } catch (err) {
      console.error('Failed to import folder:', err)
    }
  }

  function selectImage(id: string): void {
    currentImageId.value = id
  }

  function addImages(images: ImageItem[]): void {
    imageList.value.push(...images)
    if (!currentImageId.value && images.length > 0) {
      currentImageId.value = images[0].id
    }
  }

  function removeImage(id: string): void {
    const idx = imageList.value.findIndex((img) => img.id === id)
    if (idx !== -1) {
      imageList.value.splice(idx, 1)
      if (currentImageId.value === id) {
        currentImageId.value = imageList.value[0]?.id || null
      }
    }
  }

  function saveHistory(): void {
    history.value.push(JSON.parse(JSON.stringify(imageList.value)))
  }

  function undo(): void {
    if (history.value.length > 0) {
      imageList.value = history.value.pop() || []
    }
  }

  function rotate180(): void {
    saveHistory()
    // TODO: implement rotation via OpenCV
    console.log('rotate180')
  }

  function rotateLeft(): void {
    saveHistory()
    // TODO: implement rotation via OpenCV
    console.log('rotateLeft')
  }

  function rotateRight(): void {
    saveHistory()
    // TODO: implement rotation via OpenCV
    console.log('rotateRight')
  }

  function skewLeft(): void {
    saveHistory()
    skewAngle.value -= 1
    // TODO: implement skew via OpenCV
    console.log('skewLeft', skewAngle.value)
  }

  function skewRight(): void {
    saveHistory()
    skewAngle.value += 1
    // TODO: implement skew via OpenCV
    console.log('skewRight', skewAngle.value)
  }

  function crop(): void {
    saveHistory()
    // TODO: implement crop
    console.log('crop')
  }

  function reset(): void {
    saveHistory()
    skewAngle.value = 0
    // TODO: reset image to original
    console.log('reset')
  }

  function autoCorrect(): void {
    saveHistory()
    processing.value = true
    progress.value = 0
    // TODO: implement auto correction via OpenCV
    console.log('autoCorrect')
    processing.value = false
    progress.value = 100
  }

  function selectRegion(): void {
    // TODO: implement region selection
    console.log('selectRegion')
  }

  function autoRemoveBorder(): void {
    saveHistory()
    processing.value = true
    // TODO: implement border removal
    console.log('autoRemoveBorder')
    processing.value = false
  }

  function autoClean(): void {
    saveHistory()
    processing.value = true
    // TODO: implement auto clean
    console.log('autoClean')
    processing.value = false
  }

  function setProgress(value: number): void {
    progress.value = Math.max(0, Math.min(100, value))
  }

  return {
    taskId,
    imageList,
    currentImageId,
    currentImage,
    processing,
    progress,
    skewAngle,
    pendingCount,
    doneCount,
    importFolder,
    selectImage,
    addImages,
    removeImage,
    undo,
    rotate180,
    rotateLeft,
    rotateRight,
    skewLeft,
    skewRight,
    crop,
    reset,
    autoCorrect,
    selectRegion,
    autoRemoveBorder,
    autoClean,
    setProgress
  }
})
