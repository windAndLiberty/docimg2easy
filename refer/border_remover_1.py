#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通用文档黑边消除算法
Intelligent Document Border Removal Tool

功能：
    - 自动检测并消除文档图片中的各种黑边（规则矩形、不规则形状）
    - 区分黑边与文档内容，保护有效信息
    - 处理多种边界情况

"""

import cv2
import numpy as np
from pathlib import Path
from typing import Tuple, Optional, List
import argparse
import os


class BorderRemover:
    """
    智能黑边消除器

    核心算法思路：
    1. 使用自适应阈值进行二值化，分离前景（黑色）和背景（白色）
    2. 提取所有连通域轮廓
    3. 通过"触边检测"识别边缘黑边
    4. 使用面积/形状过滤保护主体内容
    5. 掩膜填充法消除黑边

    特点：
    - 不依赖于黑边的形状，适用于规则和不规则黑边
    - 内置多重保护机制，防止误删文档内容
    - 支持调试模式，可视化处理过程
    """

    def __init__(self,
                 debug: bool = False,
                 edge_tolerance: int = 3,
                 min_border_area: int = 30,
                 max_border_area_ratio: float = 0.30,
                 preserve_timing_marks: bool = True,
                 timing_mark_position: str = "right",
                 corner_detection: bool = True):
        """
        初始化黑边消除器

        参数:
            debug: 是否启用调试模式（显示中间结果）
            edge_tolerance: 边缘容差（像素），触边判定阈值
            min_border_area: 最小黑边面积阈值，过滤微小噪点
            max_border_area_ratio: 最大黑边面积比例（相对于图像总面积）
            preserve_timing_marks: 是否保留定位块（OMR表格的同步标记）
            timing_mark_position: 定位块位置，可选 "right", "left", "both"
            corner_detection: 是否启用角落检测模式（增强检测靠近角落的黑色标记）
        """
        self.debug = debug
        self.edge_tolerance = edge_tolerance
        self.min_border_area = min_border_area
        self.max_border_area_ratio = max_border_area_ratio
        self.preserve_timing_marks = preserve_timing_marks
        self.timing_mark_position = timing_mark_position
        self.corner_detection = corner_detection

    def process_image(self,
                      image_path: str,
                      output_path: Optional[str] = None,
                      padding: int = 0) -> np.ndarray:
        """
        处理单张图像，消除黑边

        参数:
            image_path: 输入图像路径
            output_path: 输出图像路径（可选，默认覆盖原图）
            padding: 边缘填充宽度，用于更精确的边缘检测

        返回:
            处理后的图像（numpy数组）
        """
        # 读取图像
        original_img = cv2.imread(image_path)
        if original_img is None:
            raise ValueError(f"无法读取图像: {image_path}")

        h, w = original_img.shape[:2]
        image_area = h * w

        # 如果指定了padding，先裁剪
        if padding > 0:
            original_img = original_img[padding:h-padding, padding:w-padding]
            h, w = original_img.shape[:2]
            image_area = h * w

        # 复制图像用于处理
        result_img = original_img.copy()

        # ========== 步骤1: 预处理 ==========
        gray = cv2.cvtColor(original_img, cv2.COLOR_BGR2GRAY)

        # 高斯模糊去噪（减少椒盐噪声对轮廓检测的影响）
        blurred = cv2.GaussianBlur(gray, (3, 3), 0)

        # ========== 步骤2: 二值化 ==========
        # 使用Otsu自动阈值，处理各种光照条件
        # THRESH_BINARY_INV: 反向二值化，黑色物体变白，便于找轮廓
        _, binary = cv2.threshold(blurred, 0, 255,
                                   cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        if self.debug:
            cv2.imwrite("debug_01_binary.png", binary)

        # ========== 步骤3: 形态学优化（可选）============
        # 闭运算：填补黑色区域内部的小孔，使轮廓更连续
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

        if self.debug:
            cv2.imwrite("debug_02_morphology.png", binary)

        # ========== 步骤4: 轮廓提取 ==========
        # RETR_EXTERNAL: 只提取外轮廓，不处理内部孔洞
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)

        if self.debug:
            # 可视化所有检测到的轮廓
            debug_contour_img = original_img.copy()
            cv2.drawContours(debug_contour_img, contours, -1, (0, 255, 0), 2)
            cv2.imwrite("debug_03_all_contours.png", debug_contour_img)

        # ========== 步骤5: 黑边判定与消除 ==========
        border_mask = np.zeros_like(binary)
        borders_removed = 0

        max_border_area = image_area * self.max_border_area_ratio

        for cnt in contours:
            # 获取轮廓的基本信息
            x, y, cw, ch = cv2.boundingRect(cnt)
            area = cv2.contourArea(cnt)

            # ---- 判定条件1: 面积过滤 ----
            # 面积过小：认为是微小噪点，跳过
            if area < self.min_border_area:
                continue
            # 面积过大：认为是文档主体（可能有照片），跳过
            if area > max_border_area:
                continue

            # ---- 判定条件2: 触边检测 ----
            # 检查轮廓是否接触图像边缘
            touches_left = x <= self.edge_tolerance
            touches_top = y <= self.edge_tolerance
            touches_right = (x + cw) >= (w - self.edge_tolerance)
            touches_bottom = (y + ch) >= (h - self.edge_tolerance)

            touches_edge = touches_left or touches_top or touches_right or touches_bottom

            if not touches_edge:
                continue

            # ---- 判定条件3: 定位块保护 ----
            # 如果需要保留定位块，检查是否符合定位块特征
            if self.preserve_timing_marks:
                if self._is_timing_mark(x, y, cw, ch, w, h):
                    continue  # 跳过定位块，保留它

            # ---- 判定条件4: 内容保护 ----
            # 如果触边区域太大，可能不是黑边
            edge_area_ratio = area / (cw * ch) if cw * ch > 0 else 0
            # 实心度检查：黑边通常是实心的
            if edge_area_ratio < 0.3:  # 太稀疏，可能是文字
                continue

            # 判定为黑边，添加到消除掩膜
            cv2.drawContours(border_mask, [cnt], -1, 255, thickness=cv2.FILLED)
            borders_removed += 1

        # ========== 步骤5.5: 角落检测增强（处理靠近角落的黑色标记）==========
        if self.corner_detection:
            corner_mask = self._detect_corner_borders(binary, h, w)
            border_mask = cv2.bitwise_or(border_mask, corner_mask)

            if self.debug:
                cv2.imwrite("debug_05_corner_mask.png", corner_mask)

        # ========== 步骤6: 掩膜填充消除黑边 ==========
        # 稍微膨胀掩膜，确保边缘干净
        kernel = np.ones((3, 3), np.uint8)
        border_mask = cv2.dilate(border_mask, kernel, iterations=1)

        # 将掩膜区域的像素设置为白色（背景色）
        result_img[border_mask == 255] = [255, 255, 255]

        # 如果之前有padding，需要还原图像尺寸
        if padding > 0:
            # 创建一个带边框的画布
            full_result = np.full((h + 2*padding, w + 2*padding, 3), 255, dtype=np.uint8)
            full_result[padding:padding+h, padding:padding+w] = result_img
            result_img = full_result

        # ========== 步骤7: 保存结果 ==========
        if output_path:
            cv2.imwrite(output_path, result_img)
            print(f"已处理: {image_path} | 消除黑边数量: {borders_removed}")

        if self.debug:
            cv2.imwrite("debug_04_border_mask.png", border_mask)
            cv2.imwrite("debug_05_result.png", result_img)

        return result_img

    def _is_timing_mark(self, x: int, y: int, cw: int, ch: int,
                        img_w: int, img_h: int) -> bool:
        """
        判断是否为定位块（OMR表格的同步标记）

        定位块特征：
        - 位于边缘
        - 形状规则（扁长矩形）
        - 排列整齐
        - 宽度较窄（通常5-20像素）

        参数:
            x, y, cw, ch: 轮廓的边界框信息
            img_w, img_h: 图像尺寸

        返回:
            True=是定位块需要保留， False=不是定位块需要消除
        """
        aspect_ratio = cw / ch if ch > 0 else 0

        # 检查是否位于指定边缘
        is_right_edge = (x + cw) >= (img_w - self.edge_tolerance * 2)
        is_left_edge = x <= self.edge_tolerance * 2

        if self.timing_mark_position == "right":
            is_at_position = is_right_edge
        elif self.timing_mark_position == "left":
            is_at_position = is_left_edge
        else:  # "both"
            is_at_position = is_right_edge or is_left_edge

        # 定位块判定条件：
        # 1. 位于指定边缘
        # 2. 高度占比超过图像高度的一半（说明是纵向延伸的）
        # 3. 宽度要足够窄（真正的定位块通常很窄，宽度占比 < 3%）
        # 4. 整体宽度要很小（绝对宽度 < 25像素，通常定位块就几个像素宽）
        width_ratio = cw / img_w
        is_vertical_strip = (ch > img_h * 0.5) and (aspect_ratio < 0.5)
        is_narrow = (width_ratio < 0.03) and (cw < 25)  # 宽度占比<3% 且 绝对宽度<25像素

        return is_at_position and is_vertical_strip and is_narrow

    def _detect_corner_borders(self, binary: np.ndarray, h: int, w: int) -> np.ndarray:
        """
        检测边缘黑色区域（角落区域检测）

        核心思路：
        1. 分别检测四个角落区域的黑色像素密度
        2. 如果角落区域中黑色像素超过阈值，认为是角落黑边/标记
        3. 创建掩膜标记这些角落区域

        参数:
            binary: 二值化图像（255=黑色前景，0=白色背景）
            h, w: 图像高度和宽度

        返回:
            角落黑边掩膜
        """
        corner_mask = np.zeros_like(binary)

        # 定义角落区域大小（图像尺寸的8-12%，略大一些）
        corner_h = max(30, int(h * 0.10))
        corner_w = max(30, int(w * 0.10))

        # 四个角落区域 (x, y)
        corners = [
            (0, 0, corner_w, corner_h, "左上"),       # 左上角
            (w - corner_w, 0, corner_w, corner_h, "右上"),  # 右上角
            (0, h - corner_h, corner_w, corner_h, "左下"),  # 左下角
            (w - corner_w, h - corner_h, corner_w, corner_h, "右下"),  # 右下角
        ]

        # 黑色像素阈值（角落中黑色像素超过1%认为是角落黑边）
        threshold = 0.01

        for x, y, cw, ch, name in corners:
            # 提取角落区域
            corner_region = binary[y:y+ch, x:x+cw]

            # 计算黑色像素(255)的比例
            black_pixels = np.sum(corner_region == 255)
            total_pixels = corner_region.size
            black_ratio = black_pixels / total_pixels

            # 如果超过阈值，标记为角落黑边
            if black_ratio > threshold:
                # 找到该角落中的黑色连通区域
                white_mask = (corner_region == 255).astype(np.uint8) * 255

                # 查找轮廓
                contours, _ = cv2.findContours(white_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                for cnt in contours:
                    cnt_area = cv2.contourArea(cnt)
                    # 过滤太小的连通域
                    if cnt_area > 10:
                        # 创建临时掩膜并添加到总掩膜
                        temp_mask = np.zeros_like(corner_region)
                        cv2.drawContours(temp_mask, [cnt], -1, 255, thickness=cv2.FILLED)
                        corner_mask[y:y+ch, x:x+cw] = cv2.bitwise_or(
                            corner_mask[y:y+ch, x:x+cw],
                            temp_mask
                        )

        # 形态学操作
        kernel = np.ones((3, 3), np.uint8)
        corner_mask = cv2.morphologyEx(corner_mask, cv2.MORPH_CLOSE, kernel)

        return corner_mask

    def _flood_fill_from_seed(self, binary_copy: np.ndarray, corner_mask: np.ndarray,
                              seed: Tuple[int, int], h: int, w: int) -> np.ndarray:
        """
        从种子点进行漫水填充并添加到掩膜

        参数:
            binary_copy: 二值图像（会被修改）
            corner_mask: 当前掩膜
            seed: 种子点坐标 (x, y)
            h, w: 图像尺寸

        返回:
            更新后的掩膜
        """
        # 检查种子点是否有效
        if seed[0] < 0 or seed[0] >= w or seed[1] < 0 or seed[1] >= h:
            return corner_mask

        if binary_copy[seed[1], seed[0]] != 255:
            return corner_mask

        # 使用漫水填充
        mask_floodfill = np.zeros((h + 2, w + 2), dtype=np.uint8)
        cv2.floodFill(binary_copy, mask_floodfill, seed, 0, 0, 0,
                     cv2.FLOODFILL_FIXED_RANGE)

        # 将填充结果添加到掩膜
        filled_area = mask_floodfill[1:h+1, 1:w+1]
        corner_mask = cv2.bitwise_or(corner_mask, filled_area)

        return corner_mask

    def process_batch(self,
                      input_dir: str,
                      output_dir: str,
                      file_extensions: List[str] = ['.jpg', '.jpeg', '.png', '.tif', '.tiff']) -> dict:
        """
        批量处理目录中的所有图像

        参数:
            input_dir: 输入目录路径
            output_dir: 输出目录路径
            file_extensions: 要处理的文件扩展名列表

        返回:
            处理统计信息字典
        """
        input_path = Path(input_dir)
        output_path = Path(output_dir)

        # 创建输出目录
        output_path.mkdir(parents=True, exist_ok=True)

        # 获取所有图像文件
        image_files = []
        for ext in file_extensions:
            image_files.extend(list(input_path.glob(f"*{ext}")))
            image_files.extend(list(input_path.glob(f"*{ext.upper()}")))

        stats = {
            'total': len(image_files),
            'success': 0,
            'failed': 0,
            'files': []
        }

        for img_file in image_files:
            try:
                output_file = output_path / img_file.name
                self.process_image(str(img_file), str(output_file))
                stats['success'] += 1
                stats['files'].append({
                    'name': img_file.name,
                    'status': 'success'
                })
            except Exception as e:
                stats['failed'] += 1
                stats['files'].append({
                    'name': img_file.name,
                    'status': 'failed',
                    'error': str(e)
                })

        print(f"\n批量处理完成:")
        print(f"  总数: {stats['total']}")
        print(f"  成功: {stats['success']}")
        print(f"  失败: {stats['failed']}")

        return stats


class AdaptiveBorderRemover(BorderRemover):
    """
    自适应黑边消除器

    在基础BorderRemover上增加自适应能力：
    - 根据图像特征自动调整参数
    - 更好的边缘检测算法
    - 处理更复杂的边界情况
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._detect_image_characteristics()

    def _detect_image_characteristics(self):
        """分析图像特征，用于自适应调整参数"""
        pass  # 可扩展

    def process_image(self, image_path: str,
                      output_path: Optional[str] = None) -> np.ndarray:
        """
        使用自适应参数处理图像
        """
        # 读取图像获取基本信息
        img = cv2.imread(image_path)
        h, w = img.shape[:2]

        # 根据图像尺寸自适应调整参数
        # 大图像需要更大的容差和面积阈值
        scale_factor = max(h, w) / 1000  # 标准化到1000像素

        # 动态调整参数
        self.edge_tolerance = max(3, int(3 * scale_factor))
        self.min_border_area = max(30, int(30 * scale_factor * scale_factor))

        return super().process_image(image_path, output_path)


def create_sample_images():
    """
    创建测试用例图像（用于演示算法效果）
    """
    # 创建测试图像目录
    test_dir = Path("test_images")
    test_dir.mkdir(exist_ok=True)

    # 测试1: 规则矩形黑边
    img1 = np.ones((500, 700, 3), dtype=np.uint8) * 255
    # 添加矩形黑边
    cv2.rectangle(img1, (0, 0), (50, 500), (0, 0, 0), -1)  # 左边
    cv2.rectangle(img1, (650, 0), (700, 500), (0, 0, 0), -1)  # 右边
    cv2.rectangle(img1, (0, 0), (700, 50), (0, 0, 0), -1)  # 上边
    # 添加文档内容
    cv2.putText(img1, "Test Document 1", (100, 250),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    cv2.imwrite(str(test_dir / "rectangular_border.png"), img1)

    # 测试2: 不规则黑边（模拟用户提供的图片）
    img2 = np.ones((600, 800, 3), dtype=np.uint8) * 255
    # 添加不规则左上角黑边（类似+字准星）
    pts = np.array([[0, 0], [60, 0], [60, 10], [10, 10], [10, 60], [0, 60]], np.int32)
    cv2.fillPoly(img2, [pts], (0, 0, 0))
    # 添加右侧定位块（一列矩形）
    for i in range(10):
        y = 50 + i * 50
        cv2.rectangle(img2, (780, y), (795, y + 30), (0, 0, 0), -1)
    # 添加文档内容
    cv2.putText(img2, "OMR Form Test", (200, 300),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    cv2.imwrite(str(test_dir / "irregular_border.png"), img2)

    # 测试3: 四边不规则黑边
    img3 = np.ones((500, 700, 3), dtype=np.uint8) * 255
    # 随机生成不规则边缘
    np.random.seed(42)
    # 左边不规则
    for i in range(50):
        x = int(np.random.uniform(0, 40))
        y = i * 10
        h = int(np.random.uniform(5, 15))
        cv2.rectangle(img3, (x, y), (x + 5, y + h), (0, 0, 0), -1)
    # 右边不规则
    for i in range(50):
        x = 700 - int(np.random.uniform(0, 40))
        y = i * 10
        h = int(np.random.uniform(5, 15))
        cv2.rectangle(img3, (x - 5, y), (x, y + h), (0, 0, 0), -1)
    # 文档内容
    cv2.rectangle(img3, (80, 80), (620, 420), (0, 0, 0), 2)
    cv2.putText(img3, "Document Content", (200, 250),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.imwrite(str(test_dir / "irregular_all_sides.png"), img3)

    print(f"测试图像已创建在: {test_dir}")


def main():
    """主函数 - 命令行接口"""
    parser = argparse.ArgumentParser(
        description='智能文档黑边消除工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  # 处理单张图像
  python border_remover.py input.jpg output.jpg

  # 批量处理整个目录
  python border_remover.py -i ./input_dir -o ./output_dir

  # 启用调试模式
  python border_remover.py input.jpg output.jpg --debug

  # 禁用定位块保护（会删除所有边缘黑色元素）
  python border_remover.py input.jpg output.jpg --no-preserve-timing

  # 调整参数
  python border_remover.py input.jpg output.jpg --edge-tolerance 5 --min-area 50
        """
    )

    parser.add_argument('input', nargs='?', help='输入图像路径')
    parser.add_argument('output', nargs='?', help='输出图像路径')
    parser.add_argument('-i', '--input-dir', help='输入目录（批量处理）')
    parser.add_argument('-o', '--output-dir', help='输出目录')
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    parser.add_argument('--no-preserve-timing', action='store_true',
                       help='不保留定位块（会删除所有边缘黑色元素）')
    parser.add_argument('--edge-tolerance', type=int, default=3,
                       help='边缘容差（像素），默认3')
    parser.add_argument('--min-area', type=int, default=30,
                       help='最小黑边面积，默认30')
    parser.add_argument('--max-area-ratio', type=float, default=0.30,
                       help='最大黑边面积比例，默认0.30')

    args = parser.parse_args()

    # 创建消除器实例
    remover = BorderRemover(
        debug=args.debug,
        edge_tolerance=args.edge_tolerance,
        min_border_area=args.min_area,
        max_border_area_ratio=args.max_area_ratio,
        preserve_timing_marks=not args.no_preserve_timing
    )

    # 根据参数执行处理
    if args.input and args.output:
        # 单文件处理
        remover.process_image(args.input, args.output)
        print(f"处理完成: {args.output}")

    elif args.input_dir and args.output_dir:
        # 批量处理
        remover.process_batch(args.input_dir, args.output_dir)

    else:
        # 如果没有提供参数，显示帮助
        parser.print_help()

        # 创建测试图像
        print("\n创建测试图像...")
        create_sample_images()
        print("\n可以运行以下命令测试:")
        print("  python border_remover.py test_images/rectangular_border.png output1.jpg")
        print("  python border_remover.py test_images/irregular_border.png output2.jpg")


if __name__ == "__main__":
    main()
