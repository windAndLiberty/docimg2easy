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

## D004: 许可证方案 (已废弃)
- 选择: ~~本地许可证文件 + 在线验证可选~~
- 理由: ~~离线可用优先，可选联网验证防破解~~
- 时间: 2026-05-10
- 状态: DEPRECATED — v3.0.0 已移除所有许可证逻辑，项目完全开源免费
- 影响模块: 无 (license-system 已删除)

## D004a: 开源化决策
- 选择: 移除所有商业收费逻辑，完全开源
- 理由: 用户需求，MIT 许可证精神
- 时间: 2026-05-11
- 状态: ACTIVE
- 影响模块: 全部 (移除 LicenseManager、定价弹窗、功能限制)

## D005: 打包策略
- 选择: electron-builder + auto-updater
- 理由: 一键打包多平台，自动更新支持
- 时间: 2026-05-10
- 状态: ACTIVE
- 影响模块: installer-packaging

## D006: 编程范式
- 选择: 面向对象 (OO) 为主，函数式 (FP) 辅助
- 理由: OpenCV.js C++ 绑定天然 OO，图像处理服务适合类继承；工具函数适合 FP
- 时间: 2026-05-11
- 状态: ACTIVE
- 影响模块: services, utils
- 约束: 继承深度 ≤2，工具层纯函数优先

## D007: 测试策略
- 选择: Vitest 单元测试 + Playwright E2E
- 理由: 与 Vite 生态集成，OpenCV.js 可模拟测试
- 时间: 2026-05-11
- 状态: ACTIVE
- 影响模块: 全部
- 目标: services ≥80%, utils ≥90%
