# 项目计划: img2easy Pro

## 项目概述
将实验性质的纯前端文档图像处理工具(img2easy)重构为商业级桌面应用。

## 技术栈
- 语言: TypeScript
- 前端框架: Vanilla JS → Vue 3 (Composition API)
- 桌面框架: Electron + Vite
- 图像处理: OpenCV.js + 可选 WASM 加速
- 构建工具: Vite
- 打包: electron-builder
- 状态管理: Pinia
- UI组件: Element Plus / Naive UI

## 模块依赖图
```
auth/license → core/image-processing → ui/viewer
                        ↓
            batch-processing → export/report
                        ↓
            history/undo → settings/preferences
```

## 模块状态
| 模块 | 状态 | 依赖 | 引擎 | 测试覆盖 | 迭代次数 |
|------|------|------|------|----------|----------|
| project-setup | DONE | - | manual | - | 1 |
| opencv-integration | DONE | project-setup | claude | 60% | 1 |
| image-viewer-v1 | DONE | opencv-integration | claude | 50% | 1 |
| batch-processing-v1 | DONE | image-viewer-v1 | claude | 40% | 1 |
| export-report-v1 | DONE | batch-processing-v1 | claude | 30% | 1 |
| history-undo-v1 | DONE | image-viewer-v1 | claude | 40% | 1 |
| license-system | REMOVED | - | - | 0% | 0 |
| remove-license | PENDING | - | claude | 0% | 0 |
| add-save-image | PENDING | export-report-v1 | claude | 0% | 0 |
| add-thumbnail-gen | PENDING | image-viewer-v1 | claude | 0% | 0 |
| add-region-crop | PENDING | image-viewer-v1 | claude | 0% | 0 |
| add-skew-apply | PENDING | image-viewer-v1 | claude | 0% | 0 |
| add-config-persist | PENDING | electron-shell | claude | 0% | 0 |
| opencv-types | PENDING | opencv-integration | claude | 0% | 0 |
| mat-lifecycle | PENDING | opencv-types | claude | 0% | 0 |
| unit-tests | PENDING | all-services | claude | 0% | 0 |
| e2e-tests | PENDING | unit-tests | claude | 0% | 0 |
| installer-packaging | PENDING | all-modules | claude | 0% | 0 |

## 当前迭代
- 正在实现: remove-license (v3.0.0 开源化改造)
- 下一步: opencv-types + mat-lifecycle
- 阻塞: SSOT 审阅中 (TEST_SPEC.md 待 LOCK)

## 完成标准
- [x] 项目骨架搭建 (Electron + Vue 3 + TypeScript)
- [x] OpenCV.js 集成
- [x] 基础图像处理服务
- [x] 批量处理 v1
- [x] 导出报告 v1
- [x] 历史记录 v1
- [ ] 移除所有许可证/收费逻辑
- [ ] OpenCV 类型定义完成
- [ ] Mat 内存安全封装
- [ ] 图像保存功能
- [ ] 缩略图生成
- [ ] 框选裁剪完整实现
- [ ] 倾斜变换应用
- [ ] 配置持久化
- [ ] 单元测试 ≥80%
- [ ] E2E 测试通过
- [ ] Electron 打包成功 (Win/Mac/Linux)
