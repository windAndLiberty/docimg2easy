/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  electron: import('@electron-toolkit/preload').ElectronAPI
  api: {
    openDirectory: () => Promise<string | null>
    openFile: () => Promise<string | null>
    scanFolder: (folderPath: string) => Promise<string[]>
    readImageFile: (path: string) => Promise<{ data: number[]; width: number; height: number; channels: number }>
    exportImage: (path: string, data: number[], width: number, height: number, channels: number) => Promise<void>
    onOpenCvReady: (callback: () => void) => void
  }
  cv: any
}
