/**
 * 图像处理器基类
 * 提供基础的图像操作功能（TypeScript 版本）
 */
export class ImageProcessor {
  protected get cv(): any {
    const cv = (window as any).cv
    if (typeof cv === 'undefined' || !cv.Mat) {
      throw new Error('OpenCV.js 尚未加载')
    }
    return cv
  }

  /**
   * 旋转图像
   */
  rotate(src: any, angle: number): any {
    const dst = new this.cv.Mat()
    const center = new this.cv.Point(src.cols / 2, src.rows / 2)
    const M = this.cv.getRotationMatrix2D(center, angle, 1)
    const cos = Math.abs(M.data64F[0])
    const sin = Math.abs(M.data64F[1])
    const newWidth = Math.round(src.rows * sin + src.cols * cos)
    const newHeight = Math.round(src.rows * cos + src.cols * sin)
    M.data64F[2] += (newWidth - src.cols) / 2
    M.data64F[5] += (newHeight - src.rows) / 2
    const newSize = new this.cv.Size(newWidth, newHeight)
    this.cv.warpAffine(src, dst, M, newSize, this.cv.INTER_LINEAR, this.cv.BORDER_CONSTANT, new this.cv.Scalar())
    M.delete()
    center.delete()
    return dst
  }

  /**
   * 裁剪图像
   */
  crop(src: any, rect: { x: number; y: number; width: number; height: number }): any {
    const safeX = Math.max(0, Math.round(rect.x))
    const safeY = Math.max(0, Math.round(rect.y))
    const safeWidth = Math.min(Math.round(rect.width), src.cols - safeX)
    const safeHeight = Math.min(Math.round(rect.height), src.rows - safeY)
    if (safeWidth <= 0 || safeHeight <= 0) {
      console.warn('裁剪区域无效，返回原图')
      return src.clone()
    }
    const roi = src.roi(new this.cv.Rect(safeX, safeY, safeWidth, safeHeight))
    const dst = roi.clone()
    roi.delete()
    return dst
  }

  /**
   * 倾斜变换
   */
  skew(src: any, angle: number): any {
    if (!src || !(src instanceof this.cv.Mat) || src.rows <= 0 || src.cols <= 0) {
      return src ? src.clone() : new this.cv.Mat()
    }
    let dst: any = null
    let M: any = null
    try {
      const normalized = ((angle % 360) + 360) % 360
      let safeAngle = normalized > 180 ? normalized - 360 : normalized
      safeAngle = Math.max(-45, Math.min(45, safeAngle))
      const radians = safeAngle * Math.PI / 180
      const tan = Math.tan(radians)
      if (!Number.isFinite(tan) || Math.abs(tan) > 1.2) {
        return src.clone()
      }
      M = this.cv.matFromArray(2, 3, this.cv.CV_64FC1, [1, tan, 0, 0, 1, 0])
      const corners = [
        { x: 0, y: 0 },
        { x: src.cols, y: 0 },
        { x: src.cols, y: src.rows },
        { x: 0, y: src.rows }
      ]
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const corner of corners) {
        const x = M.data64F[0] * corner.x + M.data64F[1] * corner.y + M.data64F[2]
        const y = M.data64F[3] * corner.x + M.data64F[4] * corner.y + M.data64F[5]
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      const newWidth = Math.round(maxX - minX)
      const newHeight = Math.round(maxY - minY)
      if (!Number.isFinite(newWidth) || !Number.isFinite(newHeight) || newWidth <= 0 || newHeight <= 0 || newWidth > 10000 || newHeight > 10000) {
        return src.clone()
      }
      M.data64F[2] -= minX
      M.data64F[5] -= minY
      const newSize = new this.cv.Size(newWidth, newHeight)
      dst = new this.cv.Mat()
      this.cv.warpAffine(src, dst, M, newSize, this.cv.INTER_LINEAR, this.cv.BORDER_CONSTANT, new this.cv.Scalar())
      return dst
    } catch (error) {
      if (dst) dst.delete()
      return src ? src.clone() : new this.cv.Mat()
    } finally {
      if (M) M.delete()
    }
  }

  /**
   * 缩放图像
   */
  resize(src: any, scale: number): any {
    const dst = new this.cv.Mat()
    const dsize = new this.cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale))
    this.cv.resize(src, dst, dsize, 0, 0, this.cv.INTER_LINEAR)
    return dst
  }

  /**
   * 翻转图像
   */
  flip(src: any, flipCode: number = 1): any {
    const dst = new this.cv.Mat()
    this.cv.flip(src, dst, flipCode)
    return dst
  }

  /**
   * 转换为灰度图
   */
  toGray(src: any): any {
    const dst = new this.cv.Mat()
    if (src.channels() === 4) {
      const temp = new this.cv.Mat()
      this.cv.cvtColor(src, temp, this.cv.COLOR_RGBA2RGB)
      this.cv.cvtColor(temp, dst, this.cv.COLOR_RGB2GRAY)
      temp.delete()
    } else if (src.channels() === 3) {
      this.cv.cvtColor(src, dst, this.cv.COLOR_RGB2GRAY)
    } else {
      return src.clone()
    }
    return dst
  }

  /**
   * 二值化
   */
  binarize(src: any, threshold: number = 127, adaptive: boolean = false): any {
    const dst = new this.cv.Mat()
    if (adaptive) {
      this.cv.adaptiveThreshold(src, dst, 255, this.cv.ADAPTIVE_THRESH_GAUSSIAN_C, this.cv.THRESH_BINARY, 11, 2)
    } else {
      this.cv.threshold(src, dst, threshold, 255, this.cv.THRESH_BINARY)
    }
    return dst
  }

  /**
   * 高斯模糊
   */
  gaussianBlur(src: any, kernelSize: number = 5): any {
    const dst = new this.cv.Mat()
    const ksize = new this.cv.Size(kernelSize, kernelSize)
    this.cv.GaussianBlur(src, dst, ksize, 0)
    return dst
  }

  /**
   * 中值滤波
   */
  medianBlur(src: any, kernelSize: number = 5): any {
    const dst = new this.cv.Mat()
    this.cv.medianBlur(src, dst, kernelSize)
    return dst
  }

  /**
   * 边缘检测（Canny）
   */
  canny(src: any, threshold1: number = 50, threshold2: number = 150): any {
    const dst = new this.cv.Mat()
    this.cv.Canny(src, dst, threshold1, threshold2)
    return dst
  }

  /**
   * 膨胀操作
   */
  dilate(src: any, kernelSize: number = 3): any {
    const dst = new this.cv.Mat()
    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(kernelSize, kernelSize))
    this.cv.dilate(src, dst, kernel)
    kernel.delete()
    return dst
  }

  /**
   * 腐蚀操作
   */
  erode(src: any, kernelSize: number = 3): any {
    const dst = new this.cv.Mat()
    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(kernelSize, kernelSize))
    this.cv.erode(src, dst, kernel)
    kernel.delete()
    return dst
  }

  /**
   * 形态学开运算
   */
  morphOpen(src: any, kernelSize: number = 3): any {
    const dst = new this.cv.Mat()
    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(kernelSize, kernelSize))
    this.cv.morphologyEx(src, dst, this.cv.MORPH_OPEN, kernel)
    kernel.delete()
    return dst
  }

  /**
   * 形态学闭运算
   */
  morphClose(src: any, kernelSize: number = 3): any {
    const dst = new this.cv.Mat()
    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(kernelSize, kernelSize))
    this.cv.morphologyEx(src, dst, this.cv.MORPH_CLOSE, kernel)
    kernel.delete()
    return dst
  }

  /**
   * 查找轮廓
   */
  findContours(src: any): { contours: any; hierarchy: any } {
    const contours = new this.cv.MatVector()
    const hierarchy = new this.cv.Mat()
    this.cv.findContours(src, contours, hierarchy, this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE)
    return { contours, hierarchy }
  }

  /**
   * 绘制轮廓
   */
  drawContours(src: any, contours: any, color: number[] = [255, 0, 0, 255]): any {
    const dst = src.clone()
    const scalar = new this.cv.Scalar(...color)
    this.cv.drawContours(dst, contours, -1, scalar, 2)
    return dst
  }

  /**
   * 计算图像面积
   */
  getArea(src: any): number {
    return src.cols * src.rows
  }

  /**
   * 从 Canvas 创建 Mat
   */
  fromCanvas(canvas: HTMLCanvasElement): any {
    return this.cv.imread(canvas)
  }

  /**
   * 将 Mat 绘制到 Canvas
   */
  toCanvas(mat: any, canvas: HTMLCanvasElement): void {
    this.cv.imshow(canvas, mat)
  }

  /**
   * 从 ImageData 创建 Mat
   */
  fromImageData(imageData: ImageData): any {
    const mat = new this.cv.Mat(imageData.height, imageData.width, this.cv.CV_8UC4)
    mat.data.set(imageData.data)
    return mat
  }

  /**
   * 将 Mat 转换为 ImageData
   */
  toImageData(mat: any): ImageData {
    const canvas = document.createElement('canvas')
    canvas.width = mat.cols
    canvas.height = mat.rows
    this.cv.imshow(canvas, mat)
    const ctx = canvas.getContext('2d')!
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }

  /**
   * 安全删除 Mat
   */
  deleteMat(mat: any): void {
    if (!mat) return
    try {
      if (typeof mat.delete === 'function') {
        mat.delete()
      }
    } catch (e) {
      console.warn('deleteMat failed', e)
    }
  }
}
