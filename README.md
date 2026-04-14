# img2easy - 文档图像处理工具

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-Latest-purple.svg)](https://vitejs.dev/)

> 🚀 **纯前端文档图像处理工具** - 支持旋转校正、黑边消除、边缘清理和污渍去除等功能

---

## ⚠️ 实验性项目声明

> **重要提示**：这是一个实验性质的项目，仍在积极开发中。
> 
> 🔍 **特别注意**：自动去污功能目前还不够完善，可能无法很好地处理各种类型的污渍。我们**正在寻求社区的帮助**来改进这一功能，欢迎贡献更好的算法和解决方案！

---

## ✨ 功能特性

### 核心功能

#### 🔄 旋转校正 (Angle Correction)
- 使用霍夫变换检测直线
- 自动计算平均角度进行旋转校正
- 支持 RANSAC 算法提高鲁棒性

#### ⬛ 黑边消除 (Border Removal)
- 智能检测图像四边的黑边
- 支持轮廓检测方法
- 自动裁剪黑边区域

#### ✂️ 边缘清理 (Edge Cleaning)
- 基于灰度分析的边缘检测
- 滑动窗口方法提高精度
- 自动裁剪不需要的边缘

#### 🧹 污渍去除 (Stain Removal) 🆕

> **v2.0 优化版** - 引入背景减除和自适应阈值技术

- **新增功能**:
  - 背景估计与减除：处理光照不均和泛黄纸张
  - 自适应阈值：局部二值化，适应亮度变化  
  - 孤立性特征：更好区分边缘污渍与文字
- 多特征评分系统识别污渍（实心度、圆形度、紧凑度、**孤立性**）
- 使用 Telea inpainting 算法修复污渍区域
- 支持动态参数调整 (`setParams()`)

> ⚠️ **仍需改进**：对与文字粘连的污渍、浅色/半透明污渍、彩色污渍和大面积污染等场景效果有限

> 💡 **提示**：可通过调整 `stainThreshold`、`adaptiveBlockSize` 等参数优化检测效果

### 快捷键支持

| 快捷键 | 功能 |
|:------:|------|
| `B` | 旋转 180° |
| `R` | 左转 90° |
| `T` | 右转 90° |
| `S` | 手动裁剪 |
| `W` | 向左倾斜 |
| `E` | 向右倾斜 |
| `A` | 撤销 |
| `Z` | 重置为原图 |

---

## 🛠️ 技术栈

- **前端框架**: Vanilla JavaScript (ES6+)
- **图像处理**: OpenCV.js
- **构建工具**: Vite
- **并发处理**: Web Workers
- **包管理**: npm / yarn

---

## 📁 项目结构

```
img2easy/
├── public/
│   ├── index.html              # 主页面
│   ├── css/
│   │   ├── main.css           # 主样式
│   │   ├── layout.css         # 布局样式
│   │   └── components.css     # 组件样式
│   └── assets/
│       └── js/
│           ├── core/           # 核心图像处理模块
│           │   ├── image-processor.js
│           │   ├── angle-corrector.js
│           │   ├── border-remover.js
│           │   ├── edge-cleaner.js
│           │   └── document-cleaner.js
│           ├── workers/        # Web Workers
│           │   ├── image-processing-worker.js
│           │   └── batch-processor-worker.js
│           ├── ui/             # 用户界面模块
│           │   ├── image-viewer.js
│           │   └── toolbar-controller.js
│           ├── utils/          # 工具函数
│           │   ├── canvas-utils.js
│           │   ├── file-handler.js
│           │   ├── opencv-loader.js
│           │   └── performance-monitor.js
│           └── main-controller.js  # 主控制器
├── src/
│   └── js/
├── package.json
├── vite.config.js
└── README.md
```

---

## 🚀 快速开始

### 前置要求

- Node.js 16+
- npm 或 yarn

### 安装依赖

```bash
npm install
# 或
yarn install
```

### 开发模式

```bash
npm run dev
```

启动开发服务器后，在浏览器中访问显示的地址（通常是 `http://localhost:5173`）。

### 生产构建

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

---

## 📖 使用说明

### 1. 导入图片

- 点击 **"导入文件夹"** 按钮选择包含图片的文件夹
- 或者输入任务号加载特定任务

### 2. 处理图片

- 选择左侧列表中的图片
- 使用工具栏按钮或快捷键进行操作
- 使用以下一键处理功能：
  - 🔧 **自动校正** - 自动检测并校正倾斜
  - ⬛ **自动去黑边** - 智能移除黑色边框
  - 🧹 **自动去污** - 尝试检测和修复污渍（实验功能）

### 3. 保存结果

- 处理完成后，图片会显示在右侧面板
- 可以继续调整或保存结果

---

## 🧠 核心算法说明

### 旋转校正算法

1. 转换为灰度图并高斯模糊
2. 使用 Canny 边缘检测
3. 霍夫变换检测直线
4. 过滤并计算平均角度
5. 执行仿射变换进行旋转校正

### 黑边消除算法

1. 灰度转换和二值化
2. 检测四边的黑色像素分布
3. 计算黑边边界
4. 裁剪黑边区域

### 污渍检测算法 🧪

1. 形态学操作预处理
2. 查找轮廓
3. 计算轮廓特征（实心度、圆形度等）
4. 评分判断是否为污渍
5. 使用 inpainting 修复

> ⚠️ **注意**：污渍检测算法仍在实验阶段，对于复杂背景或特殊类型的污渍可能效果不佳。我们欢迎社区贡献更先进的污渍检测和修复算法！

---

## ⚡ 性能优化

- 🧵 **Web Workers** - 使用后台线程进行图像处理，避免阻塞 UI
- 🔢 **多核并行** - 支持多核 CPU 并行处理
- 💾 **内存管理** - 及时释放不再使用的内存
- 🎮 **GPU 加速** - 利用浏览器 GPU 加速（如果支持）

---

## 🌐 浏览器支持

| 浏览器 | 最低版本 |
|--------|---------|
| Chrome | 80+ |
| Firefox | 75+ |
| Safari | 14+ |
| Edge | 80+ |

---

## 🤝 社区贡献

我们特别希望社区能够帮助改进以下方面：

### 🎯 优先改进方向

1. **🧹 自动去污算法** - 当前的污渍检测和修复算法仍有很大改进空间
   - ✅ **已完成 (v2.0)**: 背景减除、自适应阈值、孤立性特征
   - 🔄 **进行中**: HSV 颜色空间检测、Otsu 自动寻优
   - ⏳ **待实现**: 深度学习模型集成 (U-Net/TensorFlow.js)
   
2. **🎯 准确性提升** - 提高各种图像处理功能的准确性和稳定性
3. **✨ 新功能开发** - 添加更多实用的图像处理功能
4. **⚡ 性能优化** - 提升处理速度和内存使用效率

### 📚 技术文档

- [污渍去除优化详细报告](./public/assets/js/core/STAIN_REMOVAL_OPTIMIZATION.md) - 包含算法原理、参数调优指南和测试方法

### 如何贡献

如果您有相关经验并愿意贡献：

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

请查看我们的代码并提交 PR！

---

## 📅 开发计划

- [ ] 批量处理功能
- [ ] 注册机和硬件绑定
- [ ] 更多图像处理功能
- [ ] 处理历史记录
- [ ] 导出处理报告
- [ ] 改进自动去污算法

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可。

---

## 📞 联系方式

- 📧 问题反馈：请在 GitHub Issues 中提交
- 💬 讨论交流：欢迎在项目讨论区交流

---

<div align="center">

**如果这个项目对你有帮助，请给一个 ⭐ Star 支持！**

[⬆ 返回顶部](#img2easy---文档图像处理工具)

</div>
