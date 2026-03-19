/**
 * 图像处理器基类
 * 提供基础的图像操作功能
 */
export class ImageProcessor {
  constructor() {
    this.cv = window.cv;
  }

  /**
   * 旋转图像
   * @param {cv.Mat} src - 源图像
   * @param {number} angle - 旋转角度（正值为顺时针，负值为逆时针）
   * @returns {cv.Mat} 旋转后的图像
   */
  rotate(src, angle) {
    const dst = new this.cv.Mat();
    const dsize = new this.cv.Size(src.cols, src.rows);
    const center = new this.cv.Point(src.cols / 2, src.rows / 2);

    // 获取旋转矩阵
    const M = this.cv.getRotationMatrix2D(center, angle, 1);

    // 计算旋转后的图像边界
    const cos = Math.abs(M.data64F[0]);
    const sin = Math.abs(M.data64F[1]);
    const newWidth = Math.round(src.rows * sin + src.cols * cos);
    const newHeight = Math.round(src.rows * cos + src.cols * sin);

    // 调整旋转矩阵以适应新边界
    M.data64F[2] += (newWidth - src.cols) / 2;
    M.data64F[5] += (newHeight - src.rows) / 2;

    // 执行仿射变换
    const newSize = new this.cv.Size(newWidth, newHeight);
    this.cv.warpAffine(src, dst, M, newSize, this.cv.INTER_LINEAR, this.cv.BORDER_CONSTANT, new this.cv.Scalar());

    M.delete();
    return dst;
  }

  /**
   * 裁剪图像
   * @param {cv.Mat} src - 源图像
   * @param {Object} rect - 裁剪区域 {x, y, width, height}
   * @returns {cv.Mat} 裁剪后的图像
   */
  crop(src, rect) {
    const { x, y, width, height } = rect;

    // 确保裁剪区域在图像范围内
    const safeX = Math.max(0, Math.round(x));
    const safeY = Math.max(0, Math.round(y));
    const safeWidth = Math.min(Math.round(width), src.cols - safeX);
    const safeHeight = Math.min(Math.round(height), src.rows - safeY);

    if (safeWidth <= 0 || safeHeight <= 0) {
      console.warn('裁剪区域无效，返回原图');
      return src.clone();
    }

    const roi = src.roi(new this.cv.Rect(safeX, safeY, safeWidth, safeHeight));
    const dst = roi.clone();
    roi.delete();
    return dst;
  }

  /**
   * 倾斜变换
   * @param {cv.Mat} src - 源图像
   * @param {number} angle - 倾斜角度（度）
   * @returns {cv.Mat} 倾斜后的图像
   */
  skew(src, angle) {
    if (!src || !(src instanceof this.cv.Mat) || src.rows <= 0 || src.cols <= 0) {
      console.warn('skew: 输入图像无效，返回原图');
      return src ? src.clone() : new this.cv.Mat();
    }

    let dst = null;
    let M = null;
    try {
      const normalized = ((angle % 360) + 360) % 360;
      let safeAngle = normalized;
      if (safeAngle > 180) safeAngle -= 360;
      const maxSkewAngle = 45;
      safeAngle = Math.max(-maxSkewAngle, Math.min(maxSkewAngle, safeAngle));

      const radians = safeAngle * Math.PI / 180;
      const tan = Math.tan(radians);
      if (!Number.isFinite(tan) || Math.abs(tan) > 1.2) {
        console.warn(`skew: 不安全 tan 值 angle=${angle}° safeAngle=${safeAngle}° tan=${tan}`);
        return src.clone();
      }

      M = this.cv.matFromArray(2, 3, this.cv.CV_64FC1, [1, tan, 0, 0, 1, 0]);

      const corners = [
        { x: 0, y: 0 },
        { x: src.cols, y: 0 },
        { x: src.cols, y: src.rows },
        { x: 0, y: src.rows }
      ];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const corner of corners) {
        const x = M.data64F[0] * corner.x + M.data64F[1] * corner.y + M.data64F[2];
        const y = M.data64F[3] * corner.x + M.data64F[4] * corner.y + M.data64F[5];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      const newWidth = Math.round(maxX - minX);
      const newHeight = Math.round(maxY - minY);
      if (!Number.isFinite(newWidth) || !Number.isFinite(newHeight) || newWidth <= 0 || newHeight <= 0 || newWidth > 10000 || newHeight > 10000) {
        console.warn(`skew: 新尺寸无效 width=${newWidth} height=${newHeight}，返回原图`);
        return src.clone();
      }

      M.data64F[2] -= minX;
      M.data64F[5] -= minY;
      const newSize = new this.cv.Size(newWidth, newHeight);
      dst = new this.cv.Mat();
      this.cv.warpAffine(src, dst, M, newSize, this.cv.INTER_LINEAR, this.cv.BORDER_CONSTANT, new this.cv.Scalar());
      return dst;
    } catch (error) {
      console.warn('skew: 计算/warpAffine异常，返回原图', error);
      if (dst) dst.delete();
      return src ? src.clone() : new this.cv.Mat();
    } finally {
      if (M) M.delete();
    }
  }

  /**
   * 缩放图像
   * @param {cv.Mat} src - 源图像
   * @param {number} scale - 缩放比例
   * @returns {cv.Mat} 缩放后的图像
   */
  resize(src, scale) {
    const dst = new this.cv.Mat();
    const dsize = new this.cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale));
    this.cv.resize(src, dst, dsize, 0, 0, this.cv.INTER_LINEAR);
    return dst;
  }

  /**
   * 翻转图像
   * @param {cv.Mat} src - 源图像
   * @param {number} flipCode - 翻转代码（0: 垂直，1: 水平，-1: 双向）
   * @returns {cv.Mat} 翻转后的图像
   */
  flip(src, flipCode = 1) {
    const dst = new this.cv.Mat();
    this.cv.flip(src, dst, flipCode);
    return dst;
  }

  /**
   * 转换为灰度图
   * @param {cv.Mat} src - 源图像
   * @returns {cv.Mat} 灰度图像
   */
  toGray(src) {
    const dst = new this.cv.Mat();
    if (src.channels() === 4) {
      const temp = new this.cv.Mat();
      this.cv.cvtColor(src, temp, this.cv.COLOR_RGBA2RGB);
      this.cv.cvtColor(temp, dst, this.cv.COLOR_RGB2GRAY);
      temp.delete();
    } else if (src.channels() === 3) {
      this.cv.cvtColor(src, dst, this.cv.COLOR_RGB2GRAY);
    } else {
      return src.clone();
    }
    return dst;
  }

  /**
   * 二值化
   * @param {cv.Mat} src - 源图像（灰度）
   * @param {number} threshold - 阈值
   * @param {boolean} adaptive - 是否使用自适应阈值
   * @returns {cv.Mat} 二值化图像
   */
  threshold(src, threshold = 127, adaptive = false) {
    const dst = new this.cv.Mat();
    if (adaptive) {
      this.cv.adaptiveThreshold(
        src, dst, 255,
        this.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        this.cv.THRESH_BINARY,
        11, 2
      );
    } else {
      this.cv.threshold(src, dst, threshold, 255, this.cv.THRESH_BINARY);
    }
    return dst;
  }

  /**
   * 高斯模糊
   * @param {cv.Mat} src - 源图像
   * @param {number} kernelSize - 核大小
   * @returns {cv.Mat} 模糊后的图像
   */
  gaussianBlur(src, kernelSize = 5) {
    const dst = new this.cv.Mat();
    const ksize = new this.cv.Size(kernelSize, kernelSize);
    this.cv.GaussianBlur(src, dst, ksize, 0);
    return dst;
  }

  /**
   * 中值滤波
   * @param {cv.Mat} src - 源图像
   * @param {number} kernelSize - 核大小
   * @returns {cv.Mat} 滤波后的图像
   */
  medianBlur(src, kernelSize = 5) {
    const dst = new this.cv.Mat();
    this.cv.medianBlur(src, dst, kernelSize);
    return dst;
  }

  /**
   * 边缘检测（Canny）
   * @param {cv.Mat} src - 源图像
   * @param {number} threshold1 - 低阈值
   * @param {number} threshold2 - 高阈值
   * @returns {cv.Mat} 边缘图像
   */
  canny(src, threshold1 = 50, threshold2 = 150) {
    const dst = new this.cv.Mat();
    this.cv.Canny(src, dst, threshold1, threshold2);
    return dst;
  }

  /**
   * 膨胀操作
   * @param {cv.Mat} src - 源图像
   * @param {number} kernelSize - 核大小
   * @returns {cv.Mat} 膨胀后的图像
   */
  dilate(src, kernelSize = 3) {
    const dst = new this.cv.Mat();
    const kernel = this.cv.getStructuringElement(
      this.cv.MORPH_RECT,
      new this.cv.Size(kernelSize, kernelSize)
    );
    this.cv.dilate(src, dst, kernel);
    kernel.delete();
    return dst;
  }

  /**
   * 腐蚀操作
   * @param {cv.Mat} src - 源图像
   * @param {number} kernelSize - 核大小
   * @returns {cv.Mat} 腐蚀后的图像
   */
  erode(src, kernelSize = 3) {
    const dst = new this.cv.Mat();
    const kernel = this.cv.getStructuringElement(
      this.cv.MORPH_RECT,
      new this.cv.Size(kernelSize, kernelSize)
    );
    this.cv.erode(src, dst, kernel);
    kernel.delete();
    return dst;
  }

  /**
   * 形态学开运算
   * @param {cv.Mat} src - 源图像
   * @param {number} kernelSize - 核大小
   * @returns {cv.Mat} 处理后的图像
   */
  morphOpen(src, kernelSize = 3) {
    const dst = new this.cv.Mat();
    const kernel = this.cv.getStructuringElement(
      this.cv.MORPH_RECT,
      new this.cv.Size(kernelSize, kernelSize)
    );
    this.cv.morphologyEx(src, dst, this.cv.MORPH_OPEN, kernel);
    kernel.delete();
    return dst;
  }

  /**
   * 形态学闭运算
   * @param {cv.Mat} src - 源图像
   * @param {number} kernelSize - 核大小
   * @returns {cv.Mat} 处理后的图像
   */
  morphClose(src, kernelSize = 3) {
    const dst = new this.cv.Mat();
    const kernel = this.cv.getStructuringElement(
      this.cv.MORPH_RECT,
      new this.cv.Size(kernelSize, kernelSize)
    );
    this.cv.morphologyEx(src, dst, this.cv.MORPH_CLOSE, kernel);
    kernel.delete();
    return dst;
  }

  /**
   * 查找轮廓
   * @param {cv.Mat} src - 源图像（二值图）
   * @returns {Object} 轮廓和层次结构
   */
  findContours(src) {
    const contours = new this.cv.MatVector();
    const hierarchy = new this.cv.Mat();
    this.cv.findContours(src, contours, hierarchy, this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE);
    return { contours, hierarchy };
  }

  /**
   * 绘制轮廓
   * @param {cv.Mat} src - 源图像
   * @param {cv.MatVector} contours - 轮廓
   * @param {number} color - 颜色
   * @returns {cv.Mat} 绘制后的图像
   */
  drawContours(src, contours, color = [255, 0, 0, 255]) {
    const dst = src.clone();
    const scalar = new this.cv.Scalar(...color);
    this.cv.drawContours(dst, contours, -1, scalar, 2);
    return dst;
  }

  /**
   * 计算图像面积
   * @param {cv.Mat} src - 源图像
   * @returns {number} 图像面积
   */
  getArea(src) {
    return src.cols * src.rows;
  }

  /**
   * 从 Canvas 创建 Mat
   * @param {HTMLCanvasElement} canvas - Canvas 元素
   * @returns {cv.Mat} OpenCV Mat 对象
   */
  fromCanvas(canvas) {
    return this.cv.imread(canvas);
  }

  /**
   * 将 Mat 绘制到 Canvas
   * @param {cv.Mat} mat - OpenCV Mat 对象
   * @param {HTMLCanvasElement} canvas - Canvas 元素
   */
  toCanvas(mat, canvas) {
    this.cv.imshow(canvas, mat);
  }

  /**
   * 从 ImageData 创建 Mat
   * @param {ImageData} imageData - ImageData 对象
   * @returns {cv.Mat} OpenCV Mat 对象
   */
  fromImageData(imageData) {
    const mat = new this.cv.Mat(imageData.height, imageData.width, this.cv.CV_8UC4);
    mat.data.set(imageData.data);
    return mat;
  }

  /**
   * 将 Mat 转换为 ImageData
   * @param {cv.Mat} mat - OpenCV Mat 对象
   * @returns {ImageData} ImageData 对象
   */
  toImageData(mat) {
    const canvas = document.createElement('canvas');
    canvas.width = mat.cols;
    canvas.height = mat.rows;
    this.cv.imshow(canvas, mat);
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
}