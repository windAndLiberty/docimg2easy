/**
 * OpenCV.js 最小可用 TypeScript 类型定义
 * 由于官方无 TS 支持，自建类型以保证核心模块类型安全
 */

export interface CvPoint {
  x: number
  y: number
}

export interface CvSize {
  width: number
  height: number
}

export interface CvRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CvScalar {
  // OpenCV Scalar 是数组形式
  readonly [index: number]: number
}

export interface CvMat {
  readonly cols: number
  readonly rows: number
  readonly data: Uint8Array
  readonly data64F: Float64Array
  readonly data32S: Int32Array
  readonly type: number
  channels(): number
  clone(): CvMat
  delete(): void
  roi(rect: CvRect): CvMat
  ucharAt(y: number, x: number): number
  setTo(scalar: CvScalar, mask?: CvMat): void
  copyTo(dst: CvMat, mask?: CvMat): void
}

export interface CvMatVector {
  size(): number
  get(index: number): CvMat
  push_back(mat: CvMat): void
  delete(): void
}

export interface CvInstance {
  // 核心类
  Mat: new (...args: any[]) => CvMat & { data64F: Float64Array; delete(): void }
  MatVector: new () => CvMatVector
  Point: new (x: number, y: number) => CvPoint & { delete(): void }
  Size: new (width: number, height: number) => CvSize
  Rect: new (x: number, y: number, width: number, height: number) => CvRect
  Scalar: new (...values: number[]) => CvScalar

  // Mat 静态方法
  zeros(rows: number, cols: number, type: number): CvMat

  // 图像读写
  imread(source: HTMLCanvasElement | string): CvMat
  imshow(canvas: HTMLCanvasElement | string, mat: CvMat): void

  // 颜色空间转换
  COLOR_RGBA2RGB: number
  COLOR_RGB2GRAY: number
  COLOR_GRAY2RGB: number
  COLOR_RGBA2GRAY: number
  cvtColor(src: CvMat, dst: CvMat, code: number): void

  // 几何变换
  getRotationMatrix2D(center: CvPoint, angle: number, scale: number): CvMat & { data64F: Float64Array; delete(): void }
  warpAffine(src: CvMat, dst: CvMat, M: CvMat, dsize: CvSize, flags?: number, borderMode?: number, borderValue?: CvScalar): void
  rotate(src: CvMat, dst: CvMat, rotateCode: number): void
  ROTATE_90_CLOCKWISE: number
  ROTATE_90_COUNTERCLOCKWISE: number
  ROTATE_180: number
  resize(src: CvMat, dst: CvMat, dsize: CvSize, fx?: number, fy?: number, interpolation?: number): void
  INTER_LINEAR: number
  BORDER_CONSTANT: number
  flip(src: CvMat, dst: CvMat, flipCode: number): void

  // 阈值/二值化
  threshold(src: CvMat, dst: CvMat, thresh: number, maxval: number, type: number): void
  THRESH_BINARY: number
  THRESH_BINARY_INV: number
  THRESH_OTSU: number
  adaptiveThreshold(src: CvMat, dst: CvMat, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, C: number): void
  ADAPTIVE_THRESH_GAUSSIAN_C: number

  // 滤波
  GaussianBlur(src: CvMat, dst: CvMat, ksize: CvSize, sigmaX: number): void
  medianBlur(src: CvMat, dst: CvMat, ksize: number): void

  // 边缘检测
  Canny(src: CvMat, dst: CvMat, threshold1: number, threshold2: number): void

  // 形态学
  getStructuringElement(shape: number, ksize: CvSize): CvMat & { delete(): void }
  MORPH_RECT: number
  MORPH_OPEN: number
  MORPH_CLOSE: number
  morphologyEx(src: CvMat, dst: CvMat, op: number, kernel: CvMat): void
  dilate(src: CvMat, dst: CvMat, kernel: CvMat): void
  erode(src: CvMat, dst: CvMat, kernel: CvMat): void

  // 轮廓
  findContours(src: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number): void
  RETR_EXTERNAL: number
  CHAIN_APPROX_SIMPLE: number
  drawContours(src: CvMat, contours: CvMatVector, contourIdx: number, color: CvScalar, thickness: number): void
  boundingRect(contour: CvMat): CvRect
  contourArea(contour: CvMat): number
  arcLength(curve: CvMat, closed: boolean): number
  convexHull(points: CvMat, hull: CvMat, clockwise?: boolean, returnPoints?: boolean): void
  approxPolyDP(curve: CvMat, approxCurve: CvMat, epsilon: number, closed: boolean): void

  // 填充
  FILLED: number

  // 位运算
  bitwise_and(src1: CvMat, src2: CvMat, dst: CvMat, mask?: CvMat): void
  bitwise_or(src1: CvMat, src2: CvMat, dst: CvMat, mask?: CvMat): void
  bitwise_not(src: CvMat, dst: CvMat): void
  bitwise_xor(src1: CvMat, src2: CvMat, dst: CvMat, mask?: CvMat): void

  // 统计
  countNonZero(src: CvMat): number

  // 矩阵操作
  matFromArray(rows: number, cols: number, type: number, data: number[]): CvMat & { data64F: Float64Array; delete(): void }
  CV_8UC1: number
  CV_8UC4: number
  CV_64FC1: number

  // 修复
  inpaint(src: CvMat, inpaintMask: CvMat, dst: CvMat, inpaintRadius: number, flags: number): void
  INPAINT_TELEA: number
  INPAINT_NS: number

  // Hough 变换
  HoughLinesP(src: CvMat, lines: CvMat, rho: number, theta: number, threshold: number, minLineLength?: number, maxLineGap?: number): void
}

// 全局声明
declare global {
  interface Window {
    cv?: CvInstance
  }
}

export {}
