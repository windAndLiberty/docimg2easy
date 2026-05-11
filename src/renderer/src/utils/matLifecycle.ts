/**
 * Mat 生命周期管理工具
 * 提供 OpenCV.js Mat 对象的安全创建、释放和 RAII 包装
 * 防止内存泄漏和重复删除导致的崩溃
 */

import type { CvMat, CvMatVector } from '../types/opencv'

/**
 * 安全删除 Mat 或 MatVector
 * 静默处理已删除/无效对象，不抛出异常
 */
export function safeDelete(mat: CvMat | CvMatVector | null | undefined): void {
  if (!mat) return
  try {
    // OpenCV.js 对象有 delete 方法
    if (typeof (mat as any).delete === 'function') {
      ;(mat as any).delete()
    }
  } catch {
    // 已删除或对象无效，静默忽略
  }
}

/**
 * 批量安全删除多个 Mat
 */
export function safeDeleteMany(...mats: (CvMat | CvMatVector | null | undefined)[]): void {
  for (const mat of mats) {
    safeDelete(mat)
  }
}

/**
 * RAII 包装：在作用域结束时自动释放 Mat
 * 用法:
 *   usingMat(() => new cv.Mat(), (mat) => {
 *     // 使用 mat
 *   }) // mat 在这里自动删除
 */
export function usingMat<T>(factory: () => CvMat, use: (mat: CvMat) => T): T {
  const mat = factory()
  try {
    return use(mat)
  } finally {
    safeDelete(mat)
  }
}

/**
 * RAII 包装多个 Mat
 * 用法:
 *   usingMats(
 *     [() => new cv.Mat(), () => new cv.Mat()],
 *     ([mat1, mat2]) => {
 *       // 使用 mat1, mat2
 *     }
 *   )
 */
export function usingMats<T>(factories: (() => CvMat)[], use: (mats: CvMat[]) => T): T {
  const mats = factories.map((f) => f())
  try {
    return use(mats)
  } finally {
    for (const mat of mats) {
      safeDelete(mat)
    }
  }
}

/**
 * 创建临时中间 Mat，自动管理生命周期
 * 用于链式图像处理操作
 */
export function createTempMat(cv: any, rows: number, cols: number, type: number): CvMat {
  return new cv.Mat(rows, cols, type) as CvMat
}

/**
 * 验证 Mat 是否有效
 */
export function isValidMat(mat: CvMat | null | undefined): mat is CvMat {
  if (!mat) return false
  if (typeof mat.rows !== 'number' || typeof mat.cols !== 'number') return false
  if (mat.rows <= 0 || mat.cols <= 0) return false
  return true
}

/**
 * 克隆 Mat（确保返回有效副本）
 */
export function safeClone(mat: CvMat | null | undefined): CvMat | null {
  if (!isValidMat(mat)) return null
  try {
    return mat.clone()
  } catch {
    return null
  }
}

/**
 * Mat 内存使用估算（字节）
 */
export function estimateMemory(mat: CvMat): number {
  if (!isValidMat(mat)) return 0
  return mat.rows * mat.cols * mat.channels()
}

/**
 * 创建空白 Mat（指定尺寸和通道数）
 */
export function createBlankMat(
  cv: any,
  width: number,
  height: number,
  channels: number = 3
): CvMat {
  const type = channels === 1 ? cv.CV_8UC1 : cv.CV_8UC4
  return new cv.Mat(height, width, type) as CvMat
}

/**
 * 从 Canvas 安全读取图像到 Mat
 */
export function matFromCanvas(cv: any, canvas: HTMLCanvasElement): CvMat | null {
  try {
    return cv.imread(canvas) as CvMat
  } catch (err) {
    console.error('[matLifecycle] matFromCanvas failed:', err)
    return null
  }
}

/**
 * 将 Mat 安全绘制到 Canvas
 */
export function matToCanvas(cv: any, mat: CvMat, canvas: HTMLCanvasElement): boolean {
  if (!isValidMat(mat)) return false
  try {
    cv.imshow(canvas, mat)
    return true
  } catch (err) {
    console.error('[matLifecycle] matToCanvas failed:', err)
    return false
  }
}

/**
 * 将 Mat 转换为 DataURL
 */
export function matToDataUrl(cv: any, mat: CvMat): string | null {
  if (!isValidMat(mat)) return null
  const canvas = document.createElement('canvas')
  canvas.width = mat.cols
  canvas.height = mat.rows
  if (!matToCanvas(cv, mat, canvas)) return null
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
