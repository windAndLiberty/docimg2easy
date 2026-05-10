import { describe, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useImageStore } from '../stores/imageStore'

describe('importFolder', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should populate imageList when folder contains images', async () => {
    const store = useImageStore()

    // Mock window.api
    const mockPaths = ['/test/folder/a.jpg', '/test/folder/b.png']
    globalThis.window = {
      api: {
        openDirectory: vi.fn().mockResolvedValue('/test/folder'),
        scanFolder: vi.fn().mockResolvedValue(mockPaths)
      }
    } as any

    await store.importFolder()

    expect(store.imageList.length).toBe(2)
    expect(store.imageList[0].name).toBe('a.jpg')
    expect(store.imageList[1].name).toBe('b.png')
    expect(store.currentImageId).toBe(store.imageList[0].id)
  })

  it('should do nothing when user cancels dialog', async () => {
    const store = useImageStore()

    globalThis.window = {
      api: {
        openDirectory: vi.fn().mockResolvedValue(null),
        scanFolder: vi.fn()
      }
    } as any

    await store.importFolder()

    expect(store.imageList.length).toBe(0)
    expect(store.currentImageId).toBeNull()
  })

  it('should handle empty folder gracefully', async () => {
    const store = useImageStore()

    globalThis.window = {
      api: {
        openDirectory: vi.fn().mockResolvedValue('/test/empty'),
        scanFolder: vi.fn().mockResolvedValue([])
      }
    } as any

    await store.importFolder()

    expect(store.imageList.length).toBe(0)
    expect(store.currentImageId).toBeNull()
  })
})
