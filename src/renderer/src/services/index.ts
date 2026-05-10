/**
 * 图像处理服务统一导出
 */
export { ImageProcessor } from './imageProcessor'
export { AngleCorrector } from './angleCorrector'
export { BorderRemover } from './borderRemover'
export { DocumentCleaner } from './documentCleaner'
export { EdgeCleaner } from './edgeCleaner'
export { BatchProcessor, type BatchTask, type ProcessStep, type BatchOptions } from './batchProcessor'
export { ReportExporter, type ExportImage, type ExportOptions } from './reportExporter'
export { LicenseManager, type LicenseInfo } from './licenseManager'
