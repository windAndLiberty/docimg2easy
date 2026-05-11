/**
 * ImageProcessor 单元测试
 * 测试基类所有基础图像操作
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImageProcessor } from './imageProcessor'
import type { CvMat, CvInstance, CvMatVector } from '../types/opencv'

// Mock OpenCV 全局实例
const createMockCv = (): CvInstance => {
  const mockMat: CvMat = {
    cols: 100,
    rows: 100,
    data: new Uint8Array(100 * 100 * 4),
    data64F: new Float64Array(6),
    data32S: new Int32Array(10),
    type: 24,
    channels: vi.fn().mockReturnValue(4),
    clone: vi.fn().mockReturnValue(null),
    delete: vi.fn(),
    roi: vi.fn().mockReturnValue(null as unknown as CvMat),
    ucharAt: vi.fn().mockReturnValue(128),
    setTo: vi.fn(),
    copyTo: vi.fn()
  }
  // 自引用 ROI 需要延迟初始化
  const selfRef: CvMat = { ...mockMat, clone: vi.fn().mockReturnValue({ ...mockMat }), delete: vi.fn(), roi: vi.fn().mockReturnValue(null as unknown as CvMat) }
  mockMat.roi = vi.fn().mockReturnValue(selfRef as unknown as CvMat)

  const mockMatVector: CvMatVector = {
    size: vi.fn().mockReturnValue(0),
    get: vi.fn().mockReturnValue(mockMat),
    push_back: vi.fn(),
    delete: vi.fn()
  }

  return {
    Mat: vi.fn().mockImplementation(function() { return { ...mockMat } }),
    MatVector: vi.fn().mockImplementation(function() { return { ...mockMatVector } }),
    Point: vi.fn().mockImplementation(function(x, y) { return { x, y, delete: vi.fn() } }),
    Size: vi.fn().mockImplementation(function(w, h) { return { width: w, height: h } }),
    Rect: vi.fn().mockImplementation(function(x, y, w, h) { return { x, y, width: w, height: h, delete: vi.fn() } }),
    Scalar: vi.fn().mockImplementation(function(...vals) { return vals }),

    imread: vi.fn().mockReturnValue(mockMat),
    imshow: vi.fn(),

    COLOR_RGBA2RGB: 1,
    COLOR_RGB2GRAY: 2,
    COLOR_RGBA2GRAY: 3,
    COLOR_RGB2RGBA: 4,
    cvtColor: vi.fn(),

    getRotationMatrix2D: vi.fn().mockReturnValue({
      ...mockMat,
      data64F: new Float64Array([1, 0, 0, 0, 1, 0])
    }),
    warpAffine: vi.fn(),
    rotate: vi.fn(),
    ROTATE_90_CLOCKWISE: 90,
    ROTATE_90_COUNTERCLOCKWISE: 270,
    ROTATE_180: 180,
    resize: vi.fn(),
    INTER_LINEAR: 1,
    BORDER_CONSTANT: 0,
    flip: vi.fn(),

    threshold: vi.fn(),
    THRESH_BINARY: 0,
    THRESH_BINARY_INV: 1,
    THRESH_OTSU: 8,
    adaptiveThreshold: vi.fn(),
    ADAPTIVE_THRESH_GAUSSIAN_C: 1,

    GaussianBlur: vi.fn(),
    medianBlur: vi.fn(),

    Canny: vi.fn(),

    getStructuringElement: vi.fn().mockReturnValue({ ...mockMat, delete: vi.fn() }),
    MORPH_RECT: 0,
    MORPH_OPEN: 2,
    MORPH_CLOSE: 3,
    morphologyEx: vi.fn(),
    dilate: vi.fn(),
    erode: vi.fn(),

    findContours: vi.fn(),
    RETR_EXTERNAL: 0,
    CHAIN_APPROX_SIMPLE: 2,
    drawContours: vi.fn(),
    boundingRect: vi.fn().mockReturnValue({ x: 0, y: 0, width: 10, height: 10 }),
    contourArea: vi.fn().mockReturnValue(100),
    arcLength: vi.fn().mockReturnValue(40),

    FILLED: -1,

    bitwise_and: vi.fn(),
    bitwise_or: vi.fn(),
    bitwise_not: vi.fn(),
    bitwise_xor: vi.fn(),

    countNonZero: vi.fn().mockReturnValue(1000),

    matFromArray: vi.fn().mockReturnValue({
      ...mockMat,
      data64F: new Float64Array([1, 0, 0, 0, 1, 0])
    }),
    CV_8UC1: 0,
    CV_8UC4: 24,
    CV_64FC1: 6,

    inpaint: vi.fn(),
    INPAINT_TELEA: 1,
    INPAINT_NS: 2,

    HoughLinesP: vi.fn(),

    zeros: vi.fn().mockImplementation(() => ({ ...mockMat }))
  } as unknown as CvInstance
}

// 设置全局 cv
const mockCv = createMockCv()
Object.defineProperty(window, 'cv', {
  value: mockCv,
  writable: true,
  configurable: true
})

describe('ImageProcessor', () => {
  let processor: ImageProcessor

  beforeEach(() => {
    processor = new ImageProcessor()
    vi.clearAllMocks()
  })

  describe('cv getter', () => {
    it('should return cv instance when available', () => {
      expect(processor['cv']).toBe(mockCv)
    })

    it('should throw when cv is not loaded', () => {
      const originalCv = window.cv
      Object.defineProperty(window, 'cv', { value: undefined, writable: true, configurable: true })
      expect(() => processor['cv']).toThrow('OpenCV.js 尚未加载')
      Object.defineProperty(window, 'cv', { value: originalCv, writable: true, configurable: true })
    })
  })

  describe('fromCanvas', () => {
    it('should create Mat from canvas', () => {
      const canvas = document.createElement('canvas')
      const result = processor.fromCanvas(canvas)
      expect(mockCv.imread).toHaveBeenCalledWith(canvas)
      expect(result).toBeTruthy()
    })

    it('should return null on error', () => {
      vi.mocked(mockCv.imread).mockImplementation(() => {
        throw new Error('fail')
      })
      const canvas = document.createElement('canvas')
      const result = processor.fromCanvas(canvas)
      expect(result).toBeNull()
    })
  })

  describe('toCanvas', () => {
    it('should render Mat to canvas', () => {
      const mat = createMockMat()
      const canvas = document.createElement('canvas')
      const result = processor.toCanvas(mat, canvas)
      expect(mockCv.imshow).toHaveBeenCalledWith(canvas, mat)
      expect(result).toBe(true)
    })

    it('should return false for invalid Mat', () => {
      const canvas = document.createElement('canvas')
      const result = processor.toCanvas(null as unknown as CvMat, canvas)
      expect(result).toBe(false)
    })
  })

  describe('rotate', () => {
    it('should rotate image by given angle', () => {
      const mat = createMockMat()
      processor.rotate(mat, 90)
      expect(mockCv.getRotationMatrix2D).toHaveBeenCalled()
      expect(mockCv.warpAffine).toHaveBeenCalled()
    })
  })

  describe('crop', () => {
    it('should crop image with valid rect', () => {
      const mat = createMockMat()
      // 为 crop 测试准备有效的 ROI 返回值
      const roiClone = createMockMat()
      const roiObj = createMockMat()
      vi.spyOn(roiObj, 'clone').mockReturnValue(roiClone)
      vi.spyOn(mat, 'roi').mockReturnValue(roiObj)
      
      const result = processor.crop(mat, { x: 10, y: 10, width: 50, height: 50 })
      expect(mockCv.Rect).toHaveBeenCalledWith(10, 10, 50, 50)
      expect(result).toBe(roiClone)
    })

    it('should return clone for invalid rect', () => {
      const mat = createMockMat()
      vi.spyOn(mat, 'clone').mockReturnValue({ ...mat })
      processor.crop(mat, { x: 0, y: 0, width: 0, height: 0 })
      expect(mat.clone).toHaveBeenCalled()
    })
  })

  describe('toGray', () => {
    it('should convert RGBA to gray', () => {
      const mat = createMockMat()
      vi.spyOn(mat, 'channels').mockReturnValue(4)
      processor.toGray(mat)
      expect(mockCv.cvtColor).toHaveBeenCalledTimes(2)
    })

    it('should convert RGB to gray', () => {
      const mat = createMockMat()
      vi.spyOn(mat, 'channels').mockReturnValue(3)
      processor.toGray(mat)
      expect(mockCv.cvtColor).toHaveBeenCalledTimes(1)
    })

    it('should return clone for already gray', () => {
      const mat = createMockMat()
      vi.spyOn(mat, 'channels').mockReturnValue(1)
      vi.spyOn(mat, 'clone').mockReturnValue({ ...mat })
      processor.toGray(mat)
      expect(mat.clone).toHaveBeenCalled()
    })
  })

  describe('binarize', () => {
    it('should binarize with fixed threshold', () => {
      const mat = createMockMat()
      processor.binarize(mat, 127)
      expect(mockCv.threshold).toHaveBeenCalledWith(mat, expect.anything(), 127, 255, mockCv.THRESH_BINARY)
    })

    it('should binarize with adaptive threshold', () => {
      const mat = createMockMat()
      processor.binarize(mat, 127, true)
      expect(mockCv.adaptiveThreshold).toHaveBeenCalled()
    })
  })

  describe('findContours', () => {
    it('should find contours', () => {
      const mat = createMockMat()
      const result = processor.findContours(mat)
      expect(mockCv.findContours).toHaveBeenCalled()
      expect(result.contours).toBeTruthy()
      expect(result.hierarchy).toBeTruthy()
    })
  })

  describe('morphological operations', () => {
    it('should dilate', () => {
      const mat = createMockMat()
      processor.dilate(mat, 5)
      expect(mockCv.dilate).toHaveBeenCalled()
    })

    it('should erode', () => {
      const mat = createMockMat()
      processor.erode(mat, 5)
      expect(mockCv.erode).toHaveBeenCalled()
    })

    it('should morphOpen', () => {
      const mat = createMockMat()
      processor.morphOpen(mat, 5)
      expect(mockCv.morphologyEx).toHaveBeenCalled()
    })

    it('should morphClose', () => {
      const mat = createMockMat()
      processor.morphClose(mat, 5)
      expect(mockCv.morphologyEx).toHaveBeenCalled()
    })
  })

  describe('deleteMat', () => {
    it('should safely delete Mat', () => {
      const mat = createMockMat()
      processor.deleteMat(mat)
      expect(mat.delete).toHaveBeenCalled()
    })

    it('should handle null', () => {
      expect(() => processor.deleteMat(null)).not.toThrow()
    })
  })

  describe('getArea', () => {
    it('should calculate area', () => {
      const mat = createMockMat()
      expect(processor.getArea(mat)).toBe(10000)
    })
  })
})

// Mock Mat 工厂
function createMockMat(overrides: Partial<CvMat> = {}): CvMat {
  return {
    cols: 100,
    rows: 100,
    data: new Uint8Array(100 * 100 * 4),
    data64F: new Float64Array(6),
    data32S: new Int32Array(10),
    type: 24,
    channels: vi.fn().mockReturnValue(4),
    clone: vi.fn().mockReturnValue(null),
    delete: vi.fn(),
    roi: vi.fn().mockReturnValue(null as unknown as CvMat),
    ucharAt: vi.fn().mockReturnValue(128),
    setTo: vi.fn(),
    copyTo: vi.fn(),
    ...overrides
  }
}