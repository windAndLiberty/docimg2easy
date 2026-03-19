/**
 * 边缘清理器
 * 将Python的cleanEdge.py转换为JavaScript
 * 使用灰度分析和裁剪技术清理边缘
 */

import { ImageProcessor } from './image-processor.js';

export class EdgeCleaner extends ImageProcessor {
  constructor() {
    super();
    this.threshold = 30;      // 灰度阈值
    this.minEdgeWidth = 10;   // 最小边缘宽度
    this.maxEdgeWidth = 100;  // 最大边缘宽度
  }
  
  /**
   * 清理边缘
   * @param {cv.Mat} src - 源图像
   * @returns {cv.Mat} 清理后的图像
   */
  async clean(src) {
    // 检测四个边缘
    const edges = this.detectEdges(src);
    
    // 计算裁剪区域
    const cropRect = this.calculateCropRect(src, edges);
    
    if (cropRect.width <= 0 || cropRect.height <= 0) {
      console.log('未检测到需要清理的边缘');
      return src.clone();
    }
    
    console.log('清理边缘，裁剪区域:', cropRect);
    
    return this.crop(src, cropRect);
  }
  
  /**
   * 检测四个边缘
   * @param {cv.Mat} src - 源图像
   * @returns {Object} 四个边缘的检测结果
   */
  detectEdges(src) {
    const gray = this.toGray(src);
    
    // 分析每行的平均灰度值
    const rowMeans = this.analyzeRowMeans(gray);
    // 分析每列的平均灰度值
    const colMeans = this.analyzeColMeans(gray);
    
    gray.delete();
    
    // 检测顶部和底部边缘
    const top = this.detectTopEdge(rowMeans);
    const bottom = this.detectBottomEdge(rowMeans);
    
    // 检测左侧和右侧边缘
    const left = this.detectLeftEdge(colMeans);
    const right = this.detectRightEdge(colMeans);
    
    return { top, bottom, left, right };
  }
  
  /**
   * 分析每行的平均灰度值
   * @param {cv.Mat} gray - 灰度图
   * @returns {Array<number>} 每行的平均灰度值
   */
  analyzeRowMeans(gray) {
    const means = [];
    for (let y = 0; y < gray.rows; y++) {
      let sum = 0;
      for (let x = 0; x < gray.cols; x++) {
        sum += gray.ucharAt(y, x);
      }
      means.push(sum / gray.cols);
    }
    return means;
  }
  
  /**
   * 分析每列的平均灰度值
   * @param {cv.Mat} gray - 灰度图
   * @returns {Array<number>} 每列的平均灰度值
   */
  analyzeColMeans(gray) {
    const means = [];
    for (let x = 0; x < gray.cols; x++) {
      let sum = 0;
      for (let y = 0; y < gray.rows; y++) {
        sum += gray.ucharAt(y, x);
      }
      means.push(sum / gray.rows);
    }
    return means;
  }
  
  /**
   * 检测顶部边缘
   * @param {Array<number>} rowMeans - 行平均灰度值
   * @returns {number} 顶部边缘高度
   */
  detectTopEdge(rowMeans) {
    const maxCheck = Math.min(rowMeans.length * 0.3, this.maxEdgeWidth);
    
    for (let i = 0; i < maxCheck; i++) {
      // 如果灰度值变化超过阈值，认为找到了边缘
      if (i > 0 && Math.abs(rowMeans[i] - rowMeans[i - 1]) > this.threshold) {
        return i;
      }
      // 如果灰度值接近图像主体（通常是白色或较亮的背景）
      if (rowMeans[i] > this.threshold * 5) {
        return i;
      }
    }
    return 0;
  }
  
  /**
   * 检测底部边缘
   * @param {Array<number>} rowMeans - 行平均灰度值
   * @returns {number} 底部边缘高度
   */
  detectBottomEdge(rowMeans) {
    const maxCheck = Math.min(rowMeans.length * 0.3, this.maxEdgeWidth);
    
    for (let i = rowMeans.length - 1; i >= rowMeans.length - maxCheck; i--) {
      if (i < rowMeans.length - 1 && Math.abs(rowMeans[i] - rowMeans[i + 1]) > this.threshold) {
        return rowMeans.length - 1 - i;
      }
      if (rowMeans[i] > this.threshold * 5) {
        return rowMeans.length - 1 - i;
      }
    }
    return 0;
  }
  
  /**
   * 检测左侧边缘
   * @param {Array<number>} colMeans - 列平均灰度值
   * @returns {number} 左侧边缘宽度
   */
  detectLeftEdge(colMeans) {
    const maxCheck = Math.min(colMeans.length * 0.3, this.maxEdgeWidth);
    
    for (let i = 0; i < maxCheck; i++) {
      if (i > 0 && Math.abs(colMeans[i] - colMeans[i - 1]) > this.threshold) {
        return i;
      }
      if (colMeans[i] > this.threshold * 5) {
        return i;
      }
    }
    return 0;
  }
  
  /**
   * 检测右侧边缘
   * @param {Array<number>} colMeans - 列平均灰度值
   * @returns {number} 右侧边缘宽度
   */
  detectRightEdge(colMeans) {
    const maxCheck = Math.min(colMeans.length * 0.3, this.maxEdgeWidth);
    
    for (let i = colMeans.length - 1; i >= colMeans.length - maxCheck; i--) {
      if (i < colMeans.length - 1 && Math.abs(colMeans[i] - colMeans[i + 1]) > this.threshold) {
        return colMeans.length - 1 - i;
      }
      if (colMeans[i] > this.threshold * 5) {
        return colMeans.length - 1 - i;
      }
    }
    return 0;
  }
  
  /**
   * 计算裁剪矩形
   * @param {cv.Mat} src - 源图像
   * @param {Object} edges - 边缘检测结果
   * @returns {Object} 裁剪矩形
   */
  calculateCropRect(src, edges) {
    const { top, bottom, left, right } = edges;
    
    // 确保边缘宽度在合理范围内
    const safeTop = Math.min(Math.max(top, 0), this.maxEdgeWidth);
    const safeBottom = Math.min(Math.max(bottom, 0), this.maxEdgeWidth);
    const safeLeft = Math.min(Math.max(left, 0), this.maxEdgeWidth);
    const safeRight = Math.min(Math.max(right, 0), this.maxEdgeWidth);
    
    return {
      x: safeLeft,
      y: safeTop,
      width: src.cols - safeLeft - safeRight,
      height: src.rows - safeTop - safeBottom
    };
  }
  
  /**
   * 使用滑动窗口方法检测边缘（更精确的方法）
   * @param {cv.Mat} src - 源图像
   * @returns {Object} 边缘检测结果
   */
  detectEdgesBySlidingWindow(src) {
    const gray = this.toGray(src);
    const edges = { top: 0, bottom: 0, left: 0, right: 0 };
    
    const windowSize = 20;
    const step = 5;
    const varianceThreshold = 500;
    
    // 检测顶部边缘
    for (let y = 0; y < Math.min(gray.rows * 0.3, this.maxEdgeWidth); y += step) {
      const variance = this.calculateWindowVariance(gray, 0, y, gray.cols, Math.min(windowSize, gray.rows - y));
      if (variance > varianceThreshold) {
        edges.top = y;
        break;
      }
    }
    
    // 检测底部边缘
    for (let y = gray.rows - windowSize; y >= gray.rows * 0.7; y -= step) {
      const variance = this.calculateWindowVariance(gray, 0, y, gray.cols, windowSize);
      if (variance > varianceThreshold) {
        edges.bottom = gray.rows - y - windowSize;
        break;
      }
    }
    
    // 检测左侧边缘
    for (let x = 0; x < Math.min(gray.cols * 0.3, this.maxEdgeWidth); x += step) {
      const variance = this.calculateWindowVariance(gray, x, 0, Math.min(windowSize, gray.cols - x), gray.rows);
      if (variance > varianceThreshold) {
        edges.left = x;
        break;
      }
    }
    
    // 检测右侧边缘
    for (let x = gray.cols - windowSize; x >= gray.cols * 0.7; x -= step) {
      const variance = this.calculateWindowVariance(gray, x, 0, windowSize, gray.rows);
      if (variance > varianceThreshold) {
        edges.right = gray.cols - x - windowSize;
        break;
      }
    }
    
    gray.delete();
    return edges;
  }
  
  /**
   * 计算窗口区域的灰度方差
   * @param {cv.Mat} gray - 灰度图
   * @param {number} x - 起始x坐标
   * @param {number} y - 起始y坐标
   * @param {number} width - 窗口宽度
   * @param {number} height - 窗口高度
   * @returns {number} 灰度方差
   */
  calculateWindowVariance(gray, x, y, width, height) {
    let sum = 0;
    let count = 0;
    
    for (let j = y; j < y + height && j < gray.rows; j++) {
      for (let i = x; i < x + width && i < gray.cols; i++) {
        sum += gray.ucharAt(j, i);
        count++;
      }
    }
    
    const mean = sum / count;
    
    let variance = 0;
    for (let j = y; j < y + height && j < gray.rows; j++) {
      for (let i = x; i < x + width && i < gray.cols; i++) {
        variance += (gray.ucharAt(j, i) - mean) ** 2;
      }
    }
    
    return variance / count;
  }
  
  /**
   * 设置参数
   * @param {Object} options - 参数选项
   */
  setOptions(options) {
    if (options.threshold !== undefined) this.threshold = options.threshold;
    if (options.minEdgeWidth !== undefined) this.minEdgeWidth = options.minEdgeWidth;
    if (options.maxEdgeWidth !== undefined) this.maxEdgeWidth = options.maxEdgeWidth;
  }
}