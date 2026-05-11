# 测试规格书 — img2easy

> 状态: DRAFT (待 LOCK)
> 版本: v3.0.0-open-source
> 目标: 移除商业逻辑，完善核心功能，保证开源版本稳定可用

---

## 1. 测试策略总览

### 测试金字塔

```
       /\
      /  \     E2E (Playwright) — 图像处理端到端流程
     /____\
    /      \   集成测试 — OpenCV.js + Store + Services 协作
   /________\
  /          \  单元测试 (Vitest) — 纯逻辑、算法、状态变化
 /____________\
```

### 测试文件命名
- 单元测试: `{module}.test.ts` (同目录)
- 集成测试: `{feature}.integration.test.ts` (`tests/integration/`)
- E2E 测试: `{flow}.spec.ts` (`tests/e2e/`)

---

## 2. 模块测试规格

### M1: OpenCV 类型定义与工具层

#### M1.1 Mat 生命周期管理
```
Given: OpenCV.js 已加载
When: 创建 Mat 并调用 safeDelete()
Then: Mat.delete() 被调用且不会二次崩溃

Given: 一个已删除的 Mat
When: 再次调用 safeDelete()
Then: 静默返回，不抛出异常

Given: 高频率创建/删除 Mat (1000次循环)
When: 运行内存压力测试
Then: 内存使用稳定在基线 ±10% 内
```

#### M1.2 OpenCV 类型安全包装
```
Given: window.cv 未定义
When: 调用 getCv()
Then: 抛出明确错误 "OpenCV.js 尚未加载"

Given: window.cv 已定义且包含 Mat
When: 调用 getCv()
Then: 返回类型安全的 CvInstance 对象
```

### M2: ImageProcessor (基础图像处理)

#### M2.1 旋转
```
Given: 600x800 的 RGB Mat
When: rotate(mat, 90)
Then: 返回 800x600 的 Mat

Given: 任意 Mat
When: rotate(mat, 180) 两次
Then: 结果与原始 Mat 数据一致 (像素级)

Given: 空 Mat (rows=0)
When: rotate(mat, 90)
Then: 返回新的空 Mat，不崩溃
```

#### M2.2 裁剪
```
Given: 1000x1000 Mat, rect {x:100, y:100, w:800, h:800}
When: crop(mat, rect)
Then: 返回 800x800 Mat

Given: rect 超出边界 {x:900, y:900, w:200, h:200}
When: crop(mat, rect)
Then: 安全裁剪为 100x100，不崩溃

Given: 无效 rect {x:0, y:0, w:0, h:0}
When: crop(mat, rect)
Then: 返回原图 clone，并 console.warn
```

#### M2.3 倾斜
```
Given: 1000x1000 Mat, angle=5
When: skew(mat, 5)
Then: 返回有效 Mat，宽度 > 1000

Given: angle=0
When: skew(mat, 0)
Then: 返回近似原图 (允许亚像素差异)

Given: angle=50 (超出安全范围)
When: skew(mat, 50)
Then: 返回原图 clone，不崩溃
```

#### M2.4 灰度/二值化
```
Given: 3通道 RGB Mat
When: toGray(mat)
Then: 返回单通道 Mat

Given: 4通道 RGBA Mat
When: toGray(mat)
Then: 返回单通道 Mat (先转 RGB)

Given: 单通道 Mat
When: toGray(mat)
Then: 返回 clone

Given: 灰度 Mat, threshold=127
When: binarize(mat, 127)
Then: 像素值只有 0 或 255
```

### M3: AngleCorrector (自动校正)

#### M3.1 角度检测
```
Given: 倾斜 3° 的文档图像 Mat
When: calculateAngle(mat)
Then: 返回值在 [2.5, 3.5] 范围内

Given: 完全水平的文档图像
When: calculateAngle(mat)
Then: 返回 0 (或 |angle| < 0.1)

Given: 无文本的空白图像
When: calculateAngle(mat)
Then: 返回 0，不崩溃
```

#### M3.2 校正应用
```
Given: 倾斜 5° 的图像
When: correct(mat)
Then: 输出图像的主要文本行水平

Given: |angle| < 0.1 的图像
When: correct(mat)
Then: 返回原图 clone (避免无意义变换)
```

### M4: BorderRemover (黑边消除)

#### M4.1 黑边检测
```
Given: 四边有 20px 黑色边框的图像
When: removeBorder(mat)
Then: 黑色边框被白色填充

Given: 无黑边的干净文档图像
When: removeBorder(mat)
Then: 返回原图 clone，无修改

Given: 右侧有时标标记的图像
When: removeBorder(mat) with preserveTimingMarks=true
Then: 时标标记保留，其他黑边消除
```

### M5: DocumentCleaner (污渍清理)

#### M5.1 污渍检测
```
Given: 有多个小黑点污渍的文档图像
When: detectStains(mat)
Then: 返回 stains 数组，length > 0

Given: 干净无污渍的文档图像
When: detectStains(mat)
Then: 返回空数组

Given: 有标点符号的文本图像
When: detectStains(mat)
Then: 标点符号不被误判为污渍
```

#### M5.2 污渍修复
```
Given: 检测到污渍的图像
When: clean(mat)
Then: 污渍区域被修复，周围文本连续

Given: 无污渍图像
When: clean(mat)
Then: 返回原图 clone
```

### M6: EdgeCleaner (边缘裁剪)

#### M6.1 边缘检测
```
Given: 上下有灰色边缘的图像
When: detectEdges(mat)
Then: top/bottom > 0, left/right ≈ 0

Given: 干净无边缘的图像
When: detectEdges(mat)
Then: 所有边返回 0
```

#### M6.2 裁剪应用
```
Given: 检测到有边缘的图像
When: clean(mat)
Then: 返回的 Mat 尺寸小于原图

Given: 无边缘图像
When: clean(mat)
Then: 返回原图 clone
```

### M7: BatchProcessor (批量处理)

#### M7.1 串行处理
```
Given: 3 张图像, steps=['autoCorrect']
When: process(..., parallel=false)
Then: 3 张全部 status='done', 按顺序完成
```

#### M7.2 并行处理
```
Given: 4 张图像, maxConcurrency=2
When: process(..., parallel=true)
Then: 4 张全部完成，且最多 2 张同时 processing
```

#### M7.3 中断处理
```
Given: 批量处理运行中
When: abort() 被调用
Then: 后续任务不执行，已完成的保留结果
```

#### M7.4 错误处理
```
Given: 包含 1 张无效图像的批次
When: process(...)
Then: 有效图像完成，无效图像 status='error'，整体不崩溃
```

### M8: ReportExporter (报告导出)

#### M8.1 PDF 导出
```
Given: 2 张已处理图像数据
When: exportPDF(images, {title: '测试报告'})
Then: 返回 Uint8Array, length > 0
And: 内容以 %PDF 开头
```

#### M8.2 Excel 导出
```
Given: 2 张图像数据
When: exportExcel(images)
Then: 返回 Uint8Array, length > 0
And: 内容以 PK 开头 (ZIP/XLSX 格式)
```

### M9: ImageStore (Pinia 状态)

#### M9.1 图像列表管理
```
Given: 空 store
When: addImages([img1, img2])
Then: imageList.length === 2, currentImageId === img1.id

Given: 有 2 张图像的 store
When: removeImage(img1.id)
Then: imageList.length === 1, currentImageId === img2.id

Given: 移除最后一张图像
When: removeImage(lastId)
Then: imageList 为空, currentImageId === null
```

#### M9.2 Undo/Redo
```
Given: 执行 saveHistory() → rotate180() → saveHistory()
When: undo()
Then: 恢复到 rotate180 之前的状态

Given: 执行 undo()
When: redo()
Then: 恢复到 rotate180 之后的状态

Given: 执行新操作 (覆盖 redo 栈)
When: 在 undo 后执行 saveHistory() + 新操作
Then: redoStack 被清空
```

#### M9.3 处理历史记录
```
Given: 执行 autoCorrect()
When: 查看 processingHistory
Then: 包含一条 operation='autoCorrect' 的记录

Given: 执行 clearProcessingHistory()
When: 查看 processingHistory
Then: 为空数组
```

### M10: License 移除验证

#### M10.1 功能无限制
```
Given: 无许可证状态
When: 调用 batchProcessor.process()
Then: 正常执行，不被拦截

Given: 无许可证状态
When: 调用 exportReport()
Then: 正常执行，不被拦截
```

#### M10.2 代码清理
```
Given: 搜索 'license' | 'LicenseManager' | 'trial' | 'activate'
When: 扫描 src/ 目录
Then: 无匹配结果 (除 MIT License 声明)
```

---

## 3. 集成测试规格

### I1: OpenCV.js 加载 → 图像处理管道
```
Given: 应用启动
When: OpenCV.js 加载完成事件触发
Then: useOpenCV().ready === true
And: 可以成功创建 Mat 并执行 toGray()
```

### I2: IPC → Store → 图像显示
```
Given: 用户点击"导入文件夹"
When: IPC 返回图像路径列表
Then: imageStore.imageList 被填充
And: 第一张图像自动加载 Mat 到 currentMats
And: processedCanvas 显示图像
```

### I3: 处理管道端到端
```
Given: 已加载的文档图像
When: 依次执行 autoCorrect → autoRemoveBorder → autoClean
Then: 每张处理后的图像显示在画布上
And: undo() 可以逐步回退每一步
And: processingHistory 记录 3 条操作
```

---

## 4. E2E 测试规格 (Playwright)

### E1: 完整处理流程
```
Given: 应用已启动
When:
  1. 点击"导入文件夹"
  2. 选择包含 3 张文档图片的文件夹
  3. 点击第一张图片
  4. 点击"自动校正"
  5. 点击"自动去黑边"
  6. 点击"自动去污"
  7. 点击"导出报告"
Then:
  - 左侧图片列表显示 3 张缩略图
  - 中央画布显示处理后的图像
  - 导出对话框弹出或文件被下载
```

### E2: Undo/Redo 交互
```
Given: 已选择图片并执行了 2 次操作
When: 点击"撤销" 2 次
Then: 图像恢复到原始状态
When: 点击"重做" 1 次
Then: 图像显示第一次操作后的结果
```

---

## 5. 测试数据

### 测试图像集
| 图像 | 用途 | 特征 |
|------|------|------|
| `test-doc-clean.jpg` | 基础测试 | 干净文档，无倾斜 |
| `test-doc-skewed.jpg` | 校正测试 | 倾斜 5° 的文档 |
| `test-doc-border.jpg` | 去边测试 | 四边有黑色边框 |
| `test-doc-stains.jpg` | 去污测试 | 有多个小黑点污渍 |
| `test-doc-edge.jpg` | 边缘测试 | 上下有灰色边缘 |
| `test-blank.jpg` | 边界测试 | 空白图像 |
| `test-large.jpg` | 性能测试 | 4000x3000 高分辨率 |

### Mock 数据
```typescript
// 用于单元测试的 Mock Mat
const createMockMat = (w: number, h: number, channels: number = 3) => ({
  cols: w, rows: h, channels: () => channels,
  data: new Uint8Array(w * h * channels),
  clone: function() { return { ...this, data: new Uint8Array(this.data) } },
  delete: function() {},
  // ... 其他需要的方法
})
```

---

## 6. 测试覆盖率目标

| 模块 | 目标覆盖率 | 说明 |
|------|-----------|------|
| services/*.ts | ≥ 80% | 核心算法必须全覆盖 |
| stores/*.ts | ≥ 70% | 状态变化逻辑 |
| composables/*.ts | ≥ 60% | 组合式函数 |
| utils/*.ts | ≥ 90% | 工具函数 |
| components/*.vue | ≥ 50% | UI 组件 (E2E 补充) |

---

## 7. LOCK 条件

本 TEST_SPEC.md 可在以下条件满足后 LOCK:

1. [ ] 所有 Given-When-Then 场景覆盖现有功能 + 新增功能
2. [ ] Mock 策略可执行 (OpenCV.js 可模拟)
3. [ ] 测试图像集已准备或已定义生成方式
4. [ ] 用户审阅通过 (确认功能范围)

---

*文档版本: 3.0.0-draft-1*
*最后更新: 2026-05-11*
