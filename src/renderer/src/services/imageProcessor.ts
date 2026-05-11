/**
 * 图像处理器基类
 * 提供基础的图像操作功能（TypeScript 版本）
 */
import type { CvMat, CvMatVector, CvInstance } from '../types/opencv'
import { safeDelete, isValidMat } from '../utils/matLifecycle'

export class ImageProcessor {
  protected get cv(): CvInstance {
    const cv = window.cv
    if (!cv || !cv.Mat) {
      throw new Error('OpenCV.js 尚未加载')
    }
    return cv
  }

  /**
   * 旋转图像
   */
  rotate(src: CvMat, angle: number): CvMat {
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
    return dst as CvMat
  }

  /**
   * 裁剪图像
   */
  crop(src: CvMat, rect: { x: number; y: number; width: number; height: number }): CvMat {
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
  skew(src: CvMat, angle: number): CvMat {
    if (!src || src.rows <= 0 || src.cols <= 0) {
      return src ? src.clone() : new this.cv.Mat()
    }
    let dst: CvMat | null = null
    let M: CvMat | null = null
    try {
      const normalized = ((angle % 360) + 360) % 360
      let safeAngle = normalized > 180 ? normalized - 360 : normalized
      safeAngle = Math.max(-45, Math.min(45, safeAngle))
      const radians = safeAngle * Math.PI / 180
      const tan = Math.tan(radians)
      if (!Number.isFinite(tan) || Math.abs(tan) > 1.2) {
        return src.clone()
      }
      M = this.cv.matFromArray(2, 3, this.cv.CV_64FC1, [1, tan, 0, 0, 1, 0]) as CvMat
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
      return dst as CvMat
    } catch (error) {
      if (dst) safeDelete(dst)
      return src ? src.clone() : new this.cv.Mat() as CvMat
    } finally {
      if (M) safeDelete(M)
    }
  }

  /**
   * 缩放图像
   */
  resize(src: CvMat, scale: number): CvMat {
    const dst = new this.cv.Mat()
    const dsize = new this.cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale))
    this.cv.resize(src, dst, dsize, 0, 0, this.cv.INTER_LINEAR)
    return dst as CvMat
  }

  /**
   * 翻转图像
   */
  flip(src: CvMat, flipCode: number = 1): CvMat {
    const dst = new this.cv.Mat()
    this.cv.flip(src, dst, flipCode)
    return dst as CvMat
  }

  /**
   * 转换为灰度图
   */
  toGray(src: CvMat): CvMat {
    const dst = new this.cv.Mat()
    if (src.channels() === 4) {
      const temp = new this.cv.Mat()
      this.cv.cvtColor(src, temp, this.cv.COLOR_RGBA2RGB)
      this.cv.cvtColor(temp, dst, this.cv.COLOR_RGB2GRAY)
      safeDelete(temp)
    } else if (src.channels() === 3) {
      this.cv.cvtColor(src, dst, this.cv.COLOR_RGB2GRAY)
    } else {
      return src.clone()
    }
    return dst as CvMat
  }

  /**
   * 二值化
   */
  binarize(src: CvMat, threshold: number = 127, adaptive: boolean = false): CvMat {
    const dst = new this.cv.Mat()
    if (adaptive) {
      this.cv.adaptiveThreshold(src, dst, 255, this.cv.ADAPTIVE_THRESH_GAUSSIAN_C, this.cv.THRESH_BINARY, 11, 2)
    } else {
      this.cv.threshold(src, dst, threshold, 255, this.cv.THRESH_BINARY)
    }
    return dst as CvMat
  }

  /**
   * 高斯模糊
   */
  gaussianBlur(src: CvMat, kernelSize: number = 5): CvMat {
    const dst = new this.cv.Mat()
    const ksize = new this.cv.Size(kernelSize, kernelSize)
    this.cv.GaussianBlur(src, dst, ksize, 0)
    return dst as CvMat
  }

  /**
   * 中值滤波
   */
  medianBlur(src: CvMat, kernelSize: number = 5): CvMat {
    const dst = new this.cv.Mat()
    this.cv.medianBlur(src, dst, kernelSize)
    return dst as CvMat
  }

  /**
   * 边缘检测（Canny）
   */
  canny(src: CvMat, threshold1: number = 50, threshold2: number = 150): CvMat {
    const dst = new this.cv.Mat()
    this.cv.Canny(src, dst, threshold1, threshold2)
    return dst as CvMat
  }

  /**
   * 膨胀操作
   */
  dilate(src: CvMat, kernelSize: number = 3): CvMat {
    const dst = new this.cv.Mat()
    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(kernelSize, kernelSize))
    this.cv.dilate(src, dst, kernel)
    safeDelete(kernel)
    return dst as CvMat
  }

  /**
   * 腐蚀操作
   */
  erode(src: CvMat, kernelSize: number = 3): CvMat {
    const dst = new this.cv.Mat()
    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(kernelSize, kernelSize))
    this.cv.erode(src, dst, kernel)
    safeDelete(kernel)
    return dst as CvMat
  }

  /**
   * 形态学开运算
   */
  morphOpen(src: CvMat, kernelSize: number = 3): CvMat {
    const dst = new this.cv.Mat()
    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(kernelSize, kernelSize))
    this.cv.morphologyEx(src, dst, this.cv.MORPH_OPEN, kernel)
    safeDelete(kernel)
    return dst as CvMat
  }

  /**
   * 形态学闭运算
   */
  morphClose(src: CvMat, kernelSize: number = 3): CvMat {
    const dst = new this.cv.Mat()
    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(kernelSize, kernelSize))
    this.cv.morphologyEx(src, dst, this.cv.MORPH_CLOSE, kernel)
    safeDelete(kernel)
    return dst as CvMat
  }

  /**
   * 查找轮廓
   */
  findContours(src: CvMat): { contours: CvMatVector; hierarchy: CvMat } {
    const contours = new this.cv.MatVector()
    const hierarchy = new this.cv.Mat()
    this.cv.findContours(src, contours, hierarchy, this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE)
    return { contours: contours as CvMatVector, hierarchy: hierarchy as CvMat }
  }

  /**
   * 绘制轮廓
   */
  drawContours(src: CvMat, contours: CvMatVector, color: number[] = [255, 0, 0, 255]): CvMat {
    const dst = src.clone()
    const scalar = new this.cv.Scalar(...color)
    this.cv.drawContours(dst, contours, -1, scalar, 2)
    return dst
  }

  /**
   * 计算图像面积
   */
  getArea(src: CvMat): number {
    return src.cols * src.rows
  }

  /**
   * 从 Canvas 创建 Mat
   */
  fromCanvas(canvas: HTMLCanvasElement): CvMat | null {
    try {
      return this.cv.imread(canvas) as CvMat
    } catch (err) {
      console.error('[ImageProcessor] fromCanvas failed:', err)
      return null
    }
  }

  /**
   * 将 Mat 绘制到 Canvas
   */
  toCanvas(mat: CvMat, canvas: HTMLCanvasElement): boolean {
    if (!isValidMat(mat)) return false
    try {
      this.cv.imshow(canvas, mat)
      return true
    } catch (err) {
      console.error('[ImageProcessor] toCanvas failed:', err)
      return false
    }
  }

  /**
   * 从 ImageData 创建 Mat
   */
  fromImageData(imageData: ImageData): CvMat {
    const mat = new this.cv.Mat(imageData.height, imageData.width, this.cv.CV_8UC4)
    mat.data.set(imageData.data)
    return mat as CvMat
  }

  /**
   * 将 Mat 转换为 ImageData
   */
  toImageData(mat: CvMat): ImageData | null {
    if (!isValidMat(mat)) return null
    const canvas = document.createElement('canvas')
    canvas.width = mat.cols
    canvas.height = mat.rows
    if (!this.toCanvas(mat, canvas)) return null
    const ctx = canvas.getContext('2d')!
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }

  /**
   * 安全删除 Mat（向后兼容，推荐使用 matLifecycle.safeDelete）
   */
  deleteMat(mat: CvMat | null | undefined): void {
    safeDelete(mat)
  }
}
