<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useImageStore } from './stores/imageStore'
import { useHistoryPanel } from './composables/useHistoryPanel'
import { BatchProcessor, ReportExporter, LicenseManager } from './services'
import type { BatchTask, ProcessStep } from './services'

const imageStore = useImageStore()
const { showHistoryPanel, currentHistory, selectedRecord, openHistory, closeHistory, selectRecord, clearHistory, getOperationLabel } = useHistoryPanel()
const opencvReady = ref(false)

// Batch processing state
const batchRunning = ref(false)
const batchProgress = ref(0)
const batchCompleted = ref(0)
const batchTotal = ref(0)
const batchProcessor = ref<BatchProcessor | null>(null)

// License state
const showLicenseModal = ref(false)
const licenseKey = ref('')
const licenseStatus = ref<{ type: string; message: string } | null>(null)
const licenseManager = new LicenseManager()

// License display helpers
const licenseTypeLabel = computed(() => {
  const lic = licenseManager.loadLicense()
  const labels: Record<string, string> = {
    trial: '试用版',
    standard: '标准版',
    pro: '专业版',
    enterprise: '企业版'
  }
  return labels[lic?.type || ''] || lic?.type || '未知'
})

const trialDaysLeft = computed(() => {
  const lic = licenseManager.loadLicense()
  if (!lic?.expiresAt) return 0
  const now = new Date()
  const expires = new Date(lic.expiresAt)
  const diff = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
})

function maskLicenseKey(key: string): string {
  if (key.length <= 8) return key
  return key.slice(0, 4) + '****' + key.slice(-4)
}

// Check license on mount
onMounted(() => {
  window.addEventListener('opencv-ready', () => {
    opencvReady.value = true
    console.log('OpenCV.js ready in Vue app')
  })

  const license = licenseManager.loadLicense()
  if (!license || !licenseManager.isValid(license)) {
    showLicenseModal.value = true
  }
})

async function runBatchProcess() {
  if (!licenseManager.hasFeature('batch')) {
    licenseStatus.value = { type: 'error', message: '批量处理需要标准版许可证' }
    showLicenseModal.value = true
    return
  }

  const steps: ProcessStep[] = ['autoCorrect', 'autoRemoveBorder', 'autoClean']
  const tasks: BatchTask[] = imageStore.imageList.map((img, idx) => ({
    id: `batch-${idx}`,
    imageId: img.id,
    steps,
    status: 'pending'
  }))

  batchTotal.value = tasks.length
  batchCompleted.value = 0
  batchProgress.value = 0
  batchRunning.value = true

  const processor = new BatchProcessor()
  batchProcessor.value = processor

  await processor.process(
    imageStore.currentMats as any,
    tasks,
    {
      parallel: true,
      maxConcurrency: 2,
      onProgress: (completed, total) => {
        batchCompleted.value = completed
        batchTotal.value = total
        batchProgress.value = Math.round((completed / total) * 100)
      },
      onError: (task, err) => {
        console.error(`Batch task ${task.id} failed:`, err)
      }
    }
  )

  batchRunning.value = false
}

function cancelBatch() {
  batchProcessor.value?.abort()
  batchRunning.value = false
}

async function exportReport() {
  if (!licenseManager.hasFeature('export')) {
    licenseStatus.value = { type: 'error', message: '导出功能需要标准版许可证' }
    showLicenseModal.value = true
    return
  }

  const exporter = new ReportExporter()
  const images = imageStore.imageList.map(img => ({
    id: img.id,
    name: img.name,
    path: img.path,
    processedUrl: img.processedUrl,
    status: img.status
  }))

  try {
    const pdfData = await exporter.exportPDF(images, {
      title: 'img2easy Pro 处理报告',
      author: 'img2easy Pro',
      includeThumbnails: true
    })

    // Download via Electron main process
    const buffer = pdfData as unknown as ArrayBuffer
    const blob = new Blob([buffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `img2easy-report-${Date.now()}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Export failed:', err)
  }
}

async function activateLicense() {
  const key = licenseKey.value.trim().toUpperCase()
  if (!licenseManager.validateFormat(key)) {
    licenseStatus.value = { type: 'error', message: '密钥格式无效' }
    return
  }

  const license = await licenseManager.verifyOnline(key)
  if (license) {
    licenseStatus.value = { type: 'success', message: '激活成功！' }
    setTimeout(() => {
      showLicenseModal.value = false
      licenseStatus.value = null
    }, 1500)
  } else {
    licenseStatus.value = { type: 'error', message: '密钥验证失败' }
  }
}

function startTrial() {
  licenseManager.generateTrial()
  licenseStatus.value = { type: 'success', message: '试用已开启（7天）' }
  setTimeout(() => {
    showLicenseModal.value = false
    licenseStatus.value = null
  }, 1500)
}
</script>

<template>
  <div id="app-container">
    <header class="app-header">
      <h1>img2easy Pro</h1>
      <div class="header-right">
        <span v-if="!opencvReady" class="status-badge loading">OpenCV 加载中...</span>
        <span v-else class="status-badge ready">OpenCV 就绪</span>
        <div class="license-status">
          <span
            v-if="licenseManager.isValid()"
            class="badge"
            :class="licenseManager.loadLicense()?.type === 'trial' ? 'trial' : 'active'"
            @click="showLicenseModal = true"
          >
            {{ licenseTypeLabel }}
          </span>
          <span v-else class="badge inactive" @click="showLicenseModal = true">未激活</span>
        </div>
      </div>
    </header>

    <main class="layout-container">
      <!-- Left: Task List -->
      <aside class="sidebar-left">
        <div class="task-panel">
          <h2>任务管理</h2>
          <div class="task-controls">
            <input
              v-model="imageStore.taskId"
              type="text"
              placeholder="输入任务号"
            />
            <button @click="imageStore.importFolder()">导入文件夹</button>
          </div>
          <div class="image-list">
            <div
              v-for="img in imageStore.imageList"
              :key="img.id"
              class="image-item"
              :class="{ active: imageStore.currentImage?.id === img.id }"
              @click="imageStore.selectImage(img.id)"
            >
              <img :src="img.thumbnail" :alt="img.name" />
              <span>{{ img.name }}</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- Center: Processing View -->
      <section class="main-content">
        <div class="processing-panel main-panel">
          <h3>正在处理</h3>
          <div class="image-wrapper main-image-wrapper">
            <canvas
              id="processedCanvas"
              ref="processedCanvas"
              width="600"
              height="800"
            ></canvas>
          </div>
          <div v-if="imageStore.processing" class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: imageStore.progress + '%' }"
            ></div>
          </div>
        </div>
      </section>

      <!-- Right: Original Image + Toolbar -->
      <aside class="sidebar-right">
        <div class="image-display-container thumbnail-panel">
          <h3>原始图片</h3>
          <div class="image-wrapper thumbnail-wrapper">
            <img
              v-if="imageStore.currentImage"
              :src="imageStore.currentImage.originalUrl"
              alt="原始图片"
            />
            <div v-else class="placeholder">请选择图片</div>
          </div>
        </div>

        <div class="toolbar toolbar-bottom">
          <div class="tool-group">
            <button @click="imageStore.rotate180()" title="旋转180°">↻180°</button>
          </div>
          <div class="tool-group">
            <button @click="imageStore.rotateLeft()" title="左转90°">↺90°</button>
            <button @click="imageStore.rotateRight()" title="右转90°">↻90°</button>
          </div>
          <div class="tool-group">
            <span>倾斜角度: {{ imageStore.skewAngle }}°</span>
          </div>
          <div class="tool-group">
            <button @click="imageStore.skewLeft()" title="向左倾斜">←倾斜</button>
            <button @click="imageStore.skewRight()" title="向右倾斜">→倾斜</button>
          </div>
          <div class="tool-group">
            <button @click="imageStore.crop()" title="手动裁剪">裁剪</button>
          </div>
          <div class="tool-group">
            <button @click="imageStore.undo()" title="撤销">撤销</button>
            <button @click="imageStore.redo()" title="重做">重做</button>
            <button @click="imageStore.reset()" title="重置">重置</button>
          </div>
          <div class="tool-group">
            <button @click="imageStore.autoCorrect()">自动校正</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="tool-group">
            <button @click="imageStore.selectRegion()">框选</button>
            <button @click="imageStore.autoRemoveBorder()">自动去黑边</button>
            <button @click="imageStore.autoClean()">自动去污</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="tool-group batch-group">
            <button @click="runBatchProcess()">批量处理</button>
            <button @click="exportReport()">导出报告</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="tool-group">
            <button @click="openHistory()">处理历史</button>
          </div>
        </div>
      </aside>
    </main>

    <!-- License Modal -->
    <div v-if="showLicenseModal" class="modal-overlay" @click.self="showLicenseModal = false">
      <div class="modal-content license-modal">
        <h3>🎯 img2easy Pro 许可证</h3>
        
        <!-- 试用状态 -->
        <div v-if="licenseManager.loadLicense()?.type === 'trial'" class="license-info">
          <p class="trial-badge">⏳ 试用中 — 剩余 {{ trialDaysLeft }} 天</p>
        </div>
        
        <!-- 已激活状态 -->
        <div v-else-if="licenseManager.isValid()" class="license-info">
          <p class="success-badge">✅ 已激活 — {{ licenseTypeLabel }}</p>
          <p class="license-detail">密钥: {{ maskLicenseKey(licenseManager.loadLicense()?.key || '') }}</p>
        </div>
        
        <!-- 未激活状态 -->
        <div v-else class="license-info">
          <p class="license-intro">输入许可证密钥激活完整功能，或开始7天免费试用。</p>
        </div>
        
        <!-- 定价方案 -->
        <div class="pricing-plans">
          <div class="plan">
            <h4>试用版</h4>
            <p class="plan-price">免费</p>
            <ul>
              <li>✓ 自动校正</li>
              <li>✓ 自动去污</li>
              <li>✗ 批量处理</li>
              <li>✗ 导出报告</li>
            </ul>
            <button v-if="!licenseManager.isValid()" @click="startTrial()" class="trial-btn">开始试用</button>
          </div>
          <div class="plan recommended">
            <div class="recommend-badge">推荐</div>
            <h4>标准版</h4>
            <p class="plan-price">¥199<span>/永久</span></p>
            <ul>
              <li>✓ 全部基础功能</li>
              <li>✓ 批量处理</li>
              <li>✓ 导出 PDF/Excel</li>
              <li>✓ 处理历史</li>
            </ul>
          </div>
          <div class="plan">
            <h4>专业版</h4>
            <p class="plan-price">¥399<span>/永久</span></p>
            <ul>
              <li>✓ 标准版全部功能</li>
              <li>✓ 优先技术支持</li>
              <li>✓ 未来版本升级</li>
              <li>✓ 多设备授权(3台)</li>
            </ul>
          </div>
        </div>
        
        <!-- 激活输入 -->
        <div v-if="!licenseManager.isValid()" class="activate-section">
          <p v-if="licenseStatus" :class="licenseStatus.type">{{ licenseStatus.message }}</p>
          <input
            v-model="licenseKey"
            placeholder="输入许可证密钥 (XXXX-XXXX-XXXX-XXXX)"
            maxlength="19"
            class="license-input"
          />
          <div class="modal-actions">
            <button @click="activateLicense()" class="primary-btn">激活</button>
            <button @click="showLicenseModal = false">关闭</button>
          </div>
        </div>
        <div v-else class="modal-actions">
          <button @click="showLicenseModal = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- History Panel -->
    <div v-if="showHistoryPanel" class="modal-overlay" @click.self="closeHistory()">
      <div class="modal-content history-panel">
        <h3>处理历史</h3>
        <div v-if="currentHistory.length === 0" class="empty-state">
          <p>暂无处理记录</p>
        </div>
        <div v-else class="history-list">
          <div
            v-for="record in currentHistory"
            :key="record.id"
            class="history-item"
            :class="{ active: selectedRecord?.id === record.id }"
            @click="selectRecord(record)"
          >
            <div class="history-meta">
              <span class="history-op">{{ getOperationLabel(record.operation) }}</span>
              <span class="history-time">{{ new Date(record.timestamp).toLocaleString('zh-CN') }}</span>
            </div>
            <div v-if="selectedRecord?.id === record.id" class="history-compare">
              <div v-if="record.beforeUrl" class="compare-side">
                <p>处理前</p>
                <img :src="record.beforeUrl" alt="before" />
              </div>
              <div v-if="record.afterUrl" class="compare-side">
                <p>处理后</p>
                <img :src="record.afterUrl" alt="after" />
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button @click="clearHistory()">清空历史</button>
          <button @click="closeHistory()">关闭</button>
        </div>
      </div>
    </div>
    <!-- Batch Progress Modal -->
    <div v-if="batchRunning" class="modal-overlay">
      <div class="modal-content">
        <h3>批量处理中...</h3>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: batchProgress + '%' }"></div>
        </div>
        <p>{{ batchCompleted }} / {{ batchTotal }} 完成</p>
        <button @click="cancelBatch()">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
#app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-header {
  height: 48px;
  background: #1a1a2e;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #333;
}

.app-header h1 {
  font-size: 18px;
  margin: 0;
}

.status-badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
}

.status-badge.loading {
  background: #f59e0b;
  color: #000;
}

.status-badge.ready {
  background: #10b981;
  color: #fff;
}

.layout-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar-left {
  width: 260px;
  background: #f8f9fa;
  border-right: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.task-panel {
  padding: 16px;
}

.task-panel h2 {
  font-size: 16px;
  margin-bottom: 12px;
}

.task-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.task-controls input {
  padding: 8px 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 13px;
}

.task-controls button {
  padding: 8px 12px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.task-controls button:hover {
  background: #1d4ed8;
}

.image-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.image-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.image-item:hover {
  background: #e9ecef;
}

.image-item.active {
  background: #dbeafe;
}

.image-item img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 3px;
}

.image-item span {
  font-size: 12px;
  color: #495057;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}

.processing-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.processing-panel h3 {
  font-size: 14px;
  margin-bottom: 12px;
  color: #343a40;
}

.main-image-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f3f5;
  border-radius: 6px;
  overflow: hidden;
}

.main-image-wrapper canvas {
  max-width: 100%;
  max-height: 100%;
}

.progress-bar {
  height: 6px;
  background: #e9ecef;
  border-radius: 3px;
  margin-top: 12px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #2563eb;
  border-radius: 3px;
  transition: width 0.3s;
}

.sidebar-right {
  width: 320px;
  background: #f8f9fa;
  border-left: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.thumbnail-panel {
  padding: 16px;
  border-bottom: 1px solid #e9ecef;
}

.thumbnail-panel h3 {
  font-size: 14px;
  margin-bottom: 12px;
  color: #343a40;
}

.thumbnail-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f3f5;
  border-radius: 6px;
  min-height: 180px;
}

.thumbnail-wrapper img {
  max-width: 100%;
  max-height: 220px;
  border-radius: 4px;
}

.placeholder {
  color: #adb5bd;
  font-size: 13px;
}

.toolbar {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tool-group {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.tool-group button {
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.tool-group button:hover {
  background: #f1f3f5;
  border-color: #adb5bd;
}

.tool-group span {
  font-size: 12px;
  color: #495057;
}

.toolbar-divider {
  height: 1px;
  background: #e9ecef;
  margin: 4px 0;
}

.batch-group button {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.batch-group button:hover {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  padding: 24px;
  border-radius: 8px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-content h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.modal-content input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 14px;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.modal-actions button {
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid #ced4da;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}

.modal-actions button:first-child {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.modal-content .success {
  color: #10b981;
  font-size: 13px;
  margin-bottom: 8px;
}

.modal-content .error {
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 8px;
}

/* History panel styles */
.history-panel {
  width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.history-item {
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.history-item:hover {
  background: #f8f9fa;
}

.history-item.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.history-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-op {
  font-weight: 500;
  font-size: 13px;
  color: #1a1a2e;
}

.history-time {
  font-size: 11px;
  color: #6c757d;
}

.history-compare {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #dee2e6;
}

.compare-side {
  flex: 1;
  text-align: center;
}

.compare-side p {
  font-size: 11px;
  color: #6c757d;
  margin-bottom: 4px;
}

.compare-side img {
  max-width: 100%;
  max-height: 150px;
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.empty-state {
  text-align: center;
  padding: 32px;
  color: #adb5bd;
  font-size: 13px;
}
/* License modal enhanced styles */
.license-modal {
  width: 720px;
  max-width: 95vw;
}

.license-info {
  text-align: center;
  margin-bottom: 16px;
}

.trial-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 8px 16px;
  border-radius: 20px;
  display: inline-block;
  font-size: 13px;
  font-weight: 500;
}

.success-badge {
  background: #d1fae5;
  color: #065f46;
  padding: 8px 16px;
  border-radius: 20px;
  display: inline-block;
  font-size: 13px;
  font-weight: 500;
}

.license-intro {
  color: #6b7280;
  font-size: 13px;
}

.license-detail {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.pricing-plans {
  display: flex;
  gap: 12px;
  margin: 16px 0;
}

.plan {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  position: relative;
}

.plan.recommended {
  border-color: #2563eb;
  background: #eff6ff;
}

.recommend-badge {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: #2563eb;
  color: #fff;
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 10px;
}

.plan h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
}

.plan-price {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 12px 0;
}

.plan-price span {
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
}

.plan ul {
  list-style: none;
  padding: 0;
  margin: 0 0 12px 0;
  text-align: left;
}

.plan li {
  font-size: 12px;
  color: #4b5563;
  padding: 3px 0;
}

.trial-btn {
  background: #f59e0b;
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.trial-btn:hover {
  background: #d97706;
}

.activate-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.license-input {
  text-align: center;
  font-family: monospace;
  letter-spacing: 2px;
}

.primary-btn {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.primary-btn:hover {
  background: #1d4ed8;
}

/* Header license status */
.license-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.license-status .badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
}

.license-status .badge.trial {
  background: #fef3c7;
  color: #92400e;
}

.license-status .badge.active {
  background: #d1fae5;
  color: #065f46;
}

.license-status .badge.inactive {
  background: #fee2e2;
  color: #991b1b;
}
</style>
