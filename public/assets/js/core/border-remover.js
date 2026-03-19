/**
 * 黑边消除器
 * 将 Python 的 border_remover.py 转换为 JavaScript
 * 使用轮廓检测和触边检测算法消除文档边缘的黑边
 */
import { ImageProcessor } from './image-processor.js';

export class BorderRemover extends ImageProcessor {
  constructor() {
    super();
    // 默认参数，与 Python 版本保持一致
    this.edgeTolerance = 3; // 边缘容差（像素）
    this.minBorderArea = 30; // 最小黑边面积阈值
    this.maxBorderAreaRatio = 0.30; // 最大黑边面积比例
    this.cornerDetection = true; // 是否启用角落检测
    this.preserveTimingMarks = true; // 是否保留定位块
    this.timingMarkPosition = "right"; // 定位块位置
  }

  /**
   * 设置参数
   * @param {Object} options - 参数选项
   */
  setOptions(options) {
    if (options.edgeTolerance !== undefined) this.edgeTolerance = options.edgeTolerance;
    if (options.minBorderArea !== undefined) this.minBorderArea = options.minBorderArea;
    if (options.maxBorderAreaRatio !== undefined) this.maxBorderAreaRatio = options.maxBorderAreaRatio;
    if (options.cornerDetection !== undefined) this.cornerDetection = options.cornerDetection;
    if (options.preserveTimingMarks !== undefined) this.preserveTimingMarks = options.preserveTimingMarks;
    if (options.timingMarkPosition !== undefined) this.timingMarkPosition = options.timingMarkPosition;
  }

  /**
   * 自动移除黑边
   * @param {cv.Mat} src - 源图像
   * @returns {cv.Mat} 移除黑边后的图像
   */
  async removeBorder(src) {
    // 复制图像用于处理
    const resultImg = src.clone();

    // 获取图像尺寸
    const h = src.rows;
    const w = src.cols;
    const imageArea = h * w;

    // ========== 步骤 1: 预处理 ==========
    const gray = this.toGray(src);
    const blurred = this.gaussianBlur(gray, 3); // 高斯模糊去噪
    gray.delete();

    // ========== 步骤 2: 二值化 ==========
    // 使用 Otsu 自动阈值，反向二值化（黑色变白色，便于找轮廓）
    const binary = new this.cv.Mat();
    this.cv.threshold(blurred, binary, 0, 255, this.cv.THRESH_BINARY_INV + this.cv.THRESH_OTSU);
    blurred.delete();

    // ========== 步骤 3: 形态学优化 ==========
    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(3, 3));
    const processedBinary = new this.cv.Mat();
    this.cv.morphologyEx(binary, processedBinary, this.cv.MORPH_CLOSE, kernel);
    kernel.delete();

    // ========== 步骤 3.5: 角落检测增强（在删除 binary 之前执行） ==========
    let cornerMask = null;
    if (this.cornerDetection) {
      cornerMask = this._detectCornerBorders(binary, h, w);
    }
    // 现在可以安全删除 binary
    binary.delete();

    // ========== 步骤 4: 轮廓提取 ==========
    const { contours, hierarchy } = this.findContours(processedBinary);
    processedBinary.delete();

    // ========== 步骤 5: 黑边判定与消除 ==========
    const borderMask = new this.cv.Mat.zeros(h, w, this.cv.CV_8UC1);
    let bordersRemoved = 0;
    const maxBorderArea = imageArea * this.maxBorderAreaRatio;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);

      // 获取轮廓的边界框和面积
      const rect = this.cv.boundingRect(cnt);
      const area = this.cv.contourArea(cnt);

      // ---- 判定条件 1: 面积过滤 ----
      // 面积过小：认为是微小噪点，跳过
      if (area < this.minBorderArea) {
        continue;
      }
      // 面积过大：认为是文档主体（可能有照片），跳过
      if (area > maxBorderArea) {
        continue;
      }

      // ---- 判定条件 2: 触边检测 ----
      // 检查轮廓是否接触图像边缘
      const x = rect.x;
      const y = rect.y;
      const cw = rect.width;
      const ch = rect.height;
      const touchesLeft = x <= this.edgeTolerance;
      const touchesTop = y <= this.edgeTolerance;
      const touchesRight = (x + cw) >= (w - this.edgeTolerance);
      const touchesBottom = (y + ch) >= (h - this.edgeTolerance);
      const touchesEdge = touchesLeft || touchesTop || touchesRight || touchesBottom;

      if (!touchesEdge) {
        continue;
      }

      // ---- 判定条件 3: 定位块保护 ----
      // 如果需要保留定位块，检查是否符合定位块特征
      if (this.preserveTimingMarks) {
        if (this._isTimingMark(x, y, cw, ch, w, h)) {
          continue; // 跳过定位块，保留它
        }
      }

      // ---- 判定条件 4: 内容保护 ----
      // 如果触边区域太稀疏，可能是文字
      // 实心度检查：黑边通常是实心的，而文字通常是稀疏的
      const edgeAreaRatio = cw * ch > 0 ? area / (cw * ch) : 0;
      if (edgeAreaRatio < 0.3) {
        // 太稀疏，可能是文字
        continue;
      }

      // 判定为黑边，添加到消除掩膜
      const color = new this.cv.Scalar(255);
      const singleContour = new this.cv.MatVector();
      singleContour.push_back(cnt);
      this.cv.drawContours(borderMask, singleContour, -1, color, this.cv.FILLED);
      singleContour.delete();
      bordersRemoved += 1;
    }

    // ========== 步骤 5.5: 合并角落检测掩膜 ==========
    if (cornerMask) {
      this.cv.bitwise_or(borderMask, cornerMask, borderMask);
      cornerMask.delete();
    }

    // ========== 步骤 6: 掩膜填充消除黑边 ==========
    // 稍微膨胀掩膜，确保边缘干净
    const dilationKernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(3, 3));
    this.cv.dilate(borderMask, borderMask, dilationKernel);
    dilationKernel.delete();

    // 将掩膜区域的像素设置为白色（背景色）
    // 直接使用 setTo 方法，与 Python 版本的 result_img[border_mask == 255] = [255, 255, 255] 等效
    const white = src.channels() === 4 ? new this.cv.Scalar(255, 255, 255, 255) : new this.cv.Scalar(255, 255, 255);
    resultImg.setTo(white, borderMask);

    // 清理资源
    contours.delete();
    hierarchy.delete();
    borderMask.delete();

    console.log(`黑边消除完成，共消除 ${bordersRemoved} 个黑边区域`);
    return resultImg;
  }

  /**
   * 判断是否为定位块（OMR 表格的同步标记）
   * @param {number} x - 轮廓边界框的 x 坐标
   * @param {number} y - 轮廓边界框的 y 坐标
   * @param {number} cw - 轮廓边界框的宽度
   * @param {number} ch - 轮廓边界框的高度
   * @param {number} imgW - 图像宽度
   * @param {number} imgH - 图像高度
   * @returns {boolean} 是否为定位块
   */
  _isTimingMark(x, y, cw, ch, imgW, imgH) {
    const aspectRatio = ch > 0 ? cw / ch : 0;

    // 检查是否位于指定边缘
    const isRightEdge = (x + cw) >= (imgW - this.edgeTolerance * 2);
    const isLeftEdge = x <= this.edgeTolerance * 2;

    let isAtPosition = false;
    if (this.timingMarkPosition === "right") {
      isAtPosition = isRightEdge;
    } else if (this.timingMarkPosition === "left") {
      isAtPosition = isLeftEdge;
    } else {
      // "both"
      isAtPosition = isRightEdge || isLeftEdge;
    }

    // 定位块判定条件：
    // 1. 位于指定边缘
    // 2. 高度占比超过图像高度的一半（说明是纵向延伸的）
    // 3. 宽度要足够窄（真正的定位块通常很窄，宽度占比 < 3%）
    // 4. 整体宽度要很小（绝对宽度 < 25 像素，通常定位块就几个像素宽）
    const widthRatio = cw / imgW;
    const isVerticalStrip = (ch > imgH * 0.5) && (aspectRatio < 0.5);
    const isNarrow = (widthRatio < 0.03) && (cw < 25); // 宽度占比<3% 且 绝对宽度<25 像素

    return isAtPosition && isVerticalStrip && isNarrow;
  }

  /**
   * 检测角落区域的黑色标记
   * 参考 Python 版本的实现，直接使用已二值化的图像
   * @param {cv.Mat} binary - 二值化图像（已 Otsu 处理，255=黑色前景）
   * @param {number} h - 图像高度
   * @param {number} w - 图像宽度
   * @returns {cv.Mat} 角落黑边掩膜
   */
  _detectCornerBorders(binary, h, w) {
    // 创建角落掩膜
    const cornerMask = new this.cv.Mat.zeros(h, w, this.cv.CV_8UC1);

    // 定义角落区域大小（图像尺寸的 10%，至少 30 像素）
    const cornerH = Math.max(30, Math.floor(h * 0.10));
    const cornerW = Math.max(30, Math.floor(w * 0.10));

    // 四个角落区域 (x, y, w, h, name)
    const corners = [
      {x: 0, y: 0, w: cornerW, h: cornerH, name: "左上"},
      {x: w - cornerW, y: 0, w: cornerW, h: cornerH, name: "右上"},
      {x: 0, y: h - cornerH, w: cornerW, h: cornerH, name: "左下"},
      {x: w - cornerW, y: h - cornerH, w: cornerW, h: cornerH, name: "右下"}
    ];

    // 黑色像素阈值（角落中黑色像素超过 1% 认为是角落黑边）
    const threshold = 0.005;

    for (const corner of corners) {
      // 提取角落区域
      const roi = binary.roi(new this.cv.Rect(corner.x, corner.y, corner.w, corner.h));

      // 计算黑色像素 (255) 的比例
      const nonZeroPixels = this.cv.countNonZero(roi);
      const totalPixels = roi.rows * roi.cols;
      const blackRatio = totalPixels > 0 ? nonZeroPixels / totalPixels : 0;

      // 如果超过阈值，标记为角落黑边
      if (blackRatio > threshold) {
        // 查找轮廓
        const { contours, hierarchy } = this.findContours(roi);

        for (let i = 0; i < contours.size(); i++) {
          const cnt = contours.get(i);
          const cntArea = this.cv.contourArea(cnt);

          // 过滤太小的连通域
          if (cntArea > 10) {
            // 直接在主掩膜的对应区域绘制轮廓（需要添加偏移）
            const color = new this.cv.Scalar(255);

            // 创建带偏移的轮廓
            const shiftedCnt = new this.cv.Mat(cnt.rows, cnt.cols, cnt.type());
            for (let j = 0; j < cnt.rows; j++) {
              shiftedCnt.data32S[j * 2] = cnt.data32S[j * 2] + corner.x;
              shiftedCnt.data32S[j * 2 + 1] = cnt.data32S[j * 2 + 1] + corner.y;
            }

            const singleContour = new this.cv.MatVector();
            singleContour.push_back(shiftedCnt);
            this.cv.drawContours(cornerMask, singleContour, -1, color, this.cv.FILLED);
            singleContour.delete();
            shiftedCnt.delete();
          }
        }
        contours.delete();
        hierarchy.delete();
      }
      roi.delete();
    }

    // 形态学操作
    const morphKernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(3, 3));
    this.cv.morphologyEx(cornerMask, cornerMask, this.cv.MORPH_CLOSE, morphKernel);
    morphKernel.delete();

    return cornerMask;
  }

  /**
   * 检测黑边区域（保留原有方法用于兼容性）
   * @param {cv.Mat} src - 源图像
   * @returns {Object|null} 黑边边界 {top, right, bottom, left}
   */
  detectBorder(src) {
    // 转换为灰度图
    const gray = this.toGray(src);

    // 二值化
    const binary = this.threshold(gray, this.borderThreshold || 30);
    gray.delete();

    // 反转（黑边变为白色）
    const inverted = new this.cv.Mat();
    this.cv.bitwise_not(binary, inverted);
    binary.delete();

    // 检测四边黑边
    const border = {
      top: this.detectTopBorder(inverted),
      right: this.detectRightBorder(inverted),
      bottom: this.detectBottomBorder(inverted),
      left: this.detectLeftBorder(inverted)
    };
    inverted.delete();

    // 如果没有检测到明显的黑边，返回 null
    if (border.top === 0 && border.right === 0 && border.bottom === 0 && border.left === 0) {
      return null;
    }
    return border;
  }

  /**
   * 检测顶部黑边
   * @param {cv.Mat} inverted - 反转后的二值图
   * @returns {number} 黑边高度
   */
  detectTopBorder(inverted) {
    const width = inverted.cols;
    const height = inverted.rows;
    const checkHeight = Math.min(Math.floor(height * 0.3), 200); // 最多检查 30% 或 200 像素

    for (let y = 0; y < checkHeight; y++) {
      let blackCount = 0;
      for (let x = 0; x < width; x++) {
        if (inverted.ucharAt(y, x) > 128) {
          blackCount++;
        }
      }
      // 如果这一行黑点占比超过 90%，认为是黑边
      if (blackCount / width > 0.9) {
        continue;
      }
      return y;
    }
    return 0;
  }

  /**
   * 检测底部黑边
   * @param {cv.Mat} inverted - 反转后的二值图
   * @returns {number} 黑边高度
   */
  detectBottomBorder(inverted) {
    const width = inverted.cols;
    const height = inverted.rows;
    const checkHeight = Math.min(Math.floor(height * 0.3), 200);

    for (let y = height - 1; y >= height - checkHeight; y--) {
      let blackCount = 0;
      for (let x = 0; x < width; x++) {
        if (inverted.ucharAt(y, x) > 128) {
          blackCount++;
        }
      }
      if (blackCount / width > 0.9) {
        continue;
      }
      return height - 1 - y;
    }
    return 0;
  }

  /**
   * 检测左侧黑边
   * @param {cv.Mat} inverted - 反转后的二值图
   * @returns {number} 黑边宽度
   */
  detectLeftBorder(inverted) {
    const width = inverted.cols;
    const height = inverted.rows;
    const checkWidth = Math.min(Math.floor(width * 0.3), 200);

    for (let x = 0; x < checkWidth; x++) {
      let blackCount = 0;
      for (let y = 0; y < height; y++) {
        if (inverted.ucharAt(y, x) > 128) {
          blackCount++;
        }
      }
      if (blackCount / height > 0.9) {
        continue;
      }
      return x;
    }
    return 0;
  }

  /**
   * 检测右侧黑边
   * @param {cv.Mat} inverted - 反转后的二值图
   * @returns {number} 黑边宽度
   */
  detectRightBorder(inverted) {
    const width = inverted.cols;
    const height = inverted.rows;
    const checkWidth = Math.min(Math.floor(width * 0.3), 200);

    for (let x = width - 1; x >= width - checkWidth; x--) {
      let blackCount = 0;
      for (let y = 0; y < height; y++) {
        if (inverted.ucharAt(y, x) > 128) {
          blackCount++;
        }
      }
      if (blackCount / width > 0.9) {
        continue;
      }
      return width - 1 - x;
    }
    return 0;
  }

  /**
   * 裁剪黑边
   * @param {cv.Mat} src - 源图像
   * @param {Object} border - 黑边边界
   * @returns {cv.Mat} 裁剪后的图像
   */
  cropBorder(src, border) {
    const { top, right, bottom, left } = border;
    const x = left;
    const y = top;
    const width = src.cols - left - right;
    const height = src.rows - top - bottom;

    if (width <= 0 || height <= 0) {
      console.warn('裁剪区域无效，返回原图');
      return src.clone();
    }
    return this.crop(src, { x, y, width, height });
  }
}