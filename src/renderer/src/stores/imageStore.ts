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

  // Actions
  async function importFolder(): Promise<void> {
    try {
      const folderPath = await (window as any).api.openDirectory()
      if (!folderPath) return

      const imagePaths: string[] = await (window as any).api.scanFolder(folderPath)
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
    saveHistory()
    const cv = (window as any).cv
    const dst = new cv.Mat()
    cv.rotate(mat, dst, cv.ROTATE_180)
    updateCurrentMat(dst)
  }

  async function rotateLeft(): Promise<void> {
    const mat = await ensureMat()
    if (!mat) return
    saveHistory()
    const cv = (window as any).cv
    const dst = new cv.Mat()
    cv.rotate(mat, dst, cv.ROTATE_90_COUNTERCLOCKWISE)
    updateCurrentMat(dst)
  }

  async function rotateRight(): Promise<void> {
    const mat = await ensureMat()
    if (!mat) return
    saveHistory()
    const cv = (window as any).cv
    const dst = new cv.Mat()
    cv.rotate(mat, dst, cv.ROTATE_90_CLOCKWISE)
    updateCurrentMat(dst)
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
  }

  async function reset(): Promise<void> {
    const item = currentImage.value
    if (!item) return
    saveHistory()
    skewAngle.value = 0
    // Reload original mat
    const old = currentMats.value.get(item.id)
    if (old) {
      try { old.mat.delete() } catch {}
      currentMats.value.delete(item.id)
    }
    await ensureMat()
  }

  async function autoCorrect(): Promise<void> {
    const mat = await ensureMat()
    if (!mat || !angleCorrector.value) return
    saveHistory()
    processing.value = true
    progress.value = 0
    try {
      const dst = await angleCorrector.value.correct(mat)
      updateCurrentMat(dst)
      progress.value = 100
    } catch (e) {
      console.error('autoCorrect error', e)
    } finally {
      processing.value = false
    }
  }

  async function autoRemoveBorder(): Promise<void> {
    const mat = await ensureMat()
    if (!mat || !borderRemover.value) return
    saveHistory()
    processing.value = true
    try {
      const dst = await borderRemover.value.removeBorder(mat)
      updateCurrentMat(dst)
    } catch (e) {
      console.error('autoRemoveBorder error', e)
    } finally {
      processing.value = false
    }
  }

  async function autoClean(): Promise<void> {
    const mat = await ensureMat()
    if (!mat || !documentCleaner.value) return
    saveHistory()
    processing.value = true
    try {
      const dst = await documentCleaner.value.clean(mat)
      updateCurrentMat(dst)
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
    matToDataUrl
  }
})
