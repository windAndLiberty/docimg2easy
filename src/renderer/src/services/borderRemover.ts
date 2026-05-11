/**
 * 黑边消除器
 * 使用轮廓检测和触边检测算法消除文档边缘的黑边
 */
import type { CvMat } from '../types/opencv'
import { safeDelete } from '../utils/matLifecycle'
import { ImageProcessor } from './imageProcessor'

export class BorderRemover extends ImageProcessor {
  edgeTolerance = 3
  minBorderArea = 30
  maxBorderAreaRatio = 0.30
  cornerDetection = true
  preserveTimingMarks = true
  timingMarkPosition = 'right'

  remove(src: CvMat): CvMat {
    return this.removeBorder(src)
  }

  private removeBorder(src: CvMat): CvMat {
    const resultImg = src.clone()
    const h = src.rows
    const w = src.cols
    const imageArea = h * w

    // 预处理：灰度 + 二值化
    const gray = this.toGray(src)
    const binary = this.binarize(gray, 0, true)
    safeDelete(gray)

    // 形态学闭运算填充小孔
    const closed = this.morphClose(binary, 3)
    safeDelete(binary)

    // 查找轮廓
    const { contours, hierarchy } = this.findContours(closed)
    safeDelete(closed)
    safeDelete(hierarchy)

    const borderMask = this.cv.zeros(h, w, this.cv.CV_8UC1)
    let bordersRemoved = 0
    const maxBorderArea = imageArea * this.maxBorderAreaRatio

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const area = this.cv.contourArea(cnt)
      const rect = this.cv.boundingRect(cnt)

      // 面积过滤
      if (area < this.minBorderArea || area > maxBorderArea) {
        safeDelete(cnt)
        continue
      }

      // 触边检测
      const touchesLeft = rect.x <= this.edgeTolerance
      const touchesTop = rect.y <= this.edgeTolerance
      const touchesRight = (rect.x + rect.width) >= (w - this.edgeTolerance)
      const touchesBottom = (rect.y + rect.height) >= (h - this.edgeTolerance)

      if (!touchesLeft && !touchesTop && !touchesRight && !touchesBottom) {
        safeDelete(cnt)
        continue
      }

      // 宽高比过滤（排除细长线条）
      const aspectRatio = rect.width / rect.height
      if (aspectRatio > 20 || aspectRatio < 0.05) {
        safeDelete(cnt)
        continue
      }

      // 绘制到掩码
      const singleContour = new this.cv.MatVector()
      singleContour.push_back(cnt)
      const white = new this.cv.Scalar(255)
      this.cv.drawContours(borderMask, singleContour, -1, white, this.cv.FILLED)
      singleContour.delete()
      safeDelete(cnt)
      bordersRemoved++
    }

    contours.delete()

    // 应用掩码去除黑边
    if (bordersRemoved > 0) {
      const cleaned = new this.cv.Mat()
      const white = new this.cv.Scalar(255, 255, 255, 255)
      this.cv.bitwise_and(resultImg, resultImg, cleaned, borderMask)
      // 反转掩码填充白色背景
      const invertedMask = new this.cv.Mat()
      this.cv.bitwise_not(borderMask, invertedMask)
      const bg = new this.cv.Mat(h, w, resultImg.type)
      bg.setTo(white)
      this.cv.bitwise_and(bg, bg, resultImg, invertedMask)
      this.cv.bitwise_or(cleaned, resultImg, resultImg)
      safeDelete(bg)
      safeDelete(cleaned)
      safeDelete(invertedMask)
    }

    safeDelete(borderMask)
    return resultImg
  }

  /**
   * 设置参数
   */
  setOptions(options: Partial<BorderRemover>): void {
    Object.assign(this, options)
  }
}