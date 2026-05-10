/**
 * 文档污渍清理器
 * 使用多特征评分系统识别并去除污渍
 */
import { ImageProcessor } from './imageProcessor'

export class DocumentCleaner extends ImageProcessor {
  minArea = 5
  maxArea = 5000
  stainThreshold = 0.75
  inpaintRadius = 3
  weights = { solidity: 0.25, circularity: 0.35, compactness: 0.15, sizePenalty: 0.25 }
  edgeMargin = 30
  minAspectRatio = 0.1

  clean(src: any): any {
    if (!src || src.rows === 0 || src.cols === 0) {
      return src.clone()
    }
    const stains = this.detectStains(src)
    if (stains.length === 0) {
      return src.clone()
    }
    return this.removeStains(src, stains)
  }

  detectStains(src: any): any[] {
    let gray: any = null
    let blurred: any = null
    let binary: any = null
    let inverted: any = null
    let cleaned: any = null
    let kernel: any = null
    let contours: any = null
    let hierarchy: any = null

    try {
      gray = this.toGray(src)
      blurred = this.gaussianBlur(gray, 3)
      binary = new this.cv.Mat()
      this.cv.adaptiveThreshold(blurred, binary, 255, this.cv.ADAPTIVE_THRESH_GAUSSIAN_C, this.cv.THRESH_BINARY_INV, 11, 2)
      inverted = new this.cv.Mat()
      this.cv.bitwise_not(binary, inverted)
      kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(2, 2))
      cleaned = new this.cv.Mat()
      this.cv.morphologyEx(inverted, cleaned, this.cv.MORPH_OPEN, kernel)

      contours = new this.cv.MatVector()
      hierarchy = new this.cv.Mat()
      this.cv.findContours(cleaned, contours, hierarchy, this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE)

      const stains: any[] = []
      const contourArray: any[] = []
      for (let i = 0; i < contours.size(); i++) {
        contourArray.push(contours.get(i))
      }

      for (let i = 0; i < contourArray.length; i++) {
        const contour = contourArray[i]
        const area = this.cv.contourArea(contour)
        if (area < this.minArea) continue
        if (area > this.maxArea * 3) {
          stains.push({ contour: contour.clone(), area, isLarge: true })
          continue
        }
        const features = this.calculateFeatures(contour, area)
        const score = this.calculateStainScore(features, area)
        const isPunct = this.isLikelyPunctuation(contour, contourArray, i)
        const isVerySmall = area < 15
        const isExtremelyThin = features.aspectRatio < 0.08 || features.aspectRatio > 12
        const isSmallStain = isVerySmall && !isExtremelyThin
        const rect = features.boundingRect
        const isLeftEdge = rect.x < this.edgeMargin
        const isTopEdge = rect.y < this.edgeMargin
        const isRightEdge = (src.cols - (rect.x + rect.width)) < this.edgeMargin
        const isBottomEdge = (src.rows - (rect.y + rect.height)) < this.edgeMargin
        const isLeftEdgeStain = isLeftEdge && area < 200
        const isOtherEdgeStain = (isTopEdge || isRightEdge || isBottomEdge) && area < 100 && score > 0.5
        const isEdgeLargeStain = isLeftEdgeStain || isOtherEdgeStain

        if (isSmallStain || isEdgeLargeStain || (score > this.stainThreshold && !isPunct)) {
          stains.push({ contour: contour.clone(), area, features, score, isLarge: area > 100 })
        }
      }
      return stains
    } catch (error) {
      console.error('detectStains error:', error)
      return []
    } finally {
      if (gray) gray.delete()
      if (blurred) blurred.delete()
      if (binary) binary.delete()
      if (inverted) inverted.delete()
      if (cleaned) cleaned.delete()
      if (kernel) kernel.delete()
      if (contours) contours.delete()
      if (hierarchy) hierarchy.delete()
    }
  }

  calculateFeatures(contour: any, area: number) {
    const rect = this.cv.boundingRect(contour)
    const hull = new this.cv.Mat()
    this.cv.convexHull(contour, hull, false, false)
    const hullArea = this.cv.contourArea(hull)
    hull.delete()
    const perimeter = this.cv.arcLength(contour, true)
    const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0
    return {
      solidity: hullArea > 0 ? area / hullArea : 0,
      circularity: Math.min(1.0, circularity),
      compactness: (rect.width * rect.height) > 0 ? area / (rect.width * rect.height) : 0,
      aspectRatio: rect.width > 0 ? rect.height / rect.width : 0,
      boundingRect: rect,
      width: rect.width,
      height: rect.height
    }
  }

  calculateStainScore(features: any, area: number): number {
    const sizeScore = this.calculateSizeScore(area)
    const aspectRatio = features.aspectRatio
    let aspectPenalty = 1.0
    if (aspectRatio < 0.15 || aspectRatio > 6.0) aspectPenalty = 0.5
    else if (aspectRatio < 0.3 || aspectRatio > 3.5) aspectPenalty = 0.75
    let compactnessBonus = 1.0
    if (features.compactness < 0.4) compactnessBonus = 0.6
    else if (features.compactness < 0.6) compactnessBonus = 0.8
    else compactnessBonus = 1.1
    let score = (
      features.solidity * this.weights.solidity +
      features.circularity * this.weights.circularity +
      features.compactness * this.weights.compactness +
      sizeScore * this.weights.sizePenalty
    )
    score = score * aspectPenalty * compactnessBonus
    return Math.min(1.0, Math.max(0, score))
  }

  calculateSizeScore(area: number): number {
    if (area < 15) return 0.95
    if (area < 30) return 0.85
    if (area > this.maxArea) return 0.9
    if (area > 2000) return 0.7
    return 0.3
  }

  isLikelyPunctuation(contour: any, allContours: any[], contourIdx: number): boolean {
    const area = this.cv.contourArea(contour)
    if (area < 15 || area > 80) return false
    const rect = this.cv.boundingRect(contour)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    for (let i = 0; i < allContours.length; i++) {
      if (i === contourIdx) continue
      const otherArea = this.cv.contourArea(allContours[i])
      if (otherArea < this.minArea) continue
      const otherRect = this.cv.boundingRect(allContours[i])
      const ocx = otherRect.x + otherRect.width / 2
      const ocy = otherRect.y + otherRect.height / 2
      if (ocy > cy && Math.abs(cx - ocx) < otherRect.width && (otherRect.y - (rect.y + rect.height)) < 20) {
        return true
      }
    }
    return false
  }

  removeStains(src: any, stains: any[]): any {
    if (stains.length === 0) return src.clone()
    let dilatedMask: any = null
    let dst: any = null
    let smallMask: any = null
    let largeMask: any = null
    let kernel: any = null
    let contourVec: any = null

    try {
      smallMask = new this.cv.Mat.zeros(src.rows, src.cols, this.cv.CV_8UC1)
      largeMask = new this.cv.Mat.zeros(src.rows, src.cols, this.cv.CV_8UC1)

      for (const stain of stains) {
        contourVec = new this.cv.MatVector()
        contourVec.push_back(stain.contour)
        const color = new this.cv.Scalar(255)
        if (stain.isLarge) {
          this.cv.drawContours(largeMask, contourVec, -1, color, -1)
        } else {
          this.cv.drawContours(smallMask, contourVec, -1, color, -1)
        }
        contourVec.delete()
        contourVec = null
        stain.contour.delete()
      }

      dst = src.clone()

      const hasSmallSpots = this.cv.countNonZero(smallMask) > 0
      if (hasSmallSpots) {
        for (let y = 0; y < dst.rows; y++) {
          for (let x = 0; x < dst.cols; x++) {
            if (smallMask.data[y * smallMask.cols + x] > 0) {
              const idx = y * dst.cols * dst.channels() + x * dst.channels()
              dst.data[idx] = 255
              dst.data[idx + 1] = 255
              dst.data[idx + 2] = 255
            }
          }
        }
      }

      const hasLargeStains = this.cv.countNonZero(largeMask) > 0
      if (hasLargeStains) {
        kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(3, 3))
        dilatedMask = new this.cv.Mat()
        this.cv.dilate(largeMask, dilatedMask, kernel)

        let srcForInpaint = src
        let needConvert = false
        if (src.channels() === 4) {
          srcForInpaint = new this.cv.Mat()
          this.cv.cvtColor(src, srcForInpaint, this.cv.COLOR_RGBA2RGB)
          needConvert = true
        } else if (src.channels() === 1) {
          srcForInpaint = new this.cv.Mat()
          this.cv.cvtColor(src, srcForInpaint, this.cv.COLOR_GRAY2RGB)
          needConvert = true
        }

        const tempDst = new this.cv.Mat()
        try {
          this.cv.inpaint(srcForInpaint, dilatedMask, tempDst, this.inpaintRadius, this.cv.INPAINT_TELEA)
          tempDst.copyTo(dst)
        } catch (inpaintError) {
          console.error('inpaint error:', inpaintError)
        } finally {
          tempDst.delete()
          if (needConvert && srcForInpaint) srcForInpaint.delete()
        }
      }

      return dst
    } catch (error) {
      console.error('removeStains error:', error)
      return src.clone()
    } finally {
      if (dilatedMask) dilatedMask.delete()
      if (smallMask) smallMask.delete()
      if (largeMask) largeMask.delete()
      if (kernel) kernel.delete()
      if (contourVec) contourVec.delete()
    }
  }

  setOptions(options: Partial<DocumentCleaner>): void {
    Object.assign(this, options)
  }
}
