/**
 * 批量处理队列管理器
 * 支持串行/并行处理，进度跟踪，错误处理
 */
import { ImageProcessor, AngleCorrector, BorderRemover, DocumentCleaner, EdgeCleaner } from './'

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
  private running = false
  private aborted = false

  async process(
    mats: Map<string, { mat: any; url: string }>,
    tasks: BatchTask[],
    options: BatchOptions
  ): Promise<BatchTask[]> {
    this.queue = [...tasks]
    this.running = true
    this.aborted = false

    if (options.parallel) {
      await this.runParallel(mats, options)
    } else {
      await this.runSerial(mats, options)
    }

    this.running = false
    return this.queue
  }

  private async runSerial(
    mats: Map<string, { mat: any; url: string }>,
    options: BatchOptions
  ): Promise<void> {
    for (let i = 0; i < this.queue.length; i++) {
      if (this.aborted) break
      const task = this.queue[i]
      try {
        await this.executeTask(task, mats)
        options.onProgress?.(i + 1, this.queue.length)
      } catch (err) {
        task.status = 'error'
        task.error = err instanceof Error ? err.message : String(err)
        options.onError?.(task, err as Error)
      }
    }
  }

  private async runParallel(
    mats: Map<string, { mat: any; url: string }>,
    options: BatchOptions
  ): Promise<void> {
    const concurrency = options.maxConcurrency || 2
    let index = 0
    let completed = 0

    const worker = async () => {
      while (index < this.queue.length && !this.aborted) {
        const i = index++
        const task = this.queue[i]
        try {
          await this.executeTask(task, mats)
          completed++
          options.onProgress?.(completed, this.queue.length)
        } catch (err) {
          task.status = 'error'
          task.error = err instanceof Error ? err.message : String(err)
          options.onError?.(task, err as Error)
        }
      }
    }

    const workers: Promise<void>[] = []
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker())
    }
    await Promise.all(workers)
  }

  private async executeTask(
    task: BatchTask,
    mats: Map<string, { mat: any; url: string }>
  ): Promise<void> {
    task.status = 'processing'
    const state = mats.get(task.imageId)
    if (!state) {
      throw new Error(`Image ${task.imageId} not found`)
    }

    let currentMat = state.mat.clone()

    for (const step of task.steps) {
      if (this.aborted) break
      currentMat = await this.applyStep(step, currentMat, task)
    }

    // Convert result to URL
    const canvas = document.createElement('canvas')
    canvas.width = currentMat.cols
    canvas.height = currentMat.rows
    const cv = (window as any).cv
    cv.imshow(canvas, currentMat)
    task.resultUrl = canvas.toDataURL('image/png')
    task.status = 'done'

    // Update the mat in the map
    state.mat.delete()
    state.mat = currentMat
  }

  private async applyStep(step: ProcessStep, mat: any, _task: BatchTask): Promise<any> {
    switch (step) {
      case 'rotate180':
        return this.imageProcessor.rotate(mat, 180)
      case 'rotateLeft':
        return this.imageProcessor.rotate(mat, -90)
      case 'rotateRight':
        return this.imageProcessor.rotate(mat, 90)
      case 'skew': {
        // Skew angle should be passed via task options or store
        // Default to 0 for batch (user should set in preview first)
        return this.imageProcessor.skew(mat, 0)
      }
      case 'crop': {
        // Default center crop for batch
        const rect = {
          x: Math.round(mat.cols * 0.05),
          y: Math.round(mat.rows * 0.05),
          width: Math.round(mat.cols * 0.9),
          height: Math.round(mat.rows * 0.9)
        }
        return this.imageProcessor.crop(mat, rect)
      }
      case 'autoCorrect':
        return this.angleCorrector.correct(mat)
      case 'autoRemoveBorder':
        return this.borderRemover.removeBorder(mat)
      case 'autoClean':
        return this.documentCleaner.clean(mat)
      case 'edgeClean':
        return this.edgeCleaner.clean(mat)
      default:
        return mat.clone()
    }
  }

  abort(): void {
    this.aborted = true
  }

  isRunning(): boolean {
    return this.running
  }
}
