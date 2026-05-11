/**
 * Mat 生命周期工具单元测试
 * 验证 safeDelete、usingMat、isValidMat 等核心工具
 */

import { describe, it, expect, vi } from 'vitest'
import {
  safeDelete,
  safeDeleteMany,
  usingMat,
  usingMats,
  isValidMat,
  safeClone,
  estimateMemory
} from './matLifecycle'
import type { CvMat } from '../types/opencv'

  // Mock Mat 工厂
function createMockMat(overrides: Partial<CvMat> = {}): CvMat {
  const mockMat: CvMat = {
    cols: 100,
    rows: 100,
    data: new Uint8Array(100 * 100 * 3),
    data64F: new Float64Array(10),
    data32S: new Int32Array(10),
    type: 16,
    channels: () => 3,
    clone: vi.fn().mockReturnValue(null),
    delete: vi.fn(),
    roi: vi.fn().mockReturnValue(null as unknown as CvMat),
    ucharAt: vi.fn().mockReturnValue(128),
    setTo: vi.fn(),
    copyTo: vi.fn(),
    ...overrides
  }
  return mockMat
}

describe('safeDelete', () => {
  it('should call delete on valid mat', () => {
    const mat = createMockMat()
    safeDelete(mat)
    expect(mat.delete).toHaveBeenCalled()
  })

  it('should not throw on null', () => {
    expect(() => safeDelete(null)).not.toThrow()
  })

  it('should not throw on undefined', () => {
    expect(() => safeDelete(undefined)).not.toThrow()
  })

  it('should not throw if delete throws', () => {
    const mat = createMockMat({
      delete: vi.fn().mockImplementation(() => {
        throw new Error('already deleted')
      })
    })
    expect(() => safeDelete(mat)).not.toThrow()
  })

  it('should handle mat without delete method', () => {
    const fakeMat = { rows: 10, cols: 10 } as unknown as CvMat
    expect(() => safeDelete(fakeMat)).not.toThrow()
  })
})

describe('safeDeleteMany', () => {
  it('should delete all provided mats', () => {
    const mat1 = createMockMat()
    const mat2 = createMockMat()
    safeDeleteMany(mat1, mat2, null, undefined)
    expect(mat1.delete).toHaveBeenCalled()
    expect(mat2.delete).toHaveBeenCalled()
  })
})

describe('usingMat', () => {
  it('should auto-delete mat after use', () => {
    const mat = createMockMat()
    const factory = vi.fn().mockReturnValue(mat)
    const use = vi.fn().mockReturnValue('result')

    const result = usingMat(factory, use)

    expect(factory).toHaveBeenCalled()
    expect(use).toHaveBeenCalledWith(mat)
    expect(mat.delete).toHaveBeenCalled()
    expect(result).toBe('result')
  })

  it('should still delete if use throws', () => {
    const mat = createMockMat()
    const factory = vi.fn().mockReturnValue(mat)
    const use = vi.fn().mockImplementation(() => {
      throw new Error('use failed')
    })

    expect(() => usingMat(factory, use)).toThrow('use failed')
    expect(mat.delete).toHaveBeenCalled()
  })
})

describe('usingMats', () => {
  it('should auto-delete all mats after use', () => {
    const mat1 = createMockMat()
    const mat2 = createMockMat()
    const factories = [vi.fn().mockReturnValue(mat1), vi.fn().mockReturnValue(mat2)]
    const use = vi.fn().mockReturnValue('done')

    const result = usingMats(factories, use)

    expect(use).toHaveBeenCalledWith([mat1, mat2])
    expect(mat1.delete).toHaveBeenCalled()
    expect(mat2.delete).toHaveBeenCalled()
    expect(result).toBe('done')
  })
})

describe('isValidMat', () => {
  it('should return true for valid mat', () => {
    const mat = createMockMat()
    expect(isValidMat(mat)).toBe(true)
  })

  it('should return false for null', () => {
    expect(isValidMat(null)).toBe(false)
  })

  it('should return false for undefined', () => {
    expect(isValidMat(undefined)).toBe(false)
  })

  it('should return false for zero-size mat', () => {
    const mat = createMockMat({ rows: 0, cols: 100 })
    expect(isValidMat(mat)).toBe(false)
  })

  it('should return false for negative-size mat', () => {
    const mat = createMockMat({ rows: -1, cols: 100 })
    expect(isValidMat(mat)).toBe(false)
  })

  it('should return false for object without rows/cols', () => {
    const fake = { data: new Uint8Array(10) } as unknown as CvMat
    expect(isValidMat(fake)).toBe(false)
  })
})

describe('safeClone', () => {
  it('should return clone of valid mat', () => {
    const mat = createMockMat()
    const cloned = createMockMat()
    mat.clone = vi.fn().mockReturnValue(cloned)

    const result = safeClone(mat)

    expect(mat.clone).toHaveBeenCalled()
    expect(result).toBe(cloned)
  })

  it('should return null for invalid mat', () => {
    expect(safeClone(null)).toBeNull()
  })

  it('should return null if clone throws', () => {
    const mat = createMockMat({
      clone: vi.fn().mockImplementation(() => {
        throw new Error('clone failed')
      })
    })
    expect(safeClone(mat)).toBeNull()
  })
})

describe('estimateMemory', () => {
  it('should calculate correct memory for RGB', () => {
    const mat = createMockMat({ rows: 100, cols: 200, channels: () => 3 })
    expect(estimateMemory(mat)).toBe(100 * 200 * 3)
  })

  it('should calculate correct memory for grayscale', () => {
    const mat = createMockMat({ rows: 50, cols: 50, channels: () => 1 })
    expect(estimateMemory(mat)).toBe(50 * 50 * 1)
  })

  it('should return 0 for invalid mat', () => {
    expect(estimateMemory(null as unknown as CvMat)).toBe(0)
  })
})
