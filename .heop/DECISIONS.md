# 架构决策

## D001: 技术栈升级
- 选择: TypeScript + Vue 3 + Electron + Vite
- 理由: 类型安全、现代UI框架、成熟桌面方案、快速构建
- 时间: 2026-05-10
- 状态: ACTIVE
- 影响模块: 全部

## D002: 图像处理引擎
- 选择: OpenCV.js (WebAssembly) + 主进程 Sharp (Node.js)
- 理由: OpenCV.js处理预览，Sharp处理批量导出更高效
- 时间: 2026-05-10
- 状态: ACTIVE
- 影响模块: core/image-processing, batch-processing

## D003: 状态管理
- 选择: Pinia
- 理由: Vue 3官方推荐，TypeScript友好，DevTools支持
- 时间: 2026-05-10
- 状态: ACTIVE
- 影响模块: ui, settings, history

## D004: 许可证方案
- 选择: 本地许可证文件 + 在线验证可选
- 理由: 离线可用优先，可选联网验证防破解
- 时间: 2026-05-10
- 状态: ACTIVE
- 影响模块: license-system

## D005: 打包策略
- 选择: electron-builder + auto-updater
- 理由: 一键打包多平台，自动更新支持
- 时间: 2026-05-10
- 状态: ACTIVE
- 影响模块: installer-packaging
