# 架构图集 — img2easy v3.0.0 (开源版)

> 基于 Mermaid 的系统架构描述

---

## 1. 系统架构图

```mermaid
graph TB
    subgraph Electron["Electron 桌面应用"]
        subgraph Main["主进程 (Node.js)"]
            IPC[IPC 通信层]
            FS[文件系统 API]
            DIALOG[对话框 API]
            CONFIG[配置持久化]
        end

        subgraph Preload["预加载脚本"]
            BRIDGE[安全桥接层]
        end

        subgraph Renderer["渲染进程 (Vue 3)"]
            subgraph UI["UI 层"]
                APP[App.vue]
                TOOLBAR[工具栏]
                CANVAS[图像画布]
                THUMB[缩略图列表]
                MODAL[模态对话框]
            end

            subgraph Store["状态层 (Pinia)"]
                IMG_STORE[imageStore]
                CONFIG_STORE[configStore]
            end

            subgraph Composables["组合式函数"]
                USE_CV[useOpenCV]
                USE_HIST[useHistoryPanel]
            end

            subgraph Services["服务层"]
                IMG_PROC[ImageProcessor]
                ANGLE[AngleCorrector]
                BORDER[BorderRemover]
                CLEAN[DocumentCleaner]
                EDGE[EdgeCleaner]
                BATCH[BatchProcessor]
                EXPORT[ReportExporter]
            end

            subgraph Utils["工具层"]
                MAT_UTILS[MatLifecycle]
                CV_TYPES[OpenCV Types]
            end
        end
    end

    subgraph External["外部依赖"]
        OPENCV[OpenCV.js WASM]
        JSPDF[jsPDF]
        XLSX[SheetJS]
    end

    UI --> Store
    Store --> Services
    Services --> Utils
    Utils --> OPENCV
    Services --> EXPORT
    EXPORT --> JSPDF
    EXPORT --> XLSX
    Preload --> BRIDGE
    BRIDGE --> IPC
    IPC --> FS
    IPC --> DIALOG
    IPC --> CONFIG
    Store --> Composables
```

---

## 2. 模块依赖图

```mermaid
graph LR
    subgraph Core["核心层"]
        TYPES[types/opencv.d.ts]
        MAT[utils/matLifecycle.ts]
        PROC[services/imageProcessor.ts]
    end

    subgraph Algorithms["算法层"]
        ANGLE[services/angleCorrector.ts]
        BORDER[services/borderRemover.ts]
        CLEAN[services/documentCleaner.ts]
        EDGE[services/edgeCleaner.ts]
    end

    subgraph Orchestration["编排层"]
        BATCH[services/batchProcessor.ts]
        EXPORT[services/reportExporter.ts]
    end

    subgraph State["状态层"]
        STORE[stores/imageStore.ts]
    end

    subgraph View["视图层"]
        COMP[components/*.vue]
        APP[App.vue]
    end

    TYPES --> MAT
    TYPES --> PROC
    MAT --> PROC
    PROC --> ANGLE
    PROC --> BORDER
    PROC --> CLEAN
    PROC --> EDGE
    ANGLE --> BATCH
    BORDER --> BATCH
    CLEAN --> BATCH
    EDGE --> BATCH
    BATCH --> EXPORT
    PROC --> STORE
    ANGLE --> STORE
    BORDER --> STORE
    CLEAN --> STORE
    EDGE --> STORE
    BATCH --> STORE
    EXPORT --> STORE
    STORE --> COMP
    COMP --> APP
```

---

## 3. 图像处理数据流

```mermaid
sequenceDiagram
    actor User
    participant UI as UI 组件
    participant Store as imageStore
    participant Svc as 处理服务
    participant CV as OpenCV.js
    participant Canvas as HTML Canvas

    User->>UI: 点击"自动校正"
    UI->>Store: autoCorrect()
    Store->>Store: saveHistory()
    Store->>Store: ensureMat()
    Store->>CV: imread(canvas)
    CV-->>Store: Mat
    Store->>Svc: angleCorrector.correct(mat)
    Svc->>CV: 灰度→模糊→Canny→Hough
    CV-->>Svc: 检测角度
    Svc->>CV: warpAffine(旋转)
    CV-->>Svc: 校正后 Mat
    Svc-->>Store: 返回 Mat
    Store->>Canvas: matToDataUrl(mat)
    Canvas-->>Store: dataURL
    Store->>Store: updateCurrentMat()
    Store->>Store: addProcessingRecord()
    Store-->>UI: 响应式更新
    UI->>Canvas: 显示处理后的图像
```

---

## 4. 撤销/重做状态机

```mermaid
stateDiagram-v2
    [*] --> Idle: 应用启动
    Idle --> Processing: 用户执行操作
    Processing --> HistorySaved: saveHistory()
    HistorySaved --> Processing: 执行变换
    Processing --> Done: updateCurrentMat()
    Done --> Idle: 等待下一次操作
    Done --> Undoing: undo()
    Undoing --> Done: 恢复到历史状态
    Undoing --> Redoing: redo()
    Redoing --> Done: 前进到未来状态
    Done --> HistoryCleared: 新操作覆盖 redo 栈
    HistoryCleared --> Processing: saveHistory() + 新操作
```

---

## 5. 批量处理时序

```mermaid
sequenceDiagram
    participant UI as App.vue
    participant Store as imageStore
    participant Batch as BatchProcessor
    participant Workers as 并行 Workers
    participant Svc as 处理服务

    UI->>Store: 获取 currentMats
    UI->>Batch: process(mats, tasks, options)
    Batch->>Batch: runParallel()

    par Worker 1
        Batch->>Svc: executeTask(task1)
        Svc->>Svc: autoCorrect
        Svc->>Svc: autoRemoveBorder
        Svc-->>Batch: resultUrl1
    and Worker 2
        Batch->>Svc: executeTask(task2)
        Svc->>Svc: autoCorrect
        Svc->>Svc: autoRemoveBorder
        Svc-->>Batch: resultUrl2
    end

    Batch-->>UI: onProgress(completed, total)
    Batch-->>UI: 返回所有任务结果
    UI->>Store: 更新 imageList 状态
```

---

## 6. 构建流程图

```mermaid
graph LR
    A[源码 TypeScript/Vue] --> B[electron-vite build]
    B --> C[编译为 JS/CSS]
    C --> D[electron-builder]
    D --> E[Linux AppImage/deb]
    D --> F[Windows NSIS]
    D --> G[macOS DMG]

    H[OpenCV.js WASM] --> I[public/lib/opencv]
    I --> D

    J[单元测试 Vitest] --> K[测试通过?]
    K -->|是| D
    K -->|否| L[修复代码]
    L --> J
```

---

## 7. 开源化改造范围

```mermaid
graph LR
    subgraph Before["v2.x 商业版"]
        LIC[LicenseManager]
        TRIAL[试用限制]
        PRICE[定价弹窗]
        BATCH_L[批量处理限制]
        EXPORT_L[导出限制]
    end

    subgraph After["v3.0.0 开源版"]
        FREE[全部功能免费]
        SAVE[图像保存功能]
        CONFIG[配置持久化]
        THUMB[缩略图生成]
        CROP[框选裁剪]
        SKEW[倾斜应用]
    end

    LIC -->|移除| FREE
    TRIAL -->|移除| FREE
    PRICE -->|移除| FREE
    BATCH_L -->|移除| FREE
    EXPORT_L -->|移除| FREE
    FREE -->|新增| SAVE
    FREE -->|新增| CONFIG
    FREE -->|新增| THUMB
    FREE -->|新增| CROP
    FREE -->|新增| SKEW
```

---

*文档版本: 3.0.0*
*最后更新: 2026-05-11*
