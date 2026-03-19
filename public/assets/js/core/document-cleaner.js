/**
 * 文档污渍清理器
 * 将Python的document_cleaner.py转换为JavaScript
 * 使用多特征评分系统识别并去除污渍
 */

import { ImageProcessor } from './image-processor.js';

export class DocumentCleaner extends ImageProcessor {
  constructor() {
    super();
    // 参数调整，与Python版本保持一致
    this.minArea = 5;           // 最小文字面积（Python: min_text_area = 5）
    this.maxArea = 5000;        // 最大文字面积（Python: max_text_area = 5000）
    this.stainThreshold = 0.75; // 污渍得分阈值（Python: stain_threshold = 0.75）
    this.inpaintRadius = 3;     // 修复半径（Python: inpaint_radius = 3）

    // 特征权重 - 调整后更注重区分污渍和文字
    this.weights = {
      solidity: 0.25,      // 实心度权重 - 降低，因为文字也有高实心度
      circularity: 0.35,   // 圆形度权重 - 提高，污渍通常更接近圆形
      compactness: 0.15,   // 紧凑度权重 - 降低
      sizePenalty: 0.25    // 尺寸惩罚权重 - 提高，因为尺寸是区分污渍的重要特征
    };

    // 新增参数
    this.edgeMargin = 30;       // 边缘检测阈值 - 减小以检测更多边缘污渍
    this.minAspectRatio = 0.1;  // 最小宽高比 - 文字通常细长
  }
  
  /**
   * 清理文档污渍
   * @param {cv.Mat} src - 源图像
   * @returns {cv.Mat} 清理后的图像
   */
  async clean(src) {
    if (!src || src.rows === 0 || src.cols === 0) {
      console.error('clean: 输入图像无效');
      return src.clone();
    }
    
    console.log('开始污渍清理...');
    
    // 1. 检测污渍区域
    const stains = this.detectStains(src);
    
    if (stains.length === 0) {
      console.log('未检测到污渍');
      return src.clone();
    }
    
    console.log(`检测到 ${stains.length} 个污渍区域`);
    
    // 2. 使用inpainting去除污渍
    return this.removeStains(src, stains);
  }
  
  /**
   * 检测污渍区域
   * @param {cv.Mat} src - 源图像
   * @returns {Array} 污渍区域列表
   */
  detectStains(src) {
    let gray = null;
    let blurred = null;
    let binary = null;
    let inverted = null;
    let cleaned = null;
    let kernel = null;
    let contours = null;
    let hierarchy = null;
    
    try {
      // 转换为灰度图
      gray = this.toGray(src);
      
      // 高斯模糊降噪（使用3x3核，与Python一致）
      blurred = this.gaussianBlur(gray, 3);
      
      // 自适应阈值二值化
      binary = new this.cv.Mat();
      this.cv.adaptiveThreshold(
        blurred, binary, 255,
        this.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        this.cv.THRESH_BINARY_INV,
        11, 2
      );
      
      // 反转图像（污渍变白，背景变黑）
      inverted = new this.cv.Mat();
      this.cv.bitwise_not(binary, inverted);
      
      // 形态学操作：MORPH_OPEN 去除噪声
      kernel = this.cv.getStructuringElement(
        this.cv.MORPH_RECT,
        new this.cv.Size(2, 2)
      );
      cleaned = new this.cv.Mat();
      this.cv.morphologyEx(inverted, cleaned, this.cv.MORPH_OPEN, kernel);
      
      // 查找轮廓
      contours = new this.cv.MatVector();
      hierarchy = new this.cv.Mat();
      this.cv.findContours(cleaned, contours, hierarchy, this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE);
      
      // 分析每个轮廓，判断是否为污渍
      const stains = [];
      const contourArray = [];
      
      // 将MatVector转换为数组，方便后续处理
      for (let i = 0; i < contours.size(); i++) {
        contourArray.push(contours.get(i));
      }
      
      for (let i = 0; i < contourArray.length; i++) {
        const contour = contourArray[i];
        const area = this.cv.contourArea(contour);

        // 跳过太小的轮廓
        if (area < this.minArea) {
          continue;
        }

        // 跳过超大面积（直接认为是污渍）
        if (area > this.maxArea * 3) {
          stains.push({
            contour: contour.clone(),
            area: area,
            isLarge: true
          });
          continue;
        }

        // 计算特征
        const features = this.calculateFeatures(contour, area);

        // 评分判断是否为污渍
        const score = this.calculateStainScore(features, area);

        // 判断是否是标点符号
        const isPunct = this.isLikelyPunctuation(contour, contourArray, i);

        // 特殊处理：非常小的孤立斑点（<15）直接视为污渍
        // 但需要检查形状 - 极细长的不是污渍
        const isVerySmall = area < 15;
        const isExtremelyThin = features.aspectRatio < 0.08 || features.aspectRatio > 12;

        // 细小的污渍判断：小于15像素，但不是极细长的
        // 污渍通常是斑点状的，不是细长的
        const isSmallStain = isVerySmall && !isExtremelyThin;

        // 检查是否是边缘污渍（图像边缘的污渍更可能是装订痕或扫描污渍）
        const rect = features.boundingRect;
        const isLeftEdge = rect.x < this.edgeMargin;
        const isTopEdge = rect.y < this.edgeMargin;
        const isRightEdge = (src.cols - (rect.x + rect.width)) < this.edgeMargin;
        const isBottomEdge = (src.rows - (rect.y + rect.height)) < this.edgeMargin;

        const isEdgeStain = isLeftEdge || isTopEdge || isRightEdge || isBottomEdge;

        // 左侧边缘污渍：更宽松的检测条件（装订痕通常在左侧）
        const isLeftEdgeStain = isLeftEdge && area < 200;

        // 其他边缘的较大污渍：需要更高得分
        const isOtherEdgeStain = (isTopEdge || isRightEdge || isBottomEdge) && area < 100 && score > 0.5;

        // 边缘污渍判断
        const isEdgeLargeStain = isLeftEdgeStain || isOtherEdgeStain;

        // 分类决策
        if (isSmallStain || isEdgeLargeStain || (score > this.stainThreshold && !isPunct)) {
          stains.push({
            contour: contour.clone(),
            area: area,
            features: features,
            score: score,
            isLarge: area > 100
          });
        }
      }
      
      console.log(`文字对象: ${contourArray.length - stains.length}, 污渍: ${stains.length}`);
      
      return stains;
      
    } catch (error) {
      console.error('detectStains 错误:', error);
      return [];
    } finally {
      // 清理内存
      if (gray) gray.delete();
      if (blurred) blurred.delete();
      if (binary) binary.delete();
      if (inverted) inverted.delete();
      if (cleaned) cleaned.delete();
      if (kernel) kernel.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
    }
  }
  
  /**
   * 计算轮廓特征
   * @param {cv.Mat} contour - 轮廓
   * @param {number} area - 面积
   * @returns {Object} 特征对象
   */
  calculateFeatures(contour, area) {
    // 边界矩形
    const rect = this.cv.boundingRect(contour);
    
    // 凸包
    const hull = new this.cv.Mat();
    this.cv.convexHull(contour, hull, false, false);
    
    // 凸包面积
    const hullArea = this.cv.contourArea(hull);
    hull.delete();
    
    // 计算周长
    const perimeter = this.cv.arcLength(contour, true);
    
    // 计算圆形度
    const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
    
    const features = {
      // 实心度：轮廓面积 / 凸包面积
      solidity: hullArea > 0 ? area / hullArea : 0,
      
      // 圆形度
      circularity: Math.min(1.0, circularity),
      
      // 紧凑度：面积 / 边界矩形面积
      compactness: (rect.width * rect.height) > 0 ? area / (rect.width * rect.height) : 0,
      
      // 长宽比
      aspectRatio: rect.width > 0 ? rect.height / rect.width : 0,
      
      // 边界矩形
      boundingRect: rect,
      
      // 宽度和高度
      width: rect.width,
      height: rect.height
    };
    
    return features;
  }
  
  /**
   * 计算污渍评分
   * @param {Object} features - 特征对象
   * @param {number} area - 面积
   * @returns {number} 评分（0-1）
   */
  calculateStainScore(features, area) {
    // 计算尺寸得分
    const sizeScore = this.calculateSizeScore(area);

    // 计算宽高比因子 - 调整以更好区分文字和污渍
    const aspectRatio = features.aspectRatio;

    // 宽高比惩罚：极细长或极扁平的通常是文字
    let aspectPenalty = 1.0;
    if (aspectRatio < 0.15 || aspectRatio > 6.0) {
      // 非常细长或扁平的通常是文字，降低分数
      aspectPenalty = 0.5;
    } else if (aspectRatio < 0.3 || aspectRatio > 3.5) {
      // 中等细长/扁平，可能是文字或标点
      aspectPenalty = 0.75;
    } else {
      // 接近正方形，更可能是污渍
      aspectPenalty = 1.0;
    }

    // 紧凑度因子：文字通常填充度较低
    let compactnessBonus = 1.0;
    if (features.compactness < 0.4) {
      // 填充度很低，通常是文字
      compactnessBonus = 0.6;
    } else if (features.compactness < 0.6) {
      compactnessBonus = 0.8;
    } else {
      // 填充度高，可能是污渍
      compactnessBonus = 1.1;
    }

    // 加权求和
    let score = (
      features.solidity * this.weights.solidity +
      features.circularity * this.weights.circularity +
      features.compactness * this.weights.compactness +
      sizeScore * this.weights.sizePenalty
    );

    // 应用惩罚因子
    score = score * aspectPenalty * compactnessBonus;

    // 限制在0-1范围内
    return Math.min(1.0, Math.max(0, score));
  }
  
  /**
   * 计算尺寸得分
   * @param {number} area - 面积
   * @returns {number} 得分
   */
  calculateSizeScore(area) {
    if (area < 15) {
      // 非常小的斑点，很可能是污渍（装订孔、扫描点）
      return 0.95;
    } else if (area < 30) {
      // 小斑点，可能是污渍
      return 0.85;
    } else if (area > this.maxArea) {
      // 超大斑块，很可能是污渍
      return 0.9;
    } else if (area > 2000) {
      // 大斑块，中等偏高
      return 0.7;
    } else {
      // 中等大小，很可能是文字
      return 0.3;
    }
  }
  
  /**
   * 检查是否是标点符号（句号、逗号等）
   * @param {cv.Mat} contour - 轮廓
   * @param {Array} allContours - 所有轮廓
   * @param {number} contourIdx - 当前轮廓索引
   * @returns {boolean} 是否可能是标点
   */
  isLikelyPunctuation(contour, allContours, contourIdx) {
    const area = this.cv.contourArea(contour);
    
    // 非常小的对象不进行上下文检查
    if (area < 15) {
      return false;
    }
    
    // 大对象不进行上下文检查
    if (area > 80) {
      return false;
    }
    
    const rect = this.cv.boundingRect(contour);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    
    // 查找附近的轮廓
    for (let i = 0; i < allContours.length; i++) {
      if (i === contourIdx) continue;
      
      const otherArea = this.cv.contourArea(allContours[i]);
      if (otherArea < this.minArea) continue;
      
      const otherRect = this.cv.boundingRect(allContours[i]);
      const ocx = otherRect.x + otherRect.width / 2;
      const ocy = otherRect.y + otherRect.height / 2;
      
      // 检查是否在下方且距离很近
      if (ocy > cy && Math.abs(cx - ocx) < otherRect.width && (otherRect.y - (rect.y + rect.height)) < 20) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 去除污渍
   * @param {cv.Mat} src - 源图像
   * @param {Array} stains - 污渍列表
   * @returns {cv.Mat} 清理后的图像
   */
  removeStains(src, stains) {
    if (stains.length === 0) {
      return src.clone();
    }
    
    let dilatedMask = null;
    let dst = null;
    let smallMask = null;
    let largeMask = null;
    let kernel = null;
    let contourVec = null;
    
    try {
      // 分离小斑点和大面积污渍
      smallMask = new this.cv.Mat.zeros(src.rows, src.cols, this.cv.CV_8UC1);
      largeMask = new this.cv.Mat.zeros(src.rows, src.cols, this.cv.CV_8UC1);
      
      for (const stain of stains) {
        // 创建 MatVector 来存放单个轮廓
        contourVec = new this.cv.MatVector();
        contourVec.push_back(stain.contour);
        const color = new this.cv.Scalar(255);
        
        if (stain.isLarge) {
          // 大面积污渍
          this.cv.drawContours(largeMask, contourVec, -1, color, -1);
        } else {
          // 小斑点
          this.cv.drawContours(smallMask, contourVec, -1, color, -1);
        }
        
        // 清理 MatVector
        contourVec.delete();
        contourVec = null;
        stain.contour.delete();
      }
      
      // 创建结果图像
      dst = src.clone();
      
      // 小斑点直接填充白色
      const hasSmallSpots = this.cv.countNonZero(smallMask) > 0;
      if (hasSmallSpots) {
        // 将掩膜区域的像素设为白色
        for (let y = 0; y < dst.rows; y++) {
          for (let x = 0; x < dst.cols; x++) {
            if (smallMask.data[y * smallMask.cols + x] > 0) {
              // 设置为白色
              const idx = y * dst.cols * dst.channels() + x * dst.channels();
              dst.data[idx] = 255;     // R
              dst.data[idx + 1] = 255; // G
              dst.data[idx + 2] = 255; // B
            }
          }
        }
      }
      
      // 大面积污渍使用inpainting
      const hasLargeStains = this.cv.countNonZero(largeMask) > 0;
      if (hasLargeStains) {
        // 先膨胀一下
        kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(3, 3));
        dilatedMask = new this.cv.Mat();
        this.cv.dilate(largeMask, dilatedMask, kernel);
        
        // 确保 src 是 3 通道图像（inpaint 要求 CV_8UC3）
        let srcForInpaint = src;
        let needConvert = false;
        
        if (src.channels() === 4) {
          // RGBA -> RGB 转换
          srcForInpaint = new this.cv.Mat();
          this.cv.cvtColor(src, srcForInpaint, this.cv.COLOR_RGBA2RGB);
          needConvert = true;
        } else if (src.channels() === 1) {
          // 灰度 -> RGB 转换
          srcForInpaint = new this.cv.Mat();
          this.cv.cvtColor(src, srcForInpaint, this.cv.COLOR_GRAY2RGB);
          needConvert = true;
        }
        
        // 使用inpainting修复
        const tempDst = new this.cv.Mat();
        try {
          this.cv.inpaint(srcForInpaint, dilatedMask, tempDst, this.inpaintRadius, this.cv.INPAINT_TELEA);
          // 将修复结果复制到dst
          tempDst.copyTo(dst);
          tempDst.delete();
        } catch (inpaintError) {
          console.error('inpaint 错误:', inpaintError);
          // 如果inpaint失败，保持原图
        } finally {
          // 清理临时转换的图像
          if (needConvert && srcForInpaint) {
            srcForInpaint.delete();
          }
        }
      }
      
      return dst;
      
    } catch (error) {
      console.error('removeStains 错误:', error);
      return src.clone();
    } finally {
      // 清理内存
      if (dilatedMask) dilatedMask.delete();
      if (smallMask) smallMask.delete();
      if (largeMask) largeMask.delete();
      if (kernel) kernel.delete();
      if (contourVec) contourVec.delete();
    }
  }
  
  /**
   * 设置参数
   * @param {Object} options - 参数选项
   */
  setOptions(options) {
    if (options.minArea !== undefined) this.minArea = options.minArea;
    if (options.maxArea !== undefined) this.maxArea = options.maxArea;
    if (options.stainThreshold !== undefined) this.stainThreshold = options.stainThreshold;
    if (options.inpaintRadius !== undefined) this.inpaintRadius = options.inpaintRadius;
  }
}
