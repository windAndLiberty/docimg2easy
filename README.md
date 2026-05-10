# img2easy Pro

文档图像处理工具 - 商业级桌面应用

## 功能特性

- **自动校正**：霍夫变换检测倾斜角度，自动旋转校正
- **黑边消除**：智能轮廓检测，保留时标标记
- **污渍清理**：多特征评分系统，inpaint 修复
- **边缘裁剪**：灰度均值分析，自动裁剪
- **批量处理**：串行/并行队列，进度跟踪
- **导出报告**：PDF + Excel 双格式
- **撤销重做**：命令模式，Mat 快照

## 技术栈

- Electron 28 + Vue 3 + TypeScript
- OpenCV.js (WASM) 图像处理
- Pinia 状态管理
- Vitest 单元测试

## 安装

```bash
npm install --legacy-peer-deps --registry=https://registry.npmmirror.com
```

## 开发

```bash
ELECTRON_DISABLE_SANDBOX=1 npm run dev
```

## 构建

```bash
npm run build
npm run build:linux   # Linux dir package
npm run build:win     # Windows nsis
npm run build:mac     # macOS dmg
```

## 测试

```bash
npm test
```

## 许可证

- 试用版：7天免费
- 标准版：一次性买断
- 密钥格式：`XXXX-XXXX-XXXX-XXXX`

## 仓库

https://github.com/windAndLiberty/docimg2easy
