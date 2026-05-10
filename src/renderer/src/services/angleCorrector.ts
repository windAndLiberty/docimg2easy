/**
 * 角度校正器
 * 使用霍夫变换检测直线并计算平均角度进行旋转校正
 */
import { ImageProcessor } from './imageProcessor'

export class AngleCorrector extends ImageProcessor {
  minLineLength = 100
  maxLineGap = 10
  houghThreshold = 100
  angleThreshold = 5

  /**
   * 自动校正图像角度
   */
  correct(src: any): any {
    const angle = this.calculateAngle(src)
    if (Math.abs(angle) < 0.1) {
      return src.clone()
    }
    return this.rotate(src, angle)
  }

  /**
   * 计算图像的倾斜角度
   */
  calculateAngle(src: any): number {
    const gray = this.toGray(src)
    const blurred = this.gaussianBlur(gray, 5)
    gray.delete()
    const edges = this.canny(blurred, 50, 150)
    blurred.delete()

    const lines = new this.cv.Mat()
    this.cv.HoughLinesP(edges, lines, 1, Math.PI / 180, this.houghThreshold, this.minLineLength, this.maxLineGap)
    edges.delete()

    if (lines.rows === 0) {
      lines.delete()
      return 0
    }

    const angles: number[] = []
    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4]
      const y1 = lines.data32S[i * 4 + 1]
      const x2 = lines.data32S[i * 4 + 2]
      const y2 = lines.data32S[i * 4 + 3]
      const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
      if (length >= this.minLineLength) {
        let angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
        if (angle > 45) angle -= 90
        else if (angle < -45) angle += 90
        if (Math.abs(angle) <= this.angleThreshold) {
          angles.push(angle)
        }
      }
    }
    lines.delete()

    if (angles.length === 0) return 0
    angles.sort((a, b) => a - b)
    return angles[Math.floor(angles.length / 2)]
  }

  setOptions(options: Partial<AngleCorrector>): void {
    Object.assign(this, options)
  }
}
