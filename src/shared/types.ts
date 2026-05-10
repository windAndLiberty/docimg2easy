import { BrowserWindow } from 'electron'

/**
 * IPC channel names for type-safe communication
 */
export const IPC_CHANNELS = {
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  DIALOG_OPEN_FILE: 'dialog:openFile',
  IMAGE_PROCESS: 'image:process',
  IMAGE_EXPORT: 'image:export',
  IMAGE_BATCH_EXPORT: 'image:batchExport',
  LICENSE_VERIFY: 'license:verify',
  LICENSE_STATUS: 'license:status',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install'
} as const

/**
 * Image processing operation types
 */
export type ImageOperation =
  | 'rotate'
  | 'skew'
  | 'crop'
  | 'autoCorrect'
  | 'removeBorder'
  | 'clean'
  | 'deskew'

/**
 * Export format options
 */
export type ExportFormat = 'png' | 'jpeg' | 'tiff' | 'webp' | 'pdf'

/**
 * Processing parameters for each operation
 */
export interface ProcessParams {
  rotate?: { angle: number }
  skew?: { angle: number }
  crop?: { x: number; y: number; width: number; height: number }
  autoCorrect?: { mode: 'document' | 'photo' }
  removeBorder?: { threshold?: number }
  clean?: { strength?: number }
  deskew?: {}
}

/**
 * License info structure
 */
export interface LicenseInfo {
  key: string
  type: 'trial' | 'standard' | 'pro'
  expiryDate: string
  activatedAt: string
  features: string[]
}

/**
 * App settings structure
 */
export interface AppSettings {
  exportFormat: ExportFormat
  exportQuality: number
  autoSave: boolean
  language: 'zh' | 'en'
  theme: 'light' | 'dark' | 'system'
}
