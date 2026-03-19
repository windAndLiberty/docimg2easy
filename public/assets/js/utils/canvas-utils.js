/**
 * Canvas工具函数
 * 提供Canvas操作的辅助函数
 */

export class CanvasUtils {
  /**
   * 创建指定大小的Canvas
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @returns {HTMLCanvasElement} Canvas元素
   */
  static createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  
  /**
   * 清空Canvas
   * @param {HTMLCanvasElement} canvas - Canvas元素
   */
  static clearCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  /**
   * 将图像绘制到Canvas上
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {HTMLImageElement|ImageData} image - 图像源
   * @param {Object} options - 选项
   */
  static drawImage(canvas, image, options = {}) {
    const ctx = canvas.getContext('2d');
    const { x = 0, y = 0, width, height, keepAspectRatio = true } = options;
    
    if (image instanceof ImageData) {
      ctx.putImageData(image, x, y);
    } else {
      const drawWidth = width || image.width;
      const drawHeight = height || image.height;
      
      if (keepAspectRatio) {
        const scale = Math.min(drawWidth / image.width, drawHeight / image.height);
        const scaledWidth = image.width * scale;
        const scaledHeight = image.height * scale;
        const offsetX = (drawWidth - scaledWidth) / 2;
        const offsetY = (drawHeight - scaledHeight) / 2;
        
        ctx.drawImage(image, x + offsetX, y + offsetY, scaledWidth, scaledHeight);
      } else {
        ctx.drawImage(image, x, y, drawWidth, drawHeight);
      }
    }
  }
  
  /**
   * 从Canvas获取ImageData
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @returns {ImageData} 图像数据
   */
  static getImageData(canvas) {
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  
  /**
   * 调整Canvas大小
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {number} width - 新宽度
   * @param {number} height - 新高度
   * @param {boolean} preserveContent - 是否保留内容
   */
  static resizeCanvas(canvas, width, height, preserveContent = false) {
    if (preserveContent) {
      const imageData = this.getImageData(canvas);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(imageData, 0, 0);
    } else {
      canvas.width = width;
      canvas.height = height;
    }
  }
  
  /**
   * 下载Canvas内容为图片
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {string} filename - 文件名
   * @param {string} format - 格式 ('png', 'jpeg')
   * @param {number} quality - 质量 (0-1)
   */
  static downloadCanvas(canvas, filename = 'image.png', format = 'png', quality = 0.92) {
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mimeType, quality);
    
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
  
  /**
   * 将Canvas转换为Blob
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {string} format - 格式
   * @param {number} quality - 质量
   * @returns {Promise<Blob>} Blob对象
   */
  static canvasToBlob(canvas, format = 'png', quality = 0.92) {
    return new Promise((resolve) => {
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      canvas.toBlob((blob) => {
        resolve(blob);
      }, mimeType, quality);
    });
  }
  
  /**
   * 绘制网格
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {number} gridSize - 网格大小
   * @param {string} color - 网格颜色
   */
  static drawGrid(canvas, gridSize = 50, color = '#cccccc') {
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    
    // 绘制垂直线
    for (let x = 0; x <= canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    // 绘制水平线
    for (let y = 0; y <= canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }
  
  /**
   * 绘制十字准星
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} size - 大小
   * @param {string} color - 颜色
   */
  static drawCrosshair(canvas, x, y, size = 20, color = '#ff0000') {
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    // 水平线
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.stroke();
    
    // 垂直线
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  }
  
  /**
   * 绘制矩形选区
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {Object} rect - 矩形参数
   * @param {string} strokeColor - 边框颜色
   * @param {string} fillColor - 填充颜色
   */
  static drawRect(canvas, rect, strokeColor = '#007bff', fillColor = 'rgba(0, 123, 255, 0.1)') {
    const ctx = canvas.getContext('2d');
    const { x, y, width, height } = rect;
    
    // 填充
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, width, height);
    
    // 边框
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
  }
  
  /**
   * 绘制文本
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {string} text - 文本内容
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {Object} options - 选项
   */
  static drawText(canvas, text, x, y, options = {}) {
    const ctx = canvas.getContext('2d');
    const {
      font = '16px Arial',
      color = '#000000',
      align = 'left',
      baseline = 'top',
      background = null,
      padding = 5
    } = options;
    
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    
    // 绘制背景
    if (background) {
      const metrics = ctx.measureText(text);
      const bgWidth = metrics.width + padding * 2;
      const bgHeight = parseInt(font) + padding * 2;
      
      ctx.fillStyle = background;
      ctx.fillRect(x - padding, y - padding, bgWidth, bgHeight);
    }
    
    // 绘制文本
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  
  /**
   * 获取鼠标在Canvas上的位置
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {MouseEvent} event - 鼠标事件
   * @returns {Object} 位置对象 {x, y}
   */
  static getMousePos(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }
  
  /**
   * 应用滤镜
   * @param {HTMLCanvasElement} canvas - Canvas元素
   * @param {string} filter - CSS滤镜字符串
   */
  static applyFilter(canvas, filter) {
    const ctx = canvas.getContext('2d');
    ctx.filter = filter;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
  }
  
  /**
   * 水平翻转
   * @param {HTMLCanvasElement} canvas - Canvas元素
   */
  static flipHorizontal(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, -canvas.width, 0);
    ctx.restore();
  }
  
  /**
   * 垂直翻转
   * @param {HTMLCanvasElement} canvas - Canvas元素
   */
  static flipVertical(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(canvas, 0, -canvas.height);
    ctx.restore();
  }
}