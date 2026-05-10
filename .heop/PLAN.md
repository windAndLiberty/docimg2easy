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
| project-setup | DONE | - | manual | - | 0 |
| typescript-migration | PENDING | - | claude | 0% | 0 |
| electron-shell | PENDING | typescript-migration | claude | 0% | 0 |
| opencv-integration | PENDING | typescript-migration | claude | 0% | 0 |
| image-viewer-redesign | PENDING | opencv-integration | claude | 0% | 0 |
| batch-processing | PENDING | image-viewer-redesign | claude | 0% | 0 |
| export-report | PENDING | batch-processing | claude | 0% | 0 |
| history-undo | PENDING | image-viewer-redesign | claude | 0% | 0 |
| license-system | PENDING | electron-shell | claude | 0% | 0 |
| settings-preferences | PENDING | electron-shell | claude | 0% | 0 |
| installer-packaging | PENDING | license-system | claude | 0% | 0 |

## 当前迭代
- 正在实现: typescript-migration
- 下一步: electron-shell
- 阻塞: 无

## 完成标准
- [ ] 所有模块 DONE
- [ ] TypeScript 零 any 类型（核心模块）
- [ ] 集成测试通过
- [ ] Electron 打包成功 (Win/Mac/Linux)
- [ ] 许可证系统可运行
