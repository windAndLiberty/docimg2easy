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
    onOpenCvReady: (callback: () => void) => void
  }
}
