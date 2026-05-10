/**
 * 处理历史记录面板组件
 * 显示每张图片的处理操作历史，支持对比查看
 */

import { ref, computed } from 'vue'
import { useImageStore } from '../stores/imageStore'
import type { ProcessingRecord } from '../stores/imageStore'

export function useHistoryPanel() {
  const imageStore = useImageStore()
  const showHistoryPanel = ref(false)
  const selectedRecordId = ref<string | null>(null)

  const currentHistory = computed(() => {
    if (!imageStore.currentImage) return []
    return imageStore.getHistoryByImage(imageStore.currentImage.id)
  })

  const selectedRecord = computed(() => {
    if (!selectedRecordId.value) return null
    return currentHistory.value.find((r) => r.id === selectedRecordId.value) || null
  })

  function openHistory() {
    showHistoryPanel.value = true
    selectedRecordId.value = null
  }

  function closeHistory() {
    showHistoryPanel.value = false
    selectedRecordId.value = null
  }

  function selectRecord(record: ProcessingRecord) {
    selectedRecordId.value = record.id
  }

  function clearHistory() {
    imageStore.clearProcessingHistory()
    selectedRecordId.value = null
  }

  function getOperationLabel(op: string): string {
    const labels: Record<string, string> = {
      rotate180: '旋转180°',
      rotateLeft: '左旋90°',
      rotateRight: '右旋90°',
      crop: '裁剪',
      reset: '重置',
      autoCorrect: '自动校正',
      autoRemoveBorder: '自动去黑边',
      autoClean: '自动去污'
    }
    return labels[op] || op
  }

  return {
    showHistoryPanel,
    currentHistory,
    selectedRecord,
    openHistory,
    closeHistory,
    selectRecord,
    clearHistory,
    getOperationLabel
  }
}
