/**
 * 主控制器
 * 负责初始化应用、协调各模块、处理用户交互
 */

import { ImageProcessor } from './core/image-processor.js';
import { AngleCorrector } from './core/angle-corrector.js';
import { BorderRemover } from './core/border-remover.js';
import { EdgeCleaner } from './core/edge-cleaner.js';
import { DocumentCleaner } from './core/document-cleaner.js';
import { ImageViewer } from './ui/image-viewer.js';
import { ToolbarController } from './ui/toolbar-controller.js';
import { FileHandler } from './utils/file-handler.js';
import { PerformanceMonitor } from './utils/performance-monitor.js';

class MainController {
  constructor() {
    this.imageProcessor = null;
    this.angleCorrector = null;
    this.borderRemover = null;
    this.edgeCleaner = null;
    this.documentCleaner = null;
    this.imageViewer = null;
    this.toolbarController = null;
    this.fileHandler = null;
    this.performanceMonitor = null;
    
    this.currentImage = null;
    this.originalImage = null;
    this.imageHistory = [];
    this.maxHistory = 20;
    
    this.imageList = [];
    this.currentIndex = -1;
    
    this.isProcessing = false;
    this.isReady = false;
    
    // 新增：倾斜角度状态管理
    this.currentSkewAngle = 0;
    this.maxSkewAngle = 45;
    
    // 框选功能状态管理
    this.selectionState = 'INACTIVE'; // INACTIVE, SELECTING, SELECTED
    this.currentSelection = null; // {x, y, width, height}
    this.preSelectionImage = null; // 框选前的图像
    
    this.init();
  }

  deleteMat(mat) {
    if (!mat) return;
    try {
      if (typeof mat.delete === 'function') {
        mat.delete();
      }
    } catch (error) {
      console.warn('deleteMat: 无法删除 Mat', error);
    }
  }

  setCurrentImage(mat) {
    if (!mat) return;
    this.deleteMat(this.currentImage);
    this.currentImage = mat;
  }

  normalizeSkewAngle(angle) {
    if (typeof angle !== 'number' || Number.isNaN(angle)) {
      return 0;
    }
    let normalized = ((angle % 360) + 360) % 360;
    if (normalized > 180) {
      normalized -= 360;
    }
    return Math.max(-this.maxSkewAngle, Math.min(this.maxSkewAngle, normalized));
  }
  
  async init() {
    console.log('初始化文档图像处理工具...');
    
    // 等待OpenCV.js加载完成
    await this.waitForOpenCV();
    
    // 初始化各个模块
    this.performanceMonitor = new PerformanceMonitor();
    this.fileHandler = new FileHandler();
    this.imageViewer = new ImageViewer('originalImage', 'processedCanvas');
    this.imageProcessor = new ImageProcessor();
    this.angleCorrector = new AngleCorrector();
    this.borderRemover = new BorderRemover();
    this.edgeCleaner = new EdgeCleaner();
    this.documentCleaner = new DocumentCleaner();
    
    // 初始化工具栏控制器
    this.toolbarController = new ToolbarController({
      onRotate180: () => this.rotate180(),
      onRotateLeft: () => this.rotateLeft(),
      onRotateRight: () => this.rotateRight(),
      onCrop: () => this.startCrop(),
      onSkewLeft: () => this.skewLeft(),
      onSkewRight: () => this.skewRight(),
      onUndo: () => this.undo(),
      onReset: () => this.reset(),
      onAutoCorrect: () => this.autoCorrect(),
      onAutoRemoveBorder: () => this.autoRemoveBorder(),
      onAutoClean: () => this.autoClean(),
      onSelectRegion: () => this.onSelectRegion(),
      onCancelSelection: () => this.cancelSelection()
    });
    
    // 设置Canvas点击回调
    this.imageViewer.setOnCanvasClick((clickType, coords) => {
      this.handleCanvasClick(clickType, coords);
    });
    
    // 绑定事件
    this.bindEvents();
    this.bindShortcuts();
    
    this.isReady = true;
    console.log('初始化完成，OpenCV.js 已就绪');
  }
  
  waitForOpenCV() {
    return new Promise((resolve, reject) => {
      // 检查是否已经加载并初始化完成
      if (typeof cv !== 'undefined' && cv.Mat) {
        console.log('OpenCV.js 已加载，跳过等待');
        resolve();
        return;
      }
      
      // 防止重复等待
      if (window.__opencvWaiting) {
        console.log('已有等待中的 OpenCV 加载请求');
        window.addEventListener('opencv-ready', () => resolve(), { once: true });
        return;
      }
      window.__opencvWaiting = true;
      
      // 设置超时
      const timeout = setTimeout(() => {
        window.__opencvWaiting = false;
        reject(new Error('OpenCV.js 加载超时'));
      }, 30000);
      
      // 监听自定义事件
      const onReady = () => {
        clearTimeout(timeout);
        window.__opencvWaiting = false;
        window.removeEventListener('opencv-ready', onReady);
        resolve();
      };
      
      window.addEventListener('opencv-ready', onReady);
      
      // 如果cv对象已存在但未初始化
      if (typeof cv !== 'undefined') {
        cv['onRuntimeInitialized'] = () => {
          clearTimeout(timeout);
          if (!window.__opencvReadyCalled) {
            window.__opencvReadyCalled = true;
            window.dispatchEvent(new CustomEvent('opencv-ready'));
          }
          window.__opencvWaiting = false;
          resolve();
        };
      }
    });
  }
  
  bindEvents() {
    // 文件夹导入按钮
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('folderInput').click();
    });
    
    // 文件夹选择
    document.getElementById('folderInput').addEventListener('change', (e) => {
      this.handleFolderSelect(e);
    });
    
    // 任务号输入
    document.getElementById('taskIdInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.loadTaskById(e.target.value);
      }
    });
  }
  
  bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Esc键处理：在任何状态下都可以取消框选
      if (e.key === 'Escape') {
        if (this.selectionState !== 'INACTIVE') {
          this.cancelSelection();
          e.preventDefault();
        }
        return;
      }
      
      if (!this.isReady || this.isProcessing || !this.currentImage) return;
      
      // 如果正在输入文本，不处理快捷键
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch (e.key.toLowerCase()) {
        case 'b':
          this.rotate180();
          break;
        case 'r':
          this.rotateLeft();
          break;
        case 't':
          this.rotateRight();
          break;
        case 's':
          this.startCrop();
          break;
        case 'w':
          this.skewLeft();
          break;
        case 'e':
          this.skewRight();
          break;
        case 'a':
          this.undo();
          break;
        case 'z':
          this.reset();
          break;
      }
    });
  }
  
  async handleFolderSelect(event) {
    const files = Array.from(event.target.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      alert('未找到图片文件');
      return;
    }
    
    this.imageList = imageFiles.map((file, index) => ({
      file,
      id: index,
      name: file.name,
      status: 'pending',
      processed: false
    }));
    
    this.renderImageList();
    
    if (this.imageList.length > 0) {
      await this.loadImage(0);
    }
  }
  
  renderImageList() {
    const container = document.getElementById('imageList');
    container.innerHTML = '';
    
    this.imageList.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = `image-list-item ${index === this.currentIndex ? 'active' : ''}`;
      div.innerHTML = `
        <div class="info">
          <div class="filename" title="${item.name}">${item.name}</div>
          <div class="status">
            <span class="status-indicator ${item.status}"></span>
            ${this.getStatusText(item.status)}
          </div>
        </div>
      `;
      div.addEventListener('click', () => this.loadImage(index));
      container.appendChild(div);
    });
  }
  
  getStatusText(status) {
    const statusMap = {
      'pending': '等待处理',
      'processing': '处理中...',
      'completed': '已完成',
      'error': '处理失败'
    };
    return statusMap[status] || status;
  }
  
  async loadImage(index) {
    if (this.isProcessing) return;
    
    // 加载新图片前取消框选
    this.cancelSelection();
    
    this.currentIndex = index;
    const item = this.imageList[index];
    
    try {
      const imageData = await this.fileHandler.loadImageFile(item.file);
      this.deleteMat(this.currentImage);
      this.deleteMat(this.originalImage);
      this.currentImage = imageData;
      this.originalImage = imageData.clone();
      this.imageHistory.forEach((h) => this.deleteMat(h.image));
      this.imageHistory = [];
      // 重置倾斜角度
      this.currentSkewAngle = 0;
      this.updateSkewAngleDisplay();
      
      this.imageViewer.displayOriginal(imageData);
      this.imageViewer.displayProcessed(imageData);
      
      this.renderImageList();
    } catch (error) {
      console.error('加载图片失败:', error);
      alert('加载图片失败');
    }
  }
  
  async loadTaskById(taskId) {
    // 根据任务号加载图片的逻辑
    // 这里可以扩展为从服务器或本地存储加载
    console.log('加载任务:', taskId);
  }
  
  saveToHistory() {
    if (this.currentImage) {
      // 保存图像和当前倾斜角度
      this.imageHistory.push({
        image: this.currentImage.clone(),
        skewAngle: this.currentSkewAngle
      });
      if (this.imageHistory.length > this.maxHistory) {
        const removed = this.imageHistory.shift();
        if (removed && removed.image) {
          this.deleteMat(removed.image);
        }
      }
    }
  }
  
  async rotate180() {
    if (!this.currentImage || this.isProcessing) return;
    
    this.startProcessing();
    this.saveToHistory();
    
    try {
      const rotated = this.imageProcessor.rotate(this.currentImage, 180);
      this.setCurrentImage(rotated);
      this.imageViewer.displayProcessed(this.currentImage);
    } catch (error) {
      console.error('旋转失败:', error);
    }
    
    this.endProcessing();
  }
  
  async rotateLeft() {
    if (!this.currentImage || this.isProcessing) return;
    
    this.startProcessing();
    this.saveToHistory();
    
    try {
      const rotated = this.imageProcessor.rotate(this.currentImage, 90);
      this.setCurrentImage(rotated);
      this.imageViewer.displayProcessed(this.currentImage);
    } catch (error) {
      console.error('旋转失败:', error);
    }
    
    this.endProcessing();
  }
  
  async rotateRight() {
    if (!this.currentImage || this.isProcessing) return;
    
    this.startProcessing();
    this.saveToHistory();
    
    try {
      const rotated = this.imageProcessor.rotate(this.currentImage, -90);
      this.setCurrentImage(rotated);
      this.imageViewer.displayProcessed(this.currentImage);
    } catch (error) {
      console.error('旋转失败:', error);
    }
    
    this.endProcessing();
  }
  
  startCrop() {
    if (!this.currentImage || this.isProcessing) return;
    this.imageViewer.startCropMode((rect) => {
      if (rect) {
        this.saveToHistory();
        const cropped = this.imageProcessor.crop(this.currentImage, rect);
        this.setCurrentImage(cropped);
        this.imageViewer.displayProcessed(this.currentImage);
      }
    });
  }
  
  async skewLeft() {
    if (!this.currentImage || this.isProcessing) return;
    
    this.startProcessing();
    this.saveToHistory();
    
    try {
      this.currentSkewAngle = this.normalizeSkewAngle(this.currentSkewAngle - 1);
      const skewed = this.imageProcessor.skew(this.originalImage, this.currentSkewAngle);
      if (!skewed || !(skewed instanceof this.imageProcessor.cv.Mat) || skewed.rows <= 0 || skewed.cols <= 0) {
        console.warn('倾斜结果无效，保持上一次结果');
        if (skewed) this.deleteMat(skewed);
      } else {
        this.setCurrentImage(skewed);
        try {
          this.imageViewer.displayProcessed(this.currentImage);
        } catch (displayError) {
          console.warn('displayProcessed异常，恢复原图', displayError);
          this.setCurrentImage(this.originalImage.clone());
          this.imageViewer.displayProcessed(this.currentImage);
        }
      }
      this.updateSkewAngleDisplay();
    } catch (error) {
      console.error('倾斜失败:', error);
      this.currentSkewAngle = this.normalizeSkewAngle(this.currentSkewAngle);
      this.updateSkewAngleDisplay();
    }
    
    this.endProcessing();
  }
  
  async skewRight() {
    if (!this.currentImage || this.isProcessing) return;
    
    this.startProcessing();
    this.saveToHistory();
    
    try {
      this.currentSkewAngle = this.normalizeSkewAngle(this.currentSkewAngle + 1);
      const skewed = this.imageProcessor.skew(this.originalImage, this.currentSkewAngle);
      if (!skewed || !(skewed instanceof this.imageProcessor.cv.Mat) || skewed.rows <= 0 || skewed.cols <= 0) {
        console.warn('倾斜结果无效，保持上一次结果');
        if (skewed) this.deleteMat(skewed);
      } else {
        this.setCurrentImage(skewed);
        try {
          this.imageViewer.displayProcessed(this.currentImage);
        } catch (displayError) {
          console.warn('displayProcessed异常，恢复原图', displayError);
          this.setCurrentImage(this.originalImage.clone());
          this.imageViewer.displayProcessed(this.currentImage);
        }
      }
      this.updateSkewAngleDisplay();
    } catch (error) {
      console.error('倾斜失败:', error);
      this.currentSkewAngle = this.normalizeSkewAngle(this.currentSkewAngle);
      this.updateSkewAngleDisplay();
    }
    
    this.endProcessing();
  }
  
  undo() {
    if (this.imageHistory.length === 0) return;
    
    const historyItem = this.imageHistory.pop();
    if (historyItem && historyItem.image) {
      this.setCurrentImage(historyItem.image);
      this.currentSkewAngle = this.normalizeSkewAngle(historyItem.skewAngle);
      this.updateSkewAngleDisplay();
      try {
        this.imageViewer.displayProcessed(this.currentImage);
      } catch (error) {
        console.warn('undo displayProcessed 异常', error);
      }
    }
  }
  
  reset() {
    if (!this.originalImage) return;
    
    this.saveToHistory();
    this.setCurrentImage(this.originalImage.clone());
    this.currentSkewAngle = 0;
    this.updateSkewAngleDisplay();
    this.imageViewer.displayProcessed(this.currentImage);
  }
  
  async autoCorrect() {
    if (!this.currentImage || this.isProcessing) return;
    
    this.startProcessing();
    this.saveToHistory();
    
    try {
      const corrected = await this.angleCorrector.correct(this.currentImage);
      this.currentImage = corrected;
      this.imageViewer.displayProcessed(corrected);
    } catch (error) {
      console.error('自动校正失败:', error);
      alert('自动校正失败');
    }
    
    this.endProcessing();
  }
  
  async autoRemoveBorder() {
    if (!this.currentImage || this.isProcessing) return;
    
    this.startProcessing();
    this.saveToHistory();
    
    try {
      let result;
      const selection = this.imageViewer.getSelection();
      
      if (selection) {
        // 有选区，只处理选区内的图像
        const sel = selection;
        // 提取选区图像
        const roi = this.currentImage.roi(new window.cv.Rect(sel.x, sel.y, sel.width, sel.height));
        // 对选区进行去黑边处理
        const processedRoi = await this.borderRemover.removeBorder(roi);
        roi.delete();
        
        // 将处理后的选区合并回原图
        result = this.currentImage.clone();
        const processedRoiColored = processedRoi.channels() === 1 ? this.grayscaleToColor(processedRoi) : processedRoi;
        processedRoiColored.copyTo(result.roi(new window.cv.Rect(sel.x, sel.y, sel.width, sel.height)));
        if (processedRoi.channels() === 1) {
          processedRoiColored.delete();
        }
        processedRoi.delete();
        
        // 清除选区
        this.clearSelection();
      } else {
        // 无选区，处理整张图像
        result = await this.borderRemover.removeBorder(this.currentImage);
      }
      
      this.currentImage = result;
      this.imageViewer.displayProcessed(result);
    } catch (error) {
      console.error('自动去黑边失败:', error);
      alert('自动去黑边失败');
    }
    
    this.endProcessing();
  }
  
  async autoClean() {
    if (!this.currentImage || this.isProcessing) return;
    
    this.startProcessing();
    this.saveToHistory();
    
    try {
      let cleaned;
      const selection = this.imageViewer.getSelection();
      
      if (selection) {
        // 有选区，只处理选区内的图像
        const sel = selection;
        // 提取选区图像
        const roi = this.currentImage.roi(new window.cv.Rect(sel.x, sel.y, sel.width, sel.height));
        // 对选区进行去污处理
        const processedRoi = await this.documentCleaner.clean(roi);
        roi.delete();
        
        // 将处理后的选区合并回原图
        cleaned = this.currentImage.clone();
        const processedRoiColored = processedRoi.channels() === 1 ? this.grayscaleToColor(processedRoi) : processedRoi;
        processedRoiColored.copyTo(cleaned.roi(new window.cv.Rect(sel.x, sel.y, sel.width, sel.height)));
        if (processedRoi.channels() === 1) {
          processedRoiColored.delete();
        }
        processedRoi.delete();
        
        // 清除选区
        this.clearSelection();
      } else {
        // 无选区，处理整张图像
        cleaned = await this.documentCleaner.clean(this.currentImage);
      }
      
      this.currentImage = cleaned;
      this.imageViewer.displayProcessed(cleaned);
    } catch (error) {
      console.error('自动去污失败:', error);
      alert('自动去污失败');
    }
    
    this.endProcessing();
  }
  
  /**
   * 将灰度图转换为彩色图
   * @param {cv.Mat} gray - 灰度图
   * @returns {cv.Mat} 彩色图
   */
  grayscaleToColor(gray) {
    const color = new window.cv.Mat();
    window.cv.cvtColor(gray, color, window.cv.COLOR_GRAY2RGB);
    return color;
  }
  
  startProcessing() {
    this.isProcessing = true;
    document.getElementById('progressBar').style.display = 'block';
  }
  
  endProcessing() {
    this.isProcessing = false;
    document.getElementById('progressBar').style.display = 'none';
  }
  
  updateProgress(percent) {
    const fill = document.querySelector('.progress-fill');
    if (fill) {
      fill.style.width = `${percent}%`;
    }
  }
  
  /**
   * 更新倾斜角度显示
   */
  updateSkewAngleDisplay() {
    const displayElement = document.getElementById('skewAngleDisplay');
    if (displayElement) {
      displayElement.textContent = `倾斜角度: ${this.currentSkewAngle}°`;
    }
  }
  
  /**
   * 框选按钮点击处理
   * 切换框选模式状态
   */
  onSelectRegion() {
    if (!this.currentImage || this.isProcessing) return;
    
    // 如果已经有选区，先清除选区再进入新的框选模式
    if (this.selectionState === 'SELECTED') {
      this.clearSelection();
    }
    
    if (this.selectionState === 'INACTIVE') {
      // 进入框选模式
      this.selectionState = 'SELECTING';
      this.preSelectionImage = this.currentImage.clone();
      
      // 启动裁剪模式（复用）
      this.imageViewer.startCropMode((rect) => {
        if (rect && rect.width > 10 && rect.height > 10) {
          this.currentSelection = rect;
          this.selectionState = 'SELECTED';
          // 选区已经由 imageViewer 绘制，不需要再绘制
        } else if (this.selectionState === 'SELECTING') {
          // 选区太小，且仍在框选模式中，回到INACTIVE状态
          this.clearSelection();
        }
        // 如果状态已经不是SELECTING（已被取消），则不做处理
      });
    }
    // SELECTING状态下不做处理，等待用户完成框选
  }
  
  /**
   * 处理Canvas点击事件
   * @param {string} clickType - 点击类型: 'inside' | 'outside' | 'empty'
   * @param {Object} coords - 坐标 {x, y}
   */
  handleCanvasClick(clickType, coords) {
    if (this.selectionState === 'SELECTED' && clickType === 'outside') {
      // 点击在选区外，取消选区
      this.cancelSelection();
    }
  }
  
  /**
   * 取消框选（当点击其他按钮时调用）
   */
  cancelSelection() {
    if (this.selectionState !== 'INACTIVE') {
      // 结束裁剪模式
      this.imageViewer.endCropMode();
      // 清除选区
      this.clearSelection();
      // 清除工具栏按钮的激活状态
      if (this.toolbarController) {
        this.toolbarController.clearPersistentActiveButton();
      }
    }
  }
  
  /**
   * 清除选区状态（但保留当前图像，不恢复原图）
   */
  clearSelection() {
    if (this.preSelectionImage) {
      this.deleteMat(this.preSelectionImage);
      this.preSelectionImage = null;
    }
    
    this.currentSelection = null;
    this.selectionState = 'INACTIVE';
    
    // 清除imageViewer中的选区显示
    if (this.imageViewer) {
      this.imageViewer.clearSelection();
    }
  }
}

// 应用入口
document.addEventListener('DOMContentLoaded', () => {
  window.app = new MainController();
});
