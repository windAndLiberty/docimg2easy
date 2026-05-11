# 编程范式规范 — img2easy v3.0.0

> 范式判定: 面向对象 (OO) 为主，函数式 (FP) 辅助
> 决策依据: 类继承密度高、OpenCV.js C++ 绑定 OO API、命令式用户交互

---

## 1. 范式边界

### 1.1 面向对象主导区域 (OO)

| 区域 | 理由 | 规则 |
|------|------|------|
| **Services** | OpenCV.js 使用 C++ 类绑定 | 继承 ImageProcessor 基类，使用 class |
| **Store** | Pinia 使用对象/类封装 | defineStore 返回对象，内部方法用 function |
| **Composables** | Vue 组合式 API 惯例 | 返回响应式对象，内部逻辑命令式 |

### 1.2 函数式辅助区域 (FP)

| 区域 | 理由 | 规则 |
|------|------|------|
| **Utils** | 纯工具函数无副作用 | 纯函数优先，输入输出明确 |
| **类型转换** | 数据映射无状态 | 管道操作 (pipe/compose) |
| **测试** | 断言需要纯函数 | 测试用例必须无副作用 |

### 1.3 禁止区域

| 反模式 | 说明 | 替代方案 |
|--------|------|----------|
| 深度继承链 (>2) | 维护困难 | 组合代替继承 |
| 全局可变状态 | 不可预测 | Pinia store 或局部状态 |
| any 类型 | 绕过类型系统 | 显式接口/类型断言 |

---

## 2. 类型系统规范

### 2.1 OpenCV.js 类型定义

```typescript
// types/opencv.d.ts
// 由于 OpenCV.js 无官方 TypeScript 定义，我们自建最小可用类型

export interface CvMat {
  cols: number
  rows: number
  channels(): number
  data: Uint8Array
  clone(): CvMat
  delete(): void
  roi(rect: CvRect): CvMat
  ucharAt(y: number, x: number): number
}

export interface CvRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CvSize {
  width: number
  height: number
}

export interface CvInstance {
  Mat: new (...args: any[]) => CvMat
  MatVector: new () => any
  Point: new (x: number, y: number) => any
  Size: new (w: number, h: number) => CvSize
  Rect: new (x: number, y: number, w: number, h: number) => CvRect
  Scalar: new (...v: number[]) => any
  // ... 其他常用 API
}

// 全局声明
declare global {
  interface Window {
    cv?: CvInstance
  }
}
```

### 2.2 Mat 生命周期类型安全

```typescript
// utils/matLifecycle.ts

export interface SafeMat extends CvMat {
  _disposed: boolean
}

export function safeDelete(mat: CvMat | null): void {
  if (!mat) return
  try {
    if (typeof (mat as any).delete === 'function') {
      (mat as any).delete()
    }
  } catch {
    // 已删除或无效，静默处理
  }
}

export function withMat<T>(factory: () => CvMat, use: (mat: CvMat) => T): T {
  const mat = factory()
  try {
    return use(mat)
  } finally {
    safeDelete(mat)
  }
}
```

---

## 3. 服务层设计模式

### 3.1 模板方法模式 (基类)

```typescript
// services/imageProcessor.ts — 基类定义通用流程

export abstract class ImageProcessor {
  protected get cv(): CvInstance {
    const cv = window.cv
    if (!cv) throw new Error('OpenCV.js 尚未加载')
    return cv
  }

  // 模板方法: 处理流程骨架
  process(src: CvMat): CvMat {
    const prepared = this.prepare(src)
    const result = this.transform(prepared)
    const finalized = this.finalize(result)
    if (prepared !== src) safeDelete(prepared)
    if (result !== prepared) safeDelete(result)
    return finalized
  }

  // 子类必须实现
  protected abstract prepare(src: CvMat): CvMat
  protected abstract transform(src: CvMat): CvMat
  protected abstract finalize(src: CvMat): CvMat
}
```

### 3.2 策略模式 (算法选择)

```typescript
// services/angleCorrector.ts

interface AngleDetectionStrategy {
  detect(mat: CvMat): number
}

class HoughStrategy implements AngleDetectionStrategy { /* ... */ }
class RansacStrategy implements AngleDetectionStrategy { /* ... */ }

export class AngleCorrector extends ImageProcessor {
  strategy: AngleDetectionStrategy = new HoughStrategy()

  setStrategy(s: AngleDetectionStrategy): void {
    this.strategy = s
  }
}
```

---

## 4. Store 设计规范

### 4.1 命令模式 (Undo/Redo)

```typescript
// stores/imageStore.ts — 命令接口

interface ImageCommand {
  readonly type: string
  readonly imageId: string
  readonly timestamp: string
  execute(): void
  undo(): void
}

class RotateCommand implements ImageCommand {
  constructor(
    readonly imageId: string,
    private angle: number,
    private store: ImageStore
  ) {}

  execute(): void {
    // 执行旋转
  }

  undo(): void {
    // 恢复之前的状态
  }
}
```

### 4.2 响应式规则

- 使用 `ref`/`computed` 替代 `reactive` (避免解构丢失响应性)
- 复杂对象使用 `shallowRef` (Mat 不需要深度响应)
- 数组操作使用不可变更新 (避免直接 push)

---

## 5. 编码规范

### 5.1 命名约定

| 类型 | 命名 | 示例 |
|------|------|------|
| 类 | PascalCase | `ImageProcessor` |
| 接口 | PascalCase + 前缀 | `ICvMat`, `IImageItem` |
| 类型别名 | PascalCase | `ProcessStep` |
| 枚举 | PascalCase | `ImageStatus` |
| 函数 | camelCase | `calculateAngle` |
| 常量 | UPPER_SNAKE_CASE | `MAX_EDGE_WIDTH` |
| 组合式函数 | use + PascalCase | `useOpenCV` |
| 私有方法 | _ + camelCase | `_detectEdges` |

### 5.2 文件组织

```
src/
  renderer/
    services/
      imageProcessor.ts      # 基类
      angleCorrector.ts      # 校正
      borderRemover.ts       # 去边
      documentCleaner.ts     # 去污
      edgeCleaner.ts         # 边缘
      batchProcessor.ts      # 批量
      reportExporter.ts      # 导出
      index.ts               # 统一导出
    stores/
      imageStore.ts          # 图像状态
      configStore.ts         # 配置状态 (新增)
    composables/
      useOpenCV.ts           # OpenCV 管理
      useHistoryPanel.ts     # 历史面板
    utils/
      matLifecycle.ts        # Mat 安全操作
      imageFormat.ts         # 格式转换
    types/
      opencv.d.ts            # OpenCV 类型
      index.ts               # 类型导出
    components/
      ImageViewer.vue        # 图像查看器
      Toolbar.vue            # 工具栏
      ThumbnailList.vue      # 缩略图列表
      HistoryPanel.vue       # 历史面板
      ExportModal.vue        # 导出对话框
    App.vue                  # 根组件
    main.ts                  # 入口
```

### 5.3 注释规范

- 所有公共方法必须有 JSDoc
- 复杂算法必须有步骤注释
- 类型断言必须说明原因
- 临时方案标记 `TODO:` 或 `FIXME:`

```typescript
/**
 * 计算图像倾斜角度
 * @param src 输入图像 Mat
 * @returns 检测到的倾斜角度 (度)
 * @throws 如果 OpenCV.js 未加载
 * 
 * 算法步骤:
 * 1. 灰度转换
 * 2. 高斯模糊降噪
 * 3. Canny 边缘检测
 * 4. Hough 直线检测
 * 5. 计算平均角度
 */
calculateAngle(src: CvMat): number {
  // ...
}
```

---

## 6. 错误处理规范

### 6.1 错误类型层级

```typescript
// types/errors.ts

export class ImageProcessingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'ImageProcessingError'
  }
}

export class OpenCVNotReadyError extends ImageProcessingError {
  constructor() {
    super('OpenCV.js 尚未加载完成', 'CV_NOT_READY')
  }
}

export class InvalidImageError extends ImageProcessingError {
  constructor(path: string) {
    super(`无法加载图像: ${path}`, 'INVALID_IMAGE')
  }
}
```

### 6.2 处理策略

| 场景 | 策略 | 用户反馈 |
|------|------|----------|
| OpenCV 未加载 | 阻塞操作，显示加载中 | "图像引擎初始化中..." |
| 图像加载失败 | 跳过该图像，记录错误 | "部分图像加载失败" |
| 处理算法失败 | 返回原图，记录日志 | 静默处理，控制台报错 |
| 内存不足 | 分批处理，释放 Mat | "正在优化内存使用" |

---

*文档版本: 3.0.0*
*最后更新: 2026-05-11*
*范式判定引擎: HEOP v3 infer_paradigm*
