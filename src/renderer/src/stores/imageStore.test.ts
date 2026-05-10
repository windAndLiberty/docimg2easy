import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useImageStore } from '../stores/imageStore'

describe('imageStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should have empty imageList initially', () => {
    const store = useImageStore()
    expect(store.imageList).toEqual([])
    expect(store.currentImage).toBeNull()
  })

  it('should add images', () => {
    const store = useImageStore()
    const images = [
      { id: '1', name: 'a.jpg', path: '/a.jpg', thumbnail: '', originalUrl: 'file:///a.jpg', status: 'pending' as const }
    ]
    store.addImages(images)
    expect(store.imageList.length).toBe(1)
    expect(store.currentImageId).toBe('1')
  })

  it('should select image', () => {
    const store = useImageStore()
    store.addImages([{ id: '1', name: 'a.jpg', path: '/a.jpg', thumbnail: '', originalUrl: 'file:///a.jpg', status: 'pending' as const }])
    store.selectImage('1')
    expect(store.currentImageId).toBe('1')
  })

  it('should remove image', () => {
    const store = useImageStore()
    store.addImages([{ id: '1', name: 'a.jpg', path: '/a.jpg', thumbnail: '', originalUrl: 'file:///a.jpg', status: 'pending' as const }])
    store.removeImage('1')
    expect(store.imageList.length).toBe(0)
    expect(store.currentImageId).toBeNull()
  })

  it('should undo history', () => {
    const store = useImageStore()
    store.addImages([{ id: '1', name: 'a.jpg', path: '/a.jpg', thumbnail: '', originalUrl: 'file:///a.jpg', status: 'pending' as const }])
    store.saveHistory() // manually save before undo
    store.addImages([{ id: '2', name: 'b.jpg', path: '/b.jpg', thumbnail: '', originalUrl: 'file:///b.jpg', status: 'pending' as const }])
    store.undo()
    expect(store.imageList.length).toBe(1)
    expect(store.imageList[0].id).toBe('1')
  })

  it('should track skew angle', () => {
    const store = useImageStore()
    store.skewLeft()
    expect(store.skewAngle).toBe(-1)
    store.skewRight()
    store.skewRight()
    expect(store.skewAngle).toBe(1)
  })

  it('should reset state', () => {
    const store = useImageStore()
    store.addImages([{ id: '1', name: 'a.jpg', path: '/a.jpg', thumbnail: '', originalUrl: 'file:///a.jpg', status: 'pending' as const }])
    store.skewLeft()
    store.reset()
    expect(store.skewAngle).toBe(0)
  })
})
