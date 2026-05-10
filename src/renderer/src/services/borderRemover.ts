/**
 * 黑边消除器
 * 使用轮廓检测和触边检测算法消除文档边缘的黑边
 */
import { ImageProcessor } from './imageProcessor'

export class BorderRemover extends ImageProcessor {
  edgeTolerance = 3
  minBorderArea = 30
  maxBorderAreaRatio = 0.30
  cornerDetection = true
  preserveTimingMarks = true
  timingMarkPosition = 'right'

  removeBorder(src: any): any {
    const resultImg = src.clone()
    const h = src.rows
    const w = src.cols
    const imageArea = h * w

    const gray = this.toGray(src)
    const blurred = this.gaussianBlur(gray, 3)
    gray.delete()

    const binary = new this.cv.Mat()
    this.cv.threshold(blurred, binary, 0, 255, this.cv.THRESH_BINARY_INV + this.cv.THRESH_OTSU)
    blurred.delete()

    const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(3, 3))
    const processedBinary = new this.cv.Mat()
    this.cv.morphologyEx(binary, processedBinary, this.cv.MORPH_CLOSE, kernel)
    kernel.delete()

    let cornerMask: any = null
    if (this.cornerDetection) {
      cornerMask = this._detectCornerBorders(binary, h, w)
    }
    binary.delete()

    const { contours, hierarchy } = this.findContours(processedBinary)
    processedBinary.delete()

    const borderMask = new this.cv.Mat.zeros(h, w, this.cv.CV_8UC1)
    let bordersRemoved = 0
    const maxBorderArea = imageArea * this.maxBorderAreaRatio

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const rect = this.cv.boundingRect(cnt)
      const area = this.cv.contourArea(cnt)

      if (area < this.minBorderArea || area > maxBorderArea) continue

      const touchesLeft = rect.x <= this.edgeTolerance
      const touchesTop = rect.y <= this.edgeTolerance
      const touchesRight = (rect.x + rect.width) >= (w - this.edgeTolerance)
      const touchesBottom = (rect.y + rect.height) >= (h - this.edgeTolerance)
      if (!touchesLeft && !touchesTop && !touchesRight && !touchesBottom) continue

      if (this.preserveTimingMarks && this._isTimingMark(rect.x, rect.y, rect.width, rect.height, w, h)) continue

      const edgeAreaRatio = rect.width * rect.height > 0 ? area / (rect.width * rect.height) : 0
      if (edgeAreaRatio < 0.3) continue

      const color = new this.cv.Scalar(255)
      const singleContour = new this.cv.MatVector()
      singleContour.push_back(cnt)
      this.cv.drawContours(borderMask, singleContour, -1, color, this.cv.FILLED)
      singleContour.delete()
      bordersRemoved++
    }

    if (cornerMask) {
      this.cv.bitwise_or(borderMask, cornerMask, borderMask)
      cornerMask.delete()
    }

    const dilationKernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(3, 3))
    this.cv.dilate(borderMask, borderMask, dilationKernel)
    dilationKernel.delete()

    const white = src.channels() === 4 ? new this.cv.Scalar(255, 255, 255, 255) : new this.cv.Scalar(255, 255, 255)
    resultImg.setTo(white, borderMask)

    contours.delete()
    hierarchy.delete()
    borderMask.delete()

    console.log(`黑边消除完成，共消除 ${bordersRemoved} 个黑边区域`)
    return resultImg
  }

  _isTimingMark(x: number, _y: number, cw: number, ch: number, imgW: number, imgH: number): boolean {
    const aspectRatio = ch > 0 ? cw / ch : 0
    const isRightEdge = (x + cw) >= (imgW - this.edgeTolerance * 2)
    const isLeftEdge = x <= this.edgeTolerance * 2
    let isAtPosition = false
    if (this.timingMarkPosition === 'right') isAtPosition = isRightEdge
    else if (this.timingMarkPosition === 'left') isAtPosition = isLeftEdge
    else isAtPosition = isRightEdge || isLeftEdge
    const widthRatio = cw / imgW
    const isVerticalStrip = ch > imgH * 0.5 && aspectRatio < 0.5
    const isNarrow = widthRatio < 0.03 && cw < 25
    return isAtPosition && isVerticalStrip && isNarrow
  }

  _detectCornerBorders(binary: any, h: number, w: number): any {
    const cornerMask = new this.cv.Mat.zeros(h, w, this.cv.CV_8UC1)
    const cornerH = Math.max(30, Math.floor(h * 0.10))
    const cornerW = Math.max(30, Math.floor(w * 0.10))
    const corners = [
      { x: 0, y: 0, w: cornerW, h: cornerH, name: '左上' },
      { x: w - cornerW, y: 0, w: cornerW, h: cornerH, name: '右上' },
      { x: 0, y: h - cornerH, w: cornerW, h: cornerH, name: '左下' },
      { x: w - cornerW, y: h - cornerH, w: cornerW, h: cornerH, name: '右下' }
    ]
    const threshold = 0.005

    for (const corner of corners) {
      const roi = binary.roi(new this.cv.Rect(corner.x, corner.y, corner.w, corner.h))
      const nonZeroPixels = this.cv.countNonZero(roi)
      const totalPixels = roi.rows * roi.cols
      const blackRatio = totalPixels > 0 ? nonZeroPixels / totalPixels : 0

      if (blackRatio > threshold) {
        const { contours, hierarchy } = this.findContours(roi)
        for (let i = 0; i < contours.size(); i++) {
          const cnt = contours.get(i)
          const cntArea = this.cv.contourArea(cnt)
          if (cntArea > 10) {
            const color = new this.cv.Scalar(255)
            const shiftedCnt = new this.cv.Mat(cnt.rows, cnt.cols, cnt.type())
            for (let j = 0; j < cnt.rows; j++) {
              shiftedCnt.data32S[j * 2] = cnt.data32S[j * 2] + corner.x
              shiftedCnt.data32S[j * 2 + 1] = cnt.data32S[j * 2 + 1] + corner.y
            }
            const singleContour = new this.cv.MatVector()
            singleContour.push_back(shiftedCnt)
            this.cv.drawContours(cornerMask, singleContour, -1, color, this.cv.FILLED)
            singleContour.delete()
            shiftedCnt.delete()
          }
        }
        contours.delete()
        hierarchy.delete()
      }
      roi.delete()
    }

    const morphKernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(3, 3))
    this.cv.morphologyEx(cornerMask, cornerMask, this.cv.MORPH_CLOSE, morphKernel)
    morphKernel.delete()

    return cornerMask
  }

  setOptions(options: Partial<BorderRemover>): void {
    Object.assign(this, options)
  }
}
