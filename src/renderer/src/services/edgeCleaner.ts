/**
 * 边缘清理器
 * 使用灰度分析和裁剪技术清理边缘
 */
import { ImageProcessor } from './imageProcessor'

export class EdgeCleaner extends ImageProcessor {
  edgeThreshold = 30
  minEdgeWidth = 10
  maxEdgeWidth = 100

  clean(src: any): any {
    const edges = this.detectEdges(src)
    const cropRect = this.calculateCropRect(src, edges)
    if (cropRect.width <= 0 || cropRect.height <= 0) {
      return src.clone()
    }
    return this.crop(src, cropRect)
  }

  detectEdges(src: any): { top: number; bottom: number; left: number; right: number } {
    const gray = this.toGray(src)
    const rowMeans = this.analyzeRowMeans(gray)
    const colMeans = this.analyzeColMeans(gray)
    gray.delete()
    return {
      top: this.detectTopEdge(rowMeans),
      bottom: this.detectBottomEdge(rowMeans),
      left: this.detectLeftEdge(colMeans),
      right: this.detectRightEdge(colMeans)
    }
  }

  analyzeRowMeans(gray: any): number[] {
    const means: number[] = []
    for (let y = 0; y < gray.rows; y++) {
      let sum = 0
      for (let x = 0; x < gray.cols; x++) {
        sum += gray.ucharAt(y, x)
      }
      means.push(sum / gray.cols)
    }
    return means
  }

  analyzeColMeans(gray: any): number[] {
    const means: number[] = []
    for (let x = 0; x < gray.cols; x++) {
      let sum = 0
      for (let y = 0; y < gray.rows; y++) {
        sum += gray.ucharAt(y, x)
      }
      means.push(sum / gray.rows)
    }
    return means
  }

  detectTopEdge(rowMeans: number[]): number {
    const maxCheck = Math.min(rowMeans.length * 0.3, this.maxEdgeWidth)
    for (let i = 0; i < maxCheck; i++) {
      if (i > 0 && Math.abs(rowMeans[i] - rowMeans[i - 1]) > this.edgeThreshold) return i
      if (rowMeans[i] > this.edgeThreshold * 5) return i
    }
    return 0
  }

  detectBottomEdge(rowMeans: number[]): number {
    const maxCheck = Math.min(rowMeans.length * 0.3, this.maxEdgeWidth)
    for (let i = rowMeans.length - 1; i >= rowMeans.length - maxCheck; i--) {
      if (i < rowMeans.length - 1 && Math.abs(rowMeans[i] - rowMeans[i + 1]) > this.edgeThreshold) return rowMeans.length - 1 - i
      if (rowMeans[i] > this.edgeThreshold * 5) return rowMeans.length - 1 - i
    }
    return 0
  }

  detectLeftEdge(colMeans: number[]): number {
    const maxCheck = Math.min(colMeans.length * 0.3, this.maxEdgeWidth)
    for (let i = 0; i < maxCheck; i++) {
      if (i > 0 && Math.abs(colMeans[i] - colMeans[i - 1]) > this.edgeThreshold) return i
      if (colMeans[i] > this.edgeThreshold * 5) return i
    }
    return 0
  }

  detectRightEdge(colMeans: number[]): number {
    const maxCheck = Math.min(colMeans.length * 0.3, this.maxEdgeWidth)
    for (let i = colMeans.length - 1; i >= colMeans.length - maxCheck; i--) {
      if (i < colMeans.length - 1 && Math.abs(colMeans[i] - colMeans[i + 1]) > this.edgeThreshold) return colMeans.length - 1 - i
      if (colMeans[i] > this.edgeThreshold * 5) return colMeans.length - 1 - i
    }
    return 0
  }

  calculateCropRect(src: any, edges: { top: number; bottom: number; left: number; right: number }): { x: number; y: number; width: number; height: number } {
    const safeTop = Math.min(Math.max(edges.top, 0), this.maxEdgeWidth)
    const safeBottom = Math.min(Math.max(edges.bottom, 0), this.maxEdgeWidth)
    const safeLeft = Math.min(Math.max(edges.left, 0), this.maxEdgeWidth)
    const safeRight = Math.min(Math.max(edges.right, 0), this.maxEdgeWidth)
    return {
      x: safeLeft,
      y: safeTop,
      width: src.cols - safeLeft - safeRight,
      height: src.rows - safeTop - safeBottom
    }
  }

  setOptions(options: Partial<EdgeCleaner>): void {
    Object.assign(this, options)
  }
}
