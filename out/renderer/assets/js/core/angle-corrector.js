/**
 * 角度校正器
 * 将Python的angle_correct.py转换为JavaScript
 * 使用霍夫变换检测直线并计算平均角度进行旋转校正
 */

import { ImageProcessor } from './image-processor.js';

export class AngleCorrector extends ImageProcessor {
  constructor() {
    super();
    this.minLineLength = 100;
    this.maxLineGap = 10;
    this.threshold = 100;
    this.angleThreshold = 5; // 最大校正角度阈值
  }
  
  /**
   * 自动校正图像角度
   * @param {cv.Mat} src - 源图像
   * @returns {cv.Mat} 校正后的图像
   */
  async correct(src) {
    // 计算需要校正的角度
    const angle = this.calculateAngle(src);
    
    if (Math.abs(angle) < 0.1) {
      console.log('图像角度正常，无需校正');
      return src.clone();
    }
    
    console.log(`检测到角度偏移: ${angle.toFixed(2)}°`);
    
    // 校正角度过大时警告
    if (Math.abs(angle) > this.angleThreshold) {
      console.warn(`校正角度 ${angle.toFixed(2)}° 超过阈值 ${this.angleThreshold}°，可能检测结果不准确`);
    }
    
    // 执行旋转校正
    return this.rotate(src, angle);
  }
  
  /**
   * 计算图像的倾斜角度
   * @param {cv.Mat} src - 源图像
   * @returns {number} 倾斜角度
   */
  calculateAngle(src) {
    // 1. 转换为灰度图
    const gray = this.toGray(src);
    
    // 2. 高斯模糊降噪
    const blurred = this.gaussianBlur(gray, 5);
    gray.delete();
    
    // 3. Canny边缘检测
    const edges = this.canny(blurred, 50, 150);
    blurred.delete();
    
    // 4. 霍夫变换检测直线
    const lines = new this.cv.Mat();
    this.cv.HoughLinesP(
      edges,
      lines,
      1,                          // rho: 距离分辨率（像素）
      Math.PI / 180,              // theta: 角度分辨率（弧度）
      this.threshold,             // threshold: 累加器阈值
      this.minLineLength,         // minLineLength: 最小线段长度
      this.maxLineGap             // maxLineGap: 最大间隙
    );
    edges.delete();
    
    if (lines.rows === 0) {
      console.log('未检测到直线');
      lines.delete();
      return 0;
    }
    
    // 5. 计算所有直线的角度
    const angles = [];
    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4];
      const y1 = lines.data32S[i * 4 + 1];
      const x2 = lines.data32S[i * 4 + 2];
      const y2 = lines.data32S[i * 4 + 3];
      
      // 计算线段长度
      const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      
      // 只考虑足够长的线段
      if (length >= this.minLineLength) {
        // 计算角度（弧度转角度）
        let angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        
        // 将角度归一化到 [-45, 45] 范围
        // 因为文档中的直线通常是水平或垂直的
        if (angle > 45) {
          angle = angle - 90;
        } else if (angle < -45) {
          angle = angle + 90;
        }
        
        // 只考虑接近水平或垂直的线
        if (Math.abs(angle) <= this.angleThreshold) {
          angles.push(angle);
        }
      }
    }
    
    lines.delete();
    
    if (angles.length === 0) {
      console.log('未找到有效的直线角度');
      return 0;
    }
    
    // 6. 使用中位数计算最终角度（比平均值更鲁棒）
    angles.sort((a, b) => a - b);
    const medianAngle = angles[Math.floor(angles.length / 2)];
    
    console.log(`检测到 ${angles.length} 条直线，中位数角度: ${medianAngle.toFixed(2)}°`);
    
    return medianAngle;
  }
  
  /**
   * 使用RANSAC算法计算角度（更鲁棒的方法）
   * @param {cv.Mat} src - 源图像
   * @returns {number} 倾斜角度
   */
  calculateAngleRANSAC(src) {
    // 1. 转换为灰度图
    const gray = this.toGray(src);
    
    // 2. 边缘检测
    const edges = this.canny(gray, 50, 150);
    gray.delete();
    
    // 3. 获取边缘点
    const points = [];
    for (let y = 0; y < edges.rows; y++) {
      for (let x = 0; x < edges.cols; x++) {
        if (edges.ucharAt(y, x) > 0) {
          points.push({ x, y });
        }
      }
    }
    edges.delete();
    
    if (points.length < 100) {
      return 0;
    }
    
    // 4. RANSAC迭代
    let bestAngle = 0;
    let bestInliers = 0;
    const iterations = 100;
    const threshold = 2; // 角度阈值
    
    for (let i = 0; i < iterations; i++) {
      // 随机选择两个点
      const idx1 = Math.floor(Math.random() * points.length);
      let idx2 = Math.floor(Math.random() * points.length);
      while (idx2 === idx1) {
        idx2 = Math.floor(Math.random() * points.length);
      }
      
      const p1 = points[idx1];
      const p2 = points[idx2];
      
      // 计算角度
      let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
      
      // 归一化角度
      if (angle > 45) angle -= 90;
      else if (angle < -45) angle += 90;
      
      // 只考虑小角度
      if (Math.abs(angle) > this.angleThreshold) continue;
      
      // 计算内点数量
      let inliers = 0;
      for (const p of points) {
        const lineAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        const pointAngle = Math.atan2(p.y - p1.y, p.x - p1.x) * 180 / Math.PI;
        if (Math.abs(lineAngle - pointAngle) < threshold) {
          inliers++;
        }
      }
      
      if (inliers > bestInliers) {
        bestInliers = inliers;
        bestAngle = angle;
      }
    }
    
    console.log(`RANSAC找到最佳角度: ${bestAngle.toFixed(2)}°，内点数: ${bestInliers}`);
    
    return bestAngle;
  }
  
  /**
   * 设置参数
   * @param {Object} options - 参数选项
   */
  setOptions(options) {
    if (options.minLineLength !== undefined) this.minLineLength = options.minLineLength;
    if (options.maxLineGap !== undefined) this.maxLineGap = options.maxLineGap;
    if (options.threshold !== undefined) this.threshold = options.threshold;
    if (options.angleThreshold !== undefined) this.angleThreshold = options.angleThreshold;
  }
}