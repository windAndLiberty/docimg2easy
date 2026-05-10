import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import { ImageProcessor, AngleCorrector, BorderRemover, DocumentCleaner, EdgeCleaner } from '../services'
import { useOpenCV } from '../composables/useOpenCV'

export interface ImageItem {
  id: string
  name: string
  path: string
  thumbnail: string
  originalUrl: string
  processedUrl?: string
  status: 'pending' | 'processing' | 'done' | 'error'
}

interface MatState {
  mat: any
  url: string
}

export interface ProcessingRecord {
  id: string
  imageId: string
  imageName: string
  operation: string
  timestamp: string
  beforeUrl?: string
  afterUrl?: string
}

export const useImageStore = defineStore('image', () => {
  // OpenCV composable
  const { ready: opencvReady, waitReady } = useOpenCV()

  // Services (lazy init after cv ready)
  const imageProcessor = shallowRef<ImageProcessor | null>(null)
  const angleCorrector = shallowRef<AngleCorrector | null>(null)
  const borderRemover = shallowRef<BorderRemover | null>(null)
  const documentCleaner = shallowRef<DocumentCleaner | null>(null)
  const edgeCleaner = shallowRef<EdgeCleaner | null>(null)

  async function initServices() {
    if (imageProcessor.value) return
    await waitReady()
    imageProcessor.value = new ImageProcessor()
    angleCorrector.value = new AngleCorrector()
    borderRemover.value = new BorderRemover()
    documentCleaner.value = new DocumentCleaner()
    edgeCleaner.value = new EdgeCleaner()
  }

  // State
  const taskId = ref('')
  const imageList = ref<ImageItem[]>([])
  const currentImageId = ref<string | null>(null)
  const processing = ref(false)
  const progress = ref(0)
  const skewAngle = ref(0)

  // Undo/redo history stored as Mat clones + url snapshots
  const historyStack = shallowRef<MatState[][]>([])
  const redoStack = shallowRef<MatState[][]>([])

  // Current working Mat for the selected image
  const currentMats = shallowRef<Map<string, MatState>>(new Map())

  // Processing history records
  const processingHistory = ref<ProcessingRecord[]>([])

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

  // Helpers
  function matToDataUrl(mat: any): string {
    const canvas = document.createElement('canvas')
    canvas.width = mat.cols
    canvas.height = mat.rows
    const cv = (window as any).cv
    cv.imshow(canvas, mat)
    return canvas.toDataURL('image/png')
  }

  function saveHistory(): void {
    const snapshot: MatState[] = []
    currentMats.value.forEach((state) => {
      snapshot.push({ mat: state.mat.clone(), url: state.url })
    })
    historyStack.value.push(snapshot)
    redoStack.value = []
  }

  function applySnapshot(snapshot: MatState[]) {
    // Clean old mats
    currentMats.value.forEach((state) => {
      try { state.mat.delete() } catch {}
    })
    const next = new Map<string, MatState>()
    for (const s of snapshot) {
      next.set(s.url ? s.url : '', { mat: s.mat.clone(), url: s.url })
    }
    currentMats.value = next
    // Update processedUrl for current image
    if (currentImageId.value) {
      const st = next.get(currentImageId.value)
      if (st) {
        const item = imageList.value.find((i) => i.id === currentImageId.value)
        if (item) item.processedUrl = st.url
      }
    }
  }

  function undo(): void {
    if (historyStack.value.length > 0) {
      const currentSnapshot: MatState[] = []
      currentMats.value.forEach((state) => {
        currentSnapshot.push({ mat: state.mat.clone(), url: state.url })
      })
      redoStack.value.push(currentSnapshot)
      const prev = historyStack.value.pop()!
      applySnapshot(prev)
    }
  }

  function redo(): void {
    if (redoStack.value.length > 0) {
      const currentSnapshot: MatState[] = []
      currentMats.value.forEach((state) => {
        currentSnapshot.push({ mat: state.mat.clone(), url: state.url })
      })
      historyStack.value.push(currentSnapshot)
      const next = redoStack.value.pop()!
      applySnapshot(next)
    }
  }

  function addProcessingRecord(imageId: string, operation: string, beforeUrl?: string, afterUrl?: string): void {
    const item = imageList.value.find((i) => i.id === imageId)
    processingHistory.value.push({
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      imageId,
      imageName: item?.name || imageId,
      operation,
      timestamp: new Date().toISOString(),
      beforeUrl,
      afterUrl
    })
  }

  function clearProcessingHistory(): void {
    processingHistory.value = []
  }

  function getHistoryByImage(imageId: string): ProcessingRecord[] {
    return processingHistory.value.filter((r) => r.imageId === imageId)
  }

  // Actions
  async function importFolder(): Promise<void> {
    try {
      console.log('[importFolder] Calling window.api.openDirectory()...')
      const folderPath = await (window as any).api.openDirectory()
      console.log('[importFolder] folderPath:', folderPath)
      if (!folderPath) {
        console.log('[importFolder] User cancelled or no folder selected')
        return
      }

      console.log('[importFolder] Scanning folder:', folderPath)
      const imagePaths: string[] = await (window as any).api.scanFolder(folderPath)
      console.log('[importFolder] Found images:', imagePaths.length, imagePaths)

      if (imagePaths.length === 0) {
        console.warn('[importFolder] No images found in folder:', folderPath)
        return
      }

      const newImages: ImageItem[] = imagePaths.map((p, idx) => ({
        id: `img-${Date.now()}-${idx}`,
        name: p.split(/[\\/]/).pop() || p,
        path: p,
        thumbnail: '',
        originalUrl: `file://${p}`,
        status: 'pending'
      }))

      imageList.value.push(...newImages)
      if (!currentImageId.value && newImages.length > 0) {
        currentImageId.value = newImages[0].id
      }
      console.log('[importFolder] Added', newImages.length, 'images')
    } catch (err) {
      console.error('[importFolder] Failed to import folder:', err)
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
      const matState = currentMats.value.get(id)
      if (matState) {
        try { matState.mat.delete() } catch {}
        currentMats.value.delete(id)
      }
      if (currentImageId.value === id) {
        currentImageId.value = imageList.value[0]?.id || null
      }
    }
  }

  async function ensureMat(): Promise<any> {
    await initServices()
    const item = currentImage.value
    if (!item) return null
    let state = currentMats.value.get(item.id)
    if (state) return state.mat
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const cv = (window as any).cv
        const mat = cv.imread(canvas)
        const url = canvas.toDataURL('image/png')
        currentMats.value.set(item.id, { mat, url })
        item.processedUrl = url
        resolve(mat)
      }
      img.onerror = () => resolve(null)
      img.src = item.originalUrl
    })
  }

  function updateCurrentMat(mat: any): void {
    const item = currentImage.value
    if (!item) return
    const old = currentMats.value.get(item.id)
    if (old) {
      try { old.mat.delete() } catch {}
    }
    const url = matToDataUrl(mat)
    currentMats.value.set(item.id, { mat, url })
    item.processedUrl = url
  }

  async function rotate180(): Promise<void> {
    const mat = await ensureMat()
    if (!mat) return
    const beforeUrl = currentImage.value?.processedUrl
    saveHistory()
    const cv = (window as any).cv
    const dst = new cv.Mat()
    cv.rotate(mat, dst, cv.ROTATE_180)
    updateCurrentMat(dst)
    addProcessingRecord(currentImageId.value || '', 'rotate180', beforeUrl, currentImage.value?.processedUrl)
  }

  async function rotateLeft(): Promise<void> {
    const mat = await ensureMat()
    if (!mat) return
    const beforeUrl = currentImage.value?.processedUrl
    saveHistory()
    const cv = (window as any).cv
    const dst = new cv.Mat()
    cv.rotate(mat, dst, cv.ROTATE_90_COUNTERCLOCKWISE)
    updateCurrentMat(dst)
    addProcessingRecord(currentImageId.value || '', 'rotateLeft', beforeUrl, currentImage.value?.processedUrl)
  }

  async function rotateRight(): Promise<void> {
    const mat = await ensureMat()
    if (!mat) return
    const beforeUrl = currentImage.value?.processedUrl
    saveHistory()
    const cv = (window as any).cv
    const dst = new cv.Mat()
    cv.rotate(mat, dst, cv.ROTATE_90_CLOCKWISE)
    updateCurrentMat(dst)
    addProcessingRecord(currentImageId.value || '', 'rotateRight', beforeUrl, currentImage.value?.processedUrl)
  }

  function skewLeft(): void {
    skewAngle.value -= 1
  }

  function skewRight(): void {
    skewAngle.value += 1
  }

  async function crop(rect?: { x: number; y: number; width: number; height: number }): Promise<void> {
    const mat = await ensureMat()
    if (!mat || !imageProcessor.value) return
    const beforeUrl = currentImage.value?.processedUrl
    saveHistory()
    // If no rect provided, use a default center crop or rely on UI selection later
    const defaultRect = rect || {
      x: Math.round(mat.cols * 0.1),
      y: Math.round(mat.rows * 0.1),
      width: Math.round(mat.cols * 0.8),
      height: Math.round(mat.rows * 0.8)
    }
    const dst = imageProcessor.value.crop(mat, defaultRect)
    updateCurrentMat(dst)
    addProcessingRecord(currentImageId.value || '', 'crop', beforeUrl, currentImage.value?.processedUrl)
  }

  async function reset(): Promise<void> {
    const item = currentImage.value
    if (!item) return
    const beforeUrl = currentImage.value?.processedUrl
    saveHistory()
    skewAngle.value = 0
    // Reload original mat
    const old = currentMats.value.get(item.id)
    if (old) {
      try { old.mat.delete() } catch {}
      currentMats.value.delete(item.id)
    }
    await ensureMat()
    addProcessingRecord(currentImageId.value || '', 'reset', beforeUrl, currentImage.value?.processedUrl)
  }

  async function autoCorrect(): Promise<void> {
    const mat = await ensureMat()
    if (!mat || !angleCorrector.value) return
    const beforeUrl = currentImage.value?.processedUrl
    saveHistory()
    processing.value = true
    progress.value = 0
    try {
      const dst = await angleCorrector.value.correct(mat)
      updateCurrentMat(dst)
      progress.value = 100
      addProcessingRecord(currentImageId.value || '', 'autoCorrect', beforeUrl, currentImage.value?.processedUrl)
    } catch (e) {
      console.error('autoCorrect error', e)
    } finally {
      processing.value = false
    }
  }

  async function autoRemoveBorder(): Promise<void> {
    const mat = await ensureMat()
    if (!mat || !borderRemover.value) return
    const beforeUrl = currentImage.value?.processedUrl
    saveHistory()
    processing.value = true
    try {
      const dst = await borderRemover.value.removeBorder(mat)
      updateCurrentMat(dst)
      addProcessingRecord(currentImageId.value || '', 'autoRemoveBorder', beforeUrl, currentImage.value?.processedUrl)
    } catch (e) {
      console.error('autoRemoveBorder error', e)
    } finally {
      processing.value = false
    }
  }

  async function autoClean(): Promise<void> {
    const mat = await ensureMat()
    if (!mat || !documentCleaner.value) return
    const beforeUrl = currentImage.value?.processedUrl
    saveHistory()
    processing.value = true
    try {
      const dst = await documentCleaner.value.clean(mat)
      updateCurrentMat(dst)
      addProcessingRecord(currentImageId.value || '', 'autoClean', beforeUrl, currentImage.value?.processedUrl)
    } catch (e) {
      console.error('autoClean error', e)
    } finally {
      processing.value = false
    }
  }

  function selectRegion(): void {
    // TODO: implement region selection UI interaction
    console.log('selectRegion')
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
    opencvReady,
    pendingCount,
    doneCount,
    processingHistory,
    importFolder,
    selectImage,
    addImages,
    removeImage,
    saveHistory,
    undo,
    redo,
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
    setProgress,
    ensureMat,
    matToDataUrl,
    currentMats,
    addProcessingRecord,
    clearProcessingHistory,
    getHistoryByImage
  }
})
