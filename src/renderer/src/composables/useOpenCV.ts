/**
 * OpenCV.js 加载管理组合式函数
 * 处理 OpenCV.js 的异步加载和就绪状态
 */
import { ref, onMounted } from 'vue'

const cvReady = ref(false)
const cvLoading = ref(false)
const cvError = ref<string | null>(null)

export function useOpenCV() {
  onMounted(() => {
    if (cvReady.value) return

    cvLoading.value = true

    // 检查 OpenCV 是否已加载
    const checkReady = () => {
      if (typeof (window as any).cv !== 'undefined' && (window as any).cv.Mat) {
        cvReady.value = true
        cvLoading.value = false
        console.log('OpenCV.js ready')
        return true
      }
      return false
    }

    if (checkReady()) return

    // 监听自定义事件
    const onReady = () => {
      cvReady.value = true
      cvLoading.value = false
      window.removeEventListener('opencv-ready', onReady)
    }
    window.addEventListener('opencv-ready', onReady)

    // 超时处理
    setTimeout(() => {
      if (!cvReady.value) {
        cvError.value = 'OpenCV.js 加载超时'
        cvLoading.value = false
      }
    }, 30000)
  })

  const waitReady = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (cvReady.value) {
        resolve()
        return
      }
      const interval = setInterval(() => {
        if (cvReady.value) {
          clearInterval(interval)
          resolve()
        }
        if (cvError.value) {
          clearInterval(interval)
          reject(new Error(cvError.value))
        }
      }, 100)
      setTimeout(() => {
        clearInterval(interval)
        reject(new Error('OpenCV.js 加载超时'))
      }, 30000)
    })
  }

  return {
    ready: cvReady,
    loading: cvLoading,
    error: cvError,
    waitReady,
    getCv: () => {
      if (!cvReady.value) throw new Error('OpenCV.js 尚未加载')
      return (window as any).cv as any
    }
  }
}
