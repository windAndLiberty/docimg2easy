/**
 * 报告导出服务
 * 支持 PDF 和 Excel 导出
 */
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'

export interface ExportImage {
  id: string
  name: string
  path: string
  processedUrl?: string
  status: string
}

export interface ExportOptions {
  title?: string
  author?: string
  includeThumbnails?: boolean
  pageSize?: 'a4' | 'letter'
  orientation?: 'portrait' | 'landscape'
}

export class ReportExporter {
  /**
   * 导出为 PDF
   */
  async exportPDF(images: ExportImage[], options: ExportOptions = {}): Promise<Uint8Array> {
    const {
      title = 'img2easy 处理报告',
      author = 'img2easy Pro',
      includeThumbnails = true,
      pageSize = 'a4',
      orientation = 'portrait'
    } = options

    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: pageSize
    })

    // Title page
    doc.setFontSize(20)
    doc.text(title, 20, 30)
    doc.setFontSize(12)
    doc.text(`生成时间: ${new Date().toLocaleString('zh-CN')}`, 20, 45)
    doc.text(`作者: ${author}`, 20, 55)
    doc.text(`共处理 ${images.length} 张图片`, 20, 65)

    // Summary table
    const done = images.filter(i => i.status === 'done').length
    const pending = images.filter(i => i.status === 'pending').length
    const error = images.filter(i => i.status === 'error').length

    doc.setFontSize(14)
    doc.text('处理摘要', 20, 80)
    doc.setFontSize(10)
    doc.text(`已完成: ${done}`, 20, 90)
    doc.text(`待处理: ${pending}`, 20, 97)
    doc.text(`失败: ${error}`, 20, 104)

    // Per-image pages
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      doc.addPage()

      doc.setFontSize(14)
      doc.text(`#${i + 1} ${img.name}`, 20, 25)
      doc.setFontSize(10)
      doc.text(`路径: ${img.path}`, 20, 35)
      doc.text(`状态: ${this.statusText(img.status)}`, 20, 42)

      if (includeThumbnails && img.processedUrl) {
        try {
          const dataUrl = img.processedUrl
          const imgWidth = 170
          const imgHeight = 100
          doc.addImage(dataUrl, 'PNG', 20, 55, imgWidth, imgHeight)
        } catch (e) {
          doc.text('(缩略图加载失败)', 20, 55)
        }
      }
    }

    return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
  }

  /**
   * 导出为 Excel
   */
  exportExcel(images: ExportImage[], options: ExportOptions = {}): Uint8Array {
    const { title = 'img2easy 处理报告' } = options
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void title

    const rows = images.map((img, idx) => ({
      序号: idx + 1,
      文件名: img.name,
      路径: img.path,
      状态: this.statusText(img.status),
      处理时间: img.status === 'done' ? new Date().toLocaleString('zh-CN') : '-'
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '处理记录')

    // Auto-width
    const colWidths = [
      { wch: 6 },
      { wch: 30 },
      { wch: 50 },
      { wch: 10 },
      { wch: 20 }
    ]
    ws['!cols'] = colWidths

    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
  }

  private statusText(status: string): string {
    const map: Record<string, string> = {
      pending: '待处理',
      processing: '处理中',
      done: '已完成',
      error: '失败'
    }
    return map[status] || status
  }
}
