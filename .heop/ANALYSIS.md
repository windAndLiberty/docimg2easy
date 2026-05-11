# img2easy Pro — 逆向思维分析笔记

## 1. 逆向目标定义

**正向目标**: 完善所有功能，成为开源免费文档图像处理工具。
**逆向约束**: 移除所有商业收费逻辑，保证核心功能稳定可用，代码可维护。

## 2. 现有代码缺陷识别 (从外向内)

### 2.1 商业收费残留 (必须移除)
| 位置 | 问题 | 严重程度 |
|------|------|----------|
| `README.md` | 提及"试用版7天"、"标准版¥199"、密钥格式 | 🔴 高 |
| `App.vue` | LicenseManager 弹窗、定价方案展示、功能限制检查 | 🔴 高 |
| `licenseManager.ts` | 整套许可证验证体系 (本地+在线) | 🔴 高 |
| `batchProcessor.ts` | 被 license 限制调用 | 🟡 中 |
| `reportExporter.ts` | 被 license 限制调用 | 🟡 中 |
| `package.json` | `productName: "img2easy Pro"` 带 Pro 商业暗示 | 🟡 中 |

### 2.2 功能缺失/未完成
| 功能 | 状态 | 位置 |
|------|------|------|
| 框选裁剪 (selectRegion) | TODO 空实现 | `imageStore.ts:401` |
| 倾斜应用 (skewLeft/skewRight 只改数值) | 无实际图像变换 | `imageStore.ts:307-313` |
| 缩略图生成 | 空字符串 | `imageStore.ts:191` |
| OpenCV 加载事件 | 主进程未触发 'opencv-ready' IPC | `main/index.ts` |
| 导出报告下载 | 使用 Blob/URL 在 Electron 中可能失效 | `App.vue:136-143` |
| 处理历史对比图 | beforeUrl/afterUrl 可能为空 | `useHistoryPanel.ts` |

### 2.3 类型安全与代码质量问题
| 问题 | 位置 | 影响 |
|------|------|------|
| `any` 类型泛滥 (cv.Mat) | 所有 services | 无法类型检查 |
| `as unknown as ArrayBuffer` | `App.vue:136` | 运行时风险 |
| `window as any` | 多处 | 绕过类型系统 |
| `currentMats as any` | `App.vue:88` | 批量处理传参 |
| 缺少错误边界处理 | `ensureMat()` | 图像加载失败静默 |
| Mat 内存泄漏风险 | `imageStore.ts` | 未统一释放 |

### 2.4 架构问题
| 问题 | 说明 |
|------|------|
| 服务层与 store 耦合 | `imageStore` 直接实例化所有 services |
| 没有真正的命令模式 | undo/redo 是 Mat 快照，不是操作命令 |
| 缺少图像保存功能 | 处理后的图像无法导出到文件 |
| 主进程 IPC 不足 | 只有 openDirectory/openFile/scanFolder |
| 没有配置文件持久化 | 用户设置无法保存 |

## 3. 编程范式推断

### 信号扫描
| 信号 | 密度 | 说明 |
|------|------|------|
| `class` 定义 | 高 | ImageProcessor, AngleCorrector... 继承体系 |
| `extends` 继承 | 高 | 服务层使用类继承 |
| `new` 实例化 | 高 | 各处 new Service() |
| `this` 绑定 | 高 | 方法内大量使用 this |
| 纯函数 | 低 | 大部分方法有副作用 (Mat 修改) |
| 不可变性 | 低 | Mat 是可变对象 |
| 高阶函数 | 低 | 少量 Array.map/filter |

### 范式判定: **面向对象 (OO) 为主，命令模式意图**

**理由**:
- 图像处理服务使用类继承体系 (ImageProcessor 基类 → 具体处理器)
- Pinia store 使用 Composition API 但内部是命令式操作
- undo/redo 试图使用命令模式但未完整实现
- OpenCV.js 本身是 C++ 绑定的 OO API

**建议**: 保持 OO 架构，但引入函数式隔离层:
1. 图像处理管道用纯函数组合
2. Mat 生命周期用 RAII 包装
3. Store 操作保持命令式 (用户交互天然命令式)

## 4. 自底向上构建优先级

基于叶子模块优先原则:

```
1. types/opencv.d.ts      — OpenCV 类型定义 (最底层，零依赖)
2. utils/matLifecycle.ts  — Mat 安全包装/RAII
3. services/imageProcessor.ts — 基础操作 (依赖 types + utils)
4. services/angleCorrector.ts — 校正 (依赖 imageProcessor)
5. services/borderRemover.ts  — 去边 (依赖 imageProcessor)
6. services/documentCleaner.ts — 去污 (依赖 imageProcessor)
7. services/edgeCleaner.ts — 边缘清理 (依赖 imageProcessor)
8. services/batchProcessor.ts — 批量 (依赖 3-7)
9. services/reportExporter.ts — 导出 (依赖 batch)
10. stores/imageStore.ts — 状态 (依赖 3-9)
11. components/ — UI 组件 (依赖 store)
12. App.vue — 根组件 (依赖所有)
```

## 5. 测试策略

### 单元测试 (Vitest)
- 所有 services 的纯逻辑方法
- Mat 生命周期管理
- Store 状态变化
- 导出格式验证

### 集成测试
- OpenCV.js 加载流程
- IPC 通信
- 图像处理管道端到端

### 需要模拟的依赖
- `window.cv` (OpenCV.js)
- `window.api` (Electron IPC)
- Canvas API

## 6. 开源化改造清单

### 必须移除
- [ ] LicenseManager 类及所有引用
- [ ] 许可证弹窗 UI
- [ ] 定价方案展示
- [ ] 功能限制检查 (`hasFeature`)
- [ ] README 中的收费描述

### 必须添加
- [ ] 图像保存/导出到文件功能
- [ ] 缩略图生成
- [ ] 框选裁剪完整实现
- [ ] 倾斜变换实际应用
- [ ] 配置持久化
- [ ] 完善的错误处理

### 必须改进
- [ ] OpenCV 类型定义
- [ ] Mat 内存管理
- [ ] 错误边界
- [ ] 代码注释 (中英文)
