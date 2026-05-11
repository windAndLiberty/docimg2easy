/**
 * 批量处理队列管理器
 * 支持串行/并行处理，进度跟踪，错误处理
 */
import type { CvMat } from '../types/opencv'
import { ImageProcessor } from './imageProcessor'
import { AngleCorrector } from './angleCorrector'
import { BorderRemover } from './borderRemover'
import { DocumentCleaner } from './documentCleaner'
import { EdgeCleaner } from './edgeCleaner'

export type ProcessStep = 'rotate180' | 'rotateLeft' | 'rotateRight' | 'skew' | 'crop' | 'autoCorrect' | 'autoRemoveBorder' | 'autoClean' | 'edgeClean'

export interface BatchTask {
  id: string
  imageId: string
  steps: ProcessStep[]
  status: 'pending' | 'processing' | 'done' | 'error'
  error?: string
  resultUrl?: string
}

export interface BatchOptions {
  parallel: boolean
  maxConcurrency: number
  onProgress?: (completed: number, total: number) => void
  onTaskComplete?: (task: BatchTask) => void
  onError?: (task: BatchTask, error: Error) => void
}

export class BatchProcessor {
  private imageProcessor = new ImageProcessor()
  private angleCorrector = new AngleCorrector()
  private borderRemover = new BorderRemover()
  private documentCleaner = new DocumentCleaner()
  private edgeCleaner = new EdgeCleaner()

  private queue: BatchTask[] = []
  private processing = false
  private completed = 0
  private total = 0
  private options: BatchOptions = {
    parallel: false,
    maxConcurrency: 1
  }

  /**
   * 设置处理选项
   */
  setOptions(options: Partial<BatchOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /**
   * 添加任务到队列
   */
  addTask(task: Omit<BatchTask, 'status'>): BatchTask {
    const fullTask: BatchTask = { ...task, status: 'pending' }
    this.queue.push(fullTask)
    return fullTask
  }

  /**
   * 添加多个任务
   */
  addTasks(tasks: Omit<BatchTask, 'status'>[]): BatchTask[] {
    return tasks.map(task => this.addTask(task))
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    this.queue = []
    this.processing = false
    this.completed = 0
    this.total = 0
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): { pending: number; processing: number; done: number; error: number } {
    const pending = this.queue.filter(t => t.status === 'pending').length
    const processing = this.queue.filter(t => t.status === 'processing').length
    const done = this.queue.filter(t => t.status === 'done').length
    const error = this.queue.filter(t => t.status === 'error').length
    return { pending, processing, done, error }
  }

  /**
   * 处理单个步骤
   */
  processStep(src: CvMat, step: ProcessStep, params?: Record<string, unknown>): CvMat {
    switch (step) {
      case 'rotate180':
        return this.imageProcessor.rotate(src, 180)
      case 'rotateLeft':
        return this.imageProcessor.rotate(src, -90)
      case 'rotateRight':
        return this.imageProcessor.rotate(src, 90)
      case 'skew':
        return this.imageProcessor.skew(src, (params?.angle as number) || 0)
      case 'crop':
        return this.imageProcessor.crop(src, (params?.rect as { x: number; y: number; width: number; height: number }) || { x: 0, y: 0, width: src.cols, height: src.rows })
      case 'autoCorrect':
        return this.angleCorrector.correct(src)
      case 'autoRemoveBorder':
        return this.borderRemover.remove(src)
      case 'autoClean':
        return this.documentCleaner.clean(src)
      case 'edgeClean':
        return this.edgeCleaner.clean(src)
      default:
        return src.clone()
    }
  }

  /**
   * 处理队列
   * @param images 图像映射表
   * @param options 处理选项（可选，覆盖默认选项）
   */
  async process(images: Map<string, CvMat>, options?: Partial<BatchOptions>): Promise<Map<string, CvMat>> {
    if (options) {
      this.setOptions(options)
    }
    if (this.options.parallel) {
      return this.processParallel(images)
    }
    return this.processSerial(images)
  }

  /**
   * 并行处理队列
   */
  async processParallel(images: Map<string, CvMat>): Promise<Map<string, CvMat>> {
    const results = new Map<string, CvMat>()
    this.processing = true
    this.completed = 0
    this.total = this.queue.length

    const pendingTasks = this.queue.filter(t => t.status === 'pending')
    const concurrency = this.options.maxConcurrency || 1
    const batches: BatchTask[][] = []

    for (let i = 0; i < pendingTasks.length; i += concurrency) {
      batches.push(pendingTasks.slice(i, i + concurrency))
    }

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (task) => {
          task.status = 'processing'
          try {
            const src = images.get(task.imageId)
            if (!src) {
              throw new Error(`Image not found: ${task.imageId}`)
            }

            let result = src.clone()
            for (const step of task.steps) {
              const processed = this.processStep(result, step)
              if (processed !== result) {
                this.imageProcessor.deleteMat(result)
              }
              result = processed
            }

            results.set(task.imageId, result)
            task.status = 'done'
            this.completed++
            this.options.onProgress?.(this.completed, this.total)
            this.options.onTaskComplete?.(task)
          } catch (error) {
            task.status = 'error'
            task.error = error instanceof Error ? error.message : String(error)
            this.options.onError?.(task, error instanceof Error ? error : new Error(String(error)))
          }
        })
      )
    }

    this.processing = false
    return results
  }

  /**
   * 串行处理队列
   */
  async processSerial(images: Map<string, CvMat>): Promise<Map<string, CvMat>> {
    const results = new Map<string, CvMat>()
    this.processing = true
    this.completed = 0
    this.total = this.queue.length

    for (const task of this.queue) {
      if (task.status !== 'pending') continue
      task.status = 'processing'

      try {
        const src = images.get(task.imageId)
        if (!src) {
          throw new Error(`Image not found: ${task.imageId}`)
        }

        let result = src.clone()
        for (const step of task.steps) {
          const processed = this.processStep(result, step)
          if (processed !== result) {
            this.imageProcessor.deleteMat(result)
          }
          result = processed
        }

        results.set(task.imageId, result)
        task.status = 'done'
        this.completed++
        this.options.onProgress?.(this.completed, this.total)
        this.options.onTaskComplete?.(task)
      } catch (error) {
        task.status = 'error'
        task.error = error instanceof Error ? error.message : String(error)
        this.options.onError?.(task, error instanceof Error ? error : new Error(String(error)))
      }
    }

    this.processing = false
    return results
  }

  /**
   * 是否正在处理
   */
  isProcessing(): boolean {
    return this.processing
  }

  /**
   * 获取进度百分比
   */
  getProgress(): number {
    if (this.total === 0) return 0
    return Math.round((this.completed / this.total) * 100)
  }
}