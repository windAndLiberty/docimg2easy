---
version: alpha
name: img2easy Pro
description: Professional document image processing tool for desktop.
colors:
  primary: "#1A1C2E"
  secondary: "#64748B"
  accent: "#2563EB"
  neutral: "#F8FAFC"
  success: "#10B981"
  warning: "#F59E0B"
  error: "#EF4444"
  on-primary: "#FFFFFF"
  on-accent: "#FFFFFF"
typography:
  h1:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 500
    letterSpacing: "0.05em"
rounded:
  sm: 4px
  md: 8px
  lg: 12px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
  card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  toolbar:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    padding: "{spacing.sm} {spacing.md}"
---

## Overview

img2easy Pro 是一款面向专业人士的文档图像处理桌面应用。
视觉风格追求"精密仪器"感——冷静、高效、值得信赖。
深色工具栏搭配浅色工作区，让用户的注意力集中在图像内容上。

## Colors

- **Primary (#1A1C2E):** 深邃藏青，用于工具栏和核心文本。传达专业与沉稳。
- **Accent (#2563EB):** 明亮蓝，用于主要操作按钮和进度指示。是界面中唯一的强色彩信号。
- **Neutral (#F8FAFC):** 极浅灰白，用于工作区背景。比纯白更柔和，减少视觉疲劳。
- **Success (#10B981):** 翠绿，用于完成状态。
- **Warning (#F59E0B):** 琥珀，用于处理中状态。
- **Error (#EF4444):** 赤红，用于错误状态。

## Typography

Inter 用于所有文本。字重和大小建立层次，不依赖字体家族变化。

## Layout

4px 基线网格。`sm` (8px) 用于组件内间距，`md` (16px) 用于组件间间距，
`lg` (24px) 用于面板间间距。

## Components

- `button-primary` 是每个面板中的唯一高强调操作。
- `card` 用于图像列表项和设置面板。
- `toolbar` 固定在顶部，48px 高度，包含品牌标识和全局状态。

## Do's and Don'ts

- **Do** 使用 token 引用代替字面量。
- **Don't** 在调色板外引入新颜色——先扩展调色板。
- **Don't** 嵌套组件变体。hover 状态是独立条目。
