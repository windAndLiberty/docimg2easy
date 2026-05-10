# img2easy Pro - 编码引擎说明书

## 项目背景
将实验性质的纯前端文档图像处理工具重构为商业级桌面应用。

## 技术约束
1. TypeScript严格模式，核心模块零any
2. OpenCV.js用于渲染预览，Sharp用于批量处理导出
3. Electron主进程负责文件IO和许可证验证
4. 渲染进程只处理UI和图像预览
5. 所有图像处理操作支持撤销/重做（命令模式）

## 代码规范
- 使用Composition API，避免Options API
- 组件文件: PascalCase.vue
- 组合式函数: useXxx.ts
- 常量: UPPER_SNAKE_CASE
- 接口: I prefix (如 IImageState)

## 目录结构
```
src/
  main/           # Electron主进程
  preload/        # 预加载脚本
  renderer/       # 渲染进程 (Vue 3)
    components/   # UI组件
    composables/  # 组合式函数
    stores/       # Pinia状态
    views/        # 页面视图
  shared/         # 主/渲染共享类型
  core/           # 图像处理核心 (OpenCV)
  assets/         # 静态资源
```

## 关键接口
- IImageTask: {id, name, originalPath, status, operations[]}
- IOperation: {type, params, timestamp, reversible}
- ILicenseInfo: {key, activatedAt, expiresAt, features[]}

## 测试要求
- 核心算法单元测试 (Jest)
- E2E测试 (Playwright)
- 打包后冒烟测试
