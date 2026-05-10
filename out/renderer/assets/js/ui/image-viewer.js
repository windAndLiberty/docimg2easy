/**
 * 图像查看器
 * 负责图像的显示、缩放、裁剪模式等功能
 */

export class ImageViewer {
  constructor(originalImageId, processedCanvasId) {
    this.originalImageElement = document.getElementById(originalImageId);
    this.processedCanvas = document.getElementById(processedCanvasId);
    this.ctx = this.processedCanvas.getContext('2d');
    
    this.cv = window.cv;
    this.currentMat = null;
    this.scale = 1;
    
    // 裁剪模式相关
    this.isCropping = false;
    this.cropStartX = 0;
    this.cropStartY = 0;
    this.cropEndX = 0;
    this.cropEndY = 0;
    this.cropCallback = null;
    
    // 选区状态管理
    this.selectionRect = null; // 保存选区矩形 {x, y, width, height}
    this.isSelectionVisible = false; // 选区是否可见
    
    // 拖拽相关
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    
    // 点击回调（用于检测点击选区外）
    this.onCanvasClick = null;
    
    // 裁剪确认按钮相关
    this.cropConfirmButtons = null; // 确认按钮容器
    this.isCropConfirming = false; // 是否正在确认裁剪
    
    this.init();
  }
  
  init() {
    // 设置Canvas事件
    this.processedCanvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.processedCanvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.processedCanvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.processedCanvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
    
    // 触摸事件支持
    this.processedCanvas.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.processedCanvas.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.processedCanvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    
    // 键盘事件支持（ESC取消裁剪）
    this.handleKeyDown = this.onKeyDown.bind(this);
    document.addEventListener('keydown', this.handleKeyDown);
  }
  
  /**
   * 键盘按下事件
   * @param {KeyboardEvent} e - 键盘事件
   */
  onKeyDown(e) {
    // ESC键取消裁剪
    if (e.key === 'Escape' && this.isCropConfirming) {
      this.cancelCrop();
      e.preventDefault();
    }
  }
  
  /**
   * 显示原始图像
   * @param {cv.Mat} mat - OpenCV Mat对象
   */
  displayOriginal(mat) {
    // 创建临时Canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = mat.cols;
    tempCanvas.height = mat.rows;
    
    this.cv.imshow(tempCanvas, mat);
    
    // 设置图像源
    this.originalImageElement.src = tempCanvas.toDataURL();
    this.originalImageElement.style.maxWidth = '100%';
    this.originalImageElement.style.maxHeight = '100%';
  }
  
  /**
   * 显示处理后的图像
   * @param {cv.Mat} mat - OpenCV Mat对象
   */
  displayProcessed(mat) {
    if (!mat || !(mat instanceof this.cv.Mat) || mat.cols <= 0 || mat.rows <= 0) {
      console.warn('displayProcessed: 无效 mat');
      return;
    }
    const MAX_DRAW_DIM = 10000;
    if (mat.cols > MAX_DRAW_DIM || mat.rows > MAX_DRAW_DIM) {
      console.warn('displayProcessed: mat 尺寸过大，跳过显示', mat.cols, mat.rows);
      return;
    }

    try {
      // 调整Canvas大小
      this.processedCanvas.width = mat.cols;
      this.processedCanvas.height = mat.rows;
      
      // 显示图像
      this.cv.imshow(this.processedCanvas, mat);
      
      // 保存当前Mat的引用
      if (this.currentMat) {
        this.currentMat.delete();
      }
      this.currentMat = mat.clone();
      
      // 更新显示比例
      this.updateScale();
      
      // 如果有选区，重新绘制选区高亮
      if (this.isSelectionVisible && this.selectionRect) {
        this.drawSelectionHighlight();
      }
    } catch (error) {
      console.warn('displayProcessed: cv.imshow 失败', error);
    }
  }
  
  /**
   * 更新显示比例
   */
  updateScale() {
    const container = this.processedCanvas.parentElement;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const scaleX = containerWidth / this.processedCanvas.width;
    const scaleY = containerHeight / this.processedCanvas.height;
    
    this.scale = Math.min(scaleX, scaleY, 1);
  }
  
  /**
   * 开始裁剪模式
   * @param {Function} callback - 裁剪完成回调函数
   */
  startCropMode(callback) {
    this.isCropping = true;
    this.cropCallback = callback;
    this.processedCanvas.style.cursor = 'crosshair';
    
    // 重置裁剪区域
    this.cropStartX = 0;
    this.cropStartY = 0;
    this.cropEndX = 0;
    this.cropEndY = 0;
    
    // 清除之前的选区
    this.clearSelection();
  }
  
  /**
   * 结束裁剪模式
   */
  endCropMode() {
    this.isCropping = false;
    this.processedCanvas.style.cursor = 'default';
    this.cropCallback = null;
  }
  
  /**
   * 获取显示比例（Canvas显示尺寸与实际尺寸的比值）
   * @returns {Object} {scaleX, scaleY}
   */
  getDisplayScale() {
    const rect = this.processedCanvas.getBoundingClientRect();
    return {
      scaleX: rect.width / this.processedCanvas.width,
      scaleY: rect.height / this.processedCanvas.height
    };
  }
  
  /**
   * 将显示坐标转换为Canvas内部坐标
   * @param {number} displayX - 显示X坐标
   * @param {number} displayY - 显示Y坐标
   * @returns {Object} {x, y}
   */
  displayToCanvasCoords(displayX, displayY) {
    const rect = this.processedCanvas.getBoundingClientRect();
    const scaleX = this.processedCanvas.width / rect.width;
    const scaleY = this.processedCanvas.height / rect.height;
    return {
      x: displayX * scaleX,
      y: displayY * scaleY
    };
  }
  
  /**
   * 将Canvas内部坐标转换为显示坐标
   * @param {number} canvasX - Canvas内部X坐标
   * @param {number} canvasY - Canvas内部Y坐标
   * @returns {Object} {x, y}
   */
  canvasToDisplayCoords(canvasX, canvasY) {
    const rect = this.processedCanvas.getBoundingClientRect();
    const scaleX = rect.width / this.processedCanvas.width;
    const scaleY = rect.height / this.processedCanvas.height;
    return {
      x: canvasX * scaleX + rect.left,
      y: canvasY * scaleY + rect.top
    };
  }
  
  /**
   * 检测点是否在选区内
   * @param {number} canvasX - Canvas内部X坐标
   * @param {number} canvasY - Canvas内部Y坐标
   * @returns {boolean}
   */
  isPointInSelection(canvasX, canvasY) {
    if (!this.selectionRect || !this.isSelectionVisible) {
      return false;
    }
    const { x, y, width, height } = this.selectionRect;
    return canvasX >= x && canvasX <= x + width && 
           canvasY >= y && canvasY <= y + height;
  }
  
  /**
   * 鼠标按下事件
   * @param {MouseEvent} e - 鼠标事件
   */
  onMouseDown(e) {
    const rect = this.processedCanvas.getBoundingClientRect();
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    const canvasCoords = this.displayToCanvasCoords(displayX, displayY);
    
    if (this.isCropping) {
      this.isDragging = true;
      this.cropStartX = canvasCoords.x;
      this.cropStartY = canvasCoords.y;
      this.cropEndX = this.cropStartX;
      this.cropEndY = this.cropStartY;
    } else if (this.isSelectionVisible && this.selectionRect) {
      // 检查是否点击在选区外
      if (!this.isPointInSelection(canvasCoords.x, canvasCoords.y)) {
        // 点击在选区外，触发取消选区回调
        if (this.onCanvasClick) {
          this.onCanvasClick('outside', canvasCoords);
        }
      } else {
        // 点击在选区内，可以触发选区内点击回调
        if (this.onCanvasClick) {
          this.onCanvasClick('inside', canvasCoords);
        }
      }
    } else if (this.onCanvasClick) {
      // 没有选区时，触发点击回调
      this.onCanvasClick('empty', canvasCoords);
    }
  }
  
  /**
   * 鼠标移动事件
   * @param {MouseEvent} e - 鼠标事件
   */
  onMouseMove(e) {
    if (this.isCropping && this.isDragging) {
      const rect = this.processedCanvas.getBoundingClientRect();
      const displayX = e.clientX - rect.left;
      const displayY = e.clientY - rect.top;
      const canvasCoords = this.displayToCanvasCoords(displayX, displayY);
      this.cropEndX = canvasCoords.x;
      this.cropEndY = canvasCoords.y;
      
      // 绘制裁剪框
      this.drawCropBox();
    }
  }
  
  /**
   * 鼠标释放事件
   * @param {MouseEvent} e - 鼠标事件
   */
  onMouseUp(e) {
    if (this.isCropping) {
      if (this.isDragging) {
        this.isDragging = false;
        
        // 计算裁剪区域
        const cropRect = this.calculateCropRect();
        
        // 检查选区是否有效
        if (cropRect.width > 10 && cropRect.height > 10) {
          // 保存选区
          this.selectionRect = cropRect;
          this.isSelectionVisible = true;
          
          // 绘制选区高亮（保留框选框）
          this.drawSelectionHighlight();
          
          // 显示确认按钮，而不是立即执行裁剪
          this.showCropConfirmButtons();
          
          // 进入确认状态，不结束裁剪模式
          this.isCropConfirming = true;
        } else {
          // 选区太小或无效
          this.endCropMode();
        }
      }
    }
  }
  
  /**
   * 鼠标离开事件
   * @param {MouseEvent} e - 鼠标事件
   */
  onMouseLeave(e) {
    if (this.isDragging) {
      this.onMouseUp(e);
    }
  }
  
  /**
   * 触摸开始事件
   * @param {TouchEvent} e - 触摸事件
   */
  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
  }
  
  /**
   * 触摸移动事件
   * @param {TouchEvent} e - 触摸事件
   */
  onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
  }
  
  /**
   * 触摸结束事件
   * @param {TouchEvent} e - 触摸事件
   */
  onTouchEnd(e) {
    e.preventDefault();
    this.onMouseUp(e);
  }
  
  /**
   * 绘制裁剪框
   */
  drawCropBox() {
    if (!this.currentMat) return;
    
    try {
      // 先重绘原图
      this.cv.imshow(this.processedCanvas, this.currentMat);
      
      // 计算裁剪区域（确保在有效范围内）
      let x = Math.min(this.cropStartX, this.cropEndX);
      let y = Math.min(this.cropStartY, this.cropEndY);
      let width = Math.abs(this.cropEndX - this.cropStartX);
      let height = Math.abs(this.cropEndY - this.cropStartY);
      
      // 边界检查
      x = Math.max(0, Math.min(x, this.processedCanvas.width - 1));
      y = Math.max(0, Math.min(y, this.processedCanvas.height - 1));
      width = Math.min(width, this.processedCanvas.width - x);
      height = Math.min(height, this.processedCanvas.height - y);
      
      // 如果区域太小，不绘制
      if (width < 1 || height < 1) return;
      
      // 绘制半透明遮罩
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(0, 0, this.processedCanvas.width, this.processedCanvas.height);
      
      // 清除裁剪区域的遮罩
      this.ctx.clearRect(x, y, width, height);
      
      // 重绘裁剪区域的图像
      if (this.currentMat && width > 0 && height > 0) {
        try {
          const roiRect = new this.cv.Rect(Math.floor(x), Math.floor(y), Math.floor(width), Math.floor(height));
          // 再次检查 ROI 是否有效
          if (roiRect.x >= 0 && roiRect.y >= 0 && 
              roiRect.width > 0 && roiRect.height > 0 &&
              roiRect.x + roiRect.width <= this.currentMat.cols &&
              roiRect.y + roiRect.height <= this.currentMat.rows) {
            const roi = this.currentMat.roi(roiRect);
            const roiCanvas = this.matToCanvas(roi);
            if (roiCanvas) {
              this.ctx.drawImage(roiCanvas, x, y, width, height);
            }
            roi.delete();
          }
        } catch (roiError) {
          console.warn('ROI 绘制失败:', roiError);
        }
      }
      
      // 绘制裁剪框边框
      this.ctx.strokeStyle = '#007bff';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x, y, width, height);
      
      // 绘制对角线辅助线
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + width, y + height);
      this.ctx.moveTo(x + width, y);
      this.ctx.lineTo(x, y + height);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    } catch (error) {
      console.warn('绘制裁剪框失败:', error);
    }
  }
  
  /**
   * 绘制选区高亮
   */
  drawSelectionHighlight() {
    if (!this.selectionRect || !this.currentMat) return;
    
    const { x, y, width, height } = this.selectionRect;
    
    // 绘制半透明遮罩
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fillRect(0, 0, this.processedCanvas.width, this.processedCanvas.height);
    
    // 清除选区区域的遮罩
    this.ctx.clearRect(x, y, width, height);
    
    // 重绘选区区域的图像
    try {
      const roiRect = new this.cv.Rect(Math.floor(x), Math.floor(y), Math.floor(width), Math.floor(height));
      if (roiRect.x >= 0 && roiRect.y >= 0 && 
          roiRect.width > 0 && roiRect.height > 0 &&
          roiRect.x + roiRect.width <= this.currentMat.cols &&
          roiRect.y + roiRect.height <= this.currentMat.rows) {
        const roi = this.currentMat.roi(roiRect);
        const roiCanvas = this.matToCanvas(roi);
        if (roiCanvas) {
          this.ctx.drawImage(roiCanvas, x, y, width, height);
        }
        roi.delete();
      }
    } catch (error) {
      console.warn('绘制选区图像失败:', error);
    }
    
    // 绘制选区边框
    this.ctx.strokeStyle = '#007bff';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([5, 5]);
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.setLineDash([]);
    
    // 绘制四个角的控制点
    const handleSize = 8;
    this.ctx.fillStyle = '#007bff';
    
    // 左上角
    this.ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
    // 右上角
    this.ctx.fillRect(x + width - handleSize/2, y - handleSize/2, handleSize, handleSize);
    // 左下角
    this.ctx.fillRect(x - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
    // 右下角
    this.ctx.fillRect(x + width - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
  }
  
  /**
   * 显示裁剪确认按钮
   * 在选区右下角显示取消和确认按钮
   */
  showCropConfirmButtons() {
    // 如果已存在按钮，先移除
    this.hideCropConfirmButtons();
    
    if (!this.selectionRect) return;
    
    // 创建按钮容器
    const container = document.createElement('div');
    container.className = 'crop-confirm-buttons';
    
    // 创建取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'crop-btn crop-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelCrop();
    });
    
    // 创建确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'crop-btn crop-btn-confirm';
    confirmBtn.textContent = '确认';
    confirmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmCrop();
    });
    
    container.appendChild(cancelBtn);
    container.appendChild(confirmBtn);
    
    // 计算按钮位置（相对于Canvas容器）
    // 使用鼠标松开的位置（cropEndX, cropEndY）作为按钮显示位置
    const endX = this.cropEndX;
    const endY = this.cropEndY;
    
    // 将Canvas内部坐标转换为显示坐标（鼠标松开位置）
    const displayCoords = this.canvasToDisplayCoords(endX, endY);
    
    // 计算相对于Canvas父容器的位置
    const containerRect = this.processedCanvas.parentElement.getBoundingClientRect();
    let relativeX = displayCoords.x - containerRect.left;
    let relativeY = displayCoords.y - containerRect.top;
    
    // 确保按钮不超出容器边界
    const buttonWidth = 150; // 估计按钮容器宽度
    const buttonHeight = 50; // 估计按钮容器高度
    
    if (relativeX + buttonWidth > containerRect.width) {
      relativeX = containerRect.width - buttonWidth - 10;
    }
    if (relativeY + buttonHeight > containerRect.height) {
      relativeY = relativeY - buttonHeight - 10;
    }
    
    // 设置按钮位置（在鼠标松开位置旁边）
    container.style.position = 'absolute';
    container.style.left = `${relativeX + 10}px`; // 向右偏移10px
    container.style.top = `${relativeY + 10}px`; // 向下偏移10px
    container.style.zIndex = '1000';
    
    // 保存引用并添加到DOM
    this.cropConfirmButtons = container;
    this.processedCanvas.parentElement.appendChild(container);
  }
  
  /**
   * 隐藏裁剪确认按钮
   */
  hideCropConfirmButtons() {
    if (this.cropConfirmButtons) {
      this.cropConfirmButtons.remove();
      this.cropConfirmButtons = null;
    }
  }
  
  /**
   * 确认裁剪
   * 用户点击确认按钮后执行裁剪
   */
  confirmCrop() {
    if (this.selectionRect && this.cropCallback) {
      const cropRect = { ...this.selectionRect };
      const callback = this.cropCallback; // 先保存回调引用
      
      // 隐藏确认按钮
      this.hideCropConfirmButtons();
      
      // 结束裁剪模式
      this.isCropConfirming = false;
      this.endCropMode();
      
      // 执行裁剪回调（使用保存的引用）
      callback(cropRect);
    }
  }
  
  /**
   * 取消裁剪
   * 用户点击取消按钮后清除选区
   */
  cancelCrop() {
    // 隐藏确认按钮
    this.hideCropConfirmButtons();
    
    // 清除选区
    this.clearSelection();
    
    // 结束裁剪模式
    this.isCropConfirming = false;
    this.endCropMode();
    
    // 调用回调传入null表示取消
    if (this.cropCallback) {
      this.cropCallback(null);
    }
  }
  
  /**
   * 清除选区显示
   */
  clearSelection() {
    this.selectionRect = null;
    this.isSelectionVisible = false;
    
    // 隐藏确认按钮
    this.hideCropConfirmButtons();
    
    // 重绘图像以清除选区高亮
    if (this.currentMat) {
      this.cv.imshow(this.processedCanvas, this.currentMat);
    }
  }
  
  /**
   * 计算裁剪区域
   * @returns {Object} 裁剪矩形
   */
  calculateCropRect() {
    const x = Math.min(this.cropStartX, this.cropEndX);
    const y = Math.min(this.cropStartY, this.cropEndY);
    const width = Math.abs(this.cropEndX - this.cropStartX);
    const height = Math.abs(this.cropEndY - this.cropStartY);
    
    return {
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.min(width, this.processedCanvas.width - x),
      height: Math.min(height, this.processedCanvas.height - y)
    };
  }
  
  /**
   * 获取当前选区
   * @returns {Object|null} 选区矩形或null
   */
  getSelection() {
    return this.selectionRect;
  }
  
  /**
   * 设置点击回调
   * @param {Function} callback - 回调函数，参数为 (clickType, coords)
   *   clickType: 'inside' | 'outside' | 'empty'
   *   coords: {x, y} Canvas内部坐标
   */
  setOnCanvasClick(callback) {
    this.onCanvasClick = callback;
  }
  
  /**
   * 将Mat转换为Canvas
   * @param {cv.Mat} mat - OpenCV Mat对象
   * @returns {HTMLCanvasElement} Canvas元素
   */
  matToCanvas(mat) {
    if (!mat || !(mat instanceof this.cv.Mat) || mat.cols <= 0 || mat.rows <= 0) {
      console.warn('matToCanvas: 无效的 Mat 对象');
      return null;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = mat.cols;
      canvas.height = mat.rows;
      this.cv.imshow(canvas, mat);
      return canvas;
    } catch (error) {
      console.warn('matToCanvas 失败:', error);
      return null;
    }
  }
  
  /**
   * 放大图像
   */
  zoomIn() {
    this.scale = Math.min(this.scale * 1.2, 3);
    this.applyScale();
  }
  
  /**
   * 缩小图像
   */
  zoomOut() {
    this.scale = Math.max(this.scale / 1.2, 0.1);
    this.applyScale();
  }
  
  /**
   * 重置缩放
   */
  resetZoom() {
    this.scale = 1;
    this.applyScale();
  }
  
  /**
   * 应用缩放
   */
  applyScale() {
    this.processedCanvas.style.transform = `scale(${this.scale})`;
    this.processedCanvas.style.transformOrigin = 'center center';
  }
  
  /**
   * 获取当前显示的图像Mat
   * @returns {cv.Mat} 当前图像Mat
   */
  getCurrentMat() {
    return this.currentMat ? this.currentMat.clone() : null;
  }
  
  /**
   * 销毁实例
   */
  destroy() {
    // 移除键盘事件监听
    if (this.handleKeyDown) {
      document.removeEventListener('keydown', this.handleKeyDown);
    }
    
    // 隐藏确认按钮
    this.hideCropConfirmButtons();
    
    // 释放Mat资源
    if (this.currentMat) {
      this.currentMat.delete();
      this.currentMat = null;
    }
  }
}
