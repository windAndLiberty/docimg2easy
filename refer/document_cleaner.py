#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文档污渍智能去除工具 - 多特征评分版本
Intelligent Document Stain Removal Tool - Multi-Feature Scoring Version

核心改进：
    - 使用多特征加权评分系统识别污渍
    - 不依赖硬编码的位置规则
    - 特征：实心度、圆形度、紧凑度、孤立度
    - 智能处理边缘情况（i、j、句号等）

作者: MiniMax Agent
"""

import cv2
import numpy as np
from pathlib import Path
from typing import Tuple, Optional, List, Dict
import argparse


class DocumentCleaner:
    """
    文档污渍智能去除器 - 多特征评分版

    核心算法：
    1. 预处理：灰度化、高斯模糊、自适应阈值二值化
    2. 连通域分析：提取所有黑色连通区域
    3. 多特征计算：实心度、圆形度、紧凑度、孤立度
    4. 加权评分：根据特征计算污渍概率得分
    5. 智能分类：基于得分阈值分类
    6. 上下文修正：处理 i、j、句号等特殊情况
    7. 修复处理：使用inpainting算法填充污渍区域
    """

    def __init__(self,
                 debug: bool = False,
                 min_text_area: int = 5,
                 max_text_area: int = 5000,
                 stain_threshold: float = 0.75,
                 inpaint_radius: int = 3):
        """
        初始化污渍去除器

        参数:
            debug: 是否启用调试模式
            min_text_area: 最小文字面积阈值（小于此值的忽略）
            max_text_area: 最大文字面积阈值（大于此值的自动去除）
            stain_threshold: 污渍得分阈值（0-1），高于此值认为是污渍
            inpaint_radius: 修复算法的邻域半径
        """
        self.debug = debug
        self.min_text_area = min_text_area
        self.max_text_area = max_text_area
        self.stain_threshold = stain_threshold
        self.inpaint_radius = inpaint_radius

        # 特征权重（可调参数）
        self.weights = {
            'solidity': 0.40,      # 实心度权重
            'circularity': 0.25,   # 圆形度权重
            'compactness': 0.20,  # 紧凑度权重
            'size_penalty': 0.15   # 尺寸惩罚权重
        }

    def calculate_solidity(self, contour: np.ndarray) -> float:
        """
        计算实心度（填充率）

        实心度 = 轮廓面积 / 凸包面积
        文字有复杂空腔，实心度较低
        污渍是实心斑块，实心度接近1.0
        """
        area = cv2.contourArea(contour)
        if area == 0:
            return 0.0
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        if hull_area == 0:
            return 0.0
        return area / hull_area

    def calculate_circularity(self, contour: np.ndarray) -> float:
        """
        计算圆形度

        圆形度 = (4 * π * 面积) / (周长²)
        完美圆形 = 1.0
        污渍倾向于圆形或椭圆形
        文字通常是不规则形状
        """
        area = cv2.contourArea(contour)
        if area == 0:
            return 0.0
        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            return 0.0
        circularity = (4 * np.pi * area) / (perimeter ** 2)
        # 限制在0-1范围内
        return min(1.0, circularity)

    def calculate_compactness(self, contour: np.ndarray) -> float:
        """
        计算紧凑度

        紧凑度 = 面积 / (边界框面积)
        正方形/圆形 = 接近1.0
        细长形状 < 1.0
        """
        area = cv2.contourArea(contour)
        if area == 0:
            return 0.0
        x, y, w, h = cv2.boundingRect(contour)
        bbox_area = w * h
        if bbox_area == 0:
            return 0.0
        return area / bbox_area

    def calculate_size_score(self, area: float) -> float:
        """
        计算尺寸得分

        策略：
        - 非常小的斑点（<20）：可能是污渍（装订孔、扫描点）
        - 中等大小（20-2000）：可能是文字
        - 非常大的斑块（>2000）：可能是污渍
        """
        if area < 15:
            # 非常小的斑点，很可能是污渍（装订孔、扫描点）
            return 0.95
        elif area < 30:
            # 小斑点，可能是污渍
            return 0.85
        elif area > self.max_text_area:
            # 超大斑块，很可能是污渍
            return 0.9
        elif area > 2000:
            # 大斑块，中等偏高
            return 0.7
        else:
            # 中等大小，很可能是文字
            return 0.3

    def calculate_stain_score(self, contour: np.ndarray) -> float:
        """
        计算污渍得分（0-1）

        综合多个特征计算污渍概率得分
        得分越高，越可能是污渍
        """
        area = cv2.contourArea(contour)
        if area < self.min_text_area:
            return 0.0

        # 计算各个特征
        solidity = self.calculate_solidity(contour)
        circularity = self.calculate_circularity(contour)
        compactness = self.calculate_compactness(contour)
        size_score = self.calculate_size_score(area)

        # 计算宽高比因子（接近1.0表示接近正方形/圆形）
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = w / h if h > 0 else 0
        aspect_factor = 1.0 / (1.0 + abs(1.0 - aspect_ratio))

        # 加权求和
        score = (
            solidity * self.weights['solidity'] +
            circularity * self.weights['circularity'] +
            compactness * self.weights['compactness'] +
            size_score * self.weights['size_penalty']
        )

        # 调整：如果宽高比接近1.0，增加分数
        if aspect_ratio > 0.5 and aspect_ratio < 2.0:
            score = score * 1.1

        # 限制在0-1范围内
        return min(1.0, score)

    def is_likely_punctuation(self, contour: np.ndarray,
                               all_contours: List[np.ndarray],
                               contour_idx: int) -> bool:
        """
        检查是否是标点符号（句号、逗号等）

        策略：如果一个"污渍-like"的轮廓下面有文字-like的轮廓，
        或者在文字行附近，可能是标点

        注意：只对中等大小的对象使用此检查，非常小的对象（<15）直接视为污渍
        """
        area = cv2.contourArea(contour)

        # 非常小的对象（<15像素）：不进行上下文检查，直接视为污渍
        # 这是装订孔、扫描点等的情况
        if area < 15:
            return False

        # 中等大小的对象才进行上下文检查
        if area > 80:
            return False

        x, y, w, h = cv2.boundingRect(contour)
        cx = x + w // 2
        cy = y + h // 2

        # 查找附近的轮廓
        for i, other_cnt in enumerate(all_contours):
            if i == contour_idx:
                continue

            other_area = cv2.contourArea(other_cnt)
            if other_area < self.min_text_area:
                continue

            ox, oy, ow, oh = cv2.boundingRect(other_cnt)
            ocx = ox + ow // 2
            ocy = oy + oh // 2

            # 检查是否在下方且距离很近
            if ocy > cy and abs(cx - ocx) < ow and (oy - (y + h)) < 20:
                return True

        return False

    def process_image(self,
                     image_path: str,
                     output_path: Optional[str] = None) -> np.ndarray:
        """
        处理单张图像，去除污渍

        参数:
            image_path: 输入图像路径
            output_path: 输出图像路径（可选，默认覆盖原图）

        返回:
            处理后的图像
        """
        # 1. 读取图像
        original = cv2.imread(image_path)
        if original is None:
            raise ValueError(f"无法读取图像: {image_path}")

        img = original.copy()
        h, w = img.shape[:2]

        # 2. 预处理
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 高斯模糊去噪
        blurred = cv2.GaussianBlur(gray, (3, 3), 0)

        # 自适应阈值二值化（处理不均匀光照）
        binary = cv2.adaptiveThreshold(
            blurred, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            11, 2
        )

        if self.debug:
            cv2.imwrite("debug_01_binary.png", binary)

        # 3. 形态学操作：分离连在一起的对象
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)

        if self.debug:
            cv2.imwrite("debug_02_morphology.png", binary)

        # 4. 查找轮廓
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL,
                                        cv2.CHAIN_APPROX_SIMPLE)

        if self.debug:
            # 可视化所有轮廓
            debug_img = original.copy()
            cv2.drawContours(debug_img, contours, -1, (0, 255, 0), 2)
            cv2.imwrite("debug_03_all_contours.png", debug_img)

        # 5. 初始化污渍掩膜
        stain_mask = np.zeros_like(gray)

        # 统计信息
        text_count = 0
        stain_count = 0

        # 6. 分析并分类每个轮廓
        for idx, cnt in enumerate(contours):
            area = cv2.contourArea(cnt)

            # 跳过太小的轮廓
            if area < self.min_text_area:
                continue

            # 跳过超大面积（直接认为是污渍）
            if area > self.max_text_area * 3:
                stain_count += 1
                cv2.drawContours(stain_mask, [cnt], -1, 255, thickness=cv2.FILLED)
                continue

            # 计算污渍得分
            score = self.calculate_stain_score(cnt)

            # 判断是否是标点符号（句号、逗号、i、j的点）
            is_punct = self.is_likely_punctuation(cnt, contours, idx)

            # 特殊处理：非常小的孤立斑点（<15）直接视为污渍
            is_very_small = area < 15

            # 分类决策
            # 如果是非常小的孤立斑点，或者得分超过阈值且不是标点
            if is_very_small or (score > self.stain_threshold and not is_punct):
                stain_count += 1
                cv2.drawContours(stain_mask, [cnt], -1, 255, thickness=cv2.FILLED)
            else:
                text_count += 1

        print(f"  文字对象: {text_count}, 污渍: {stain_count}")

        if self.debug:
            cv2.imwrite("debug_04_stain_mask.png", stain_mask)

        # 7. 修复处理
        if stain_count > 0:
            result = original.copy()

            # 分离小斑点和大面积污渍
            # 小斑点（面积小）：直接白色填充
            # 大面积污渍：使用inpainting修复

            # 创建小斑点掩膜
            small_mask = np.zeros_like(gray)
            large_mask = np.zeros_like(gray)

            # 遍历轮廓，区分大小
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area < self.min_text_area:
                    continue

                # 重新计算得分判断是否是污渍
                score = self.calculate_stain_score(cnt)
                is_very_small = area < 15

                if is_very_small or score > self.stain_threshold:
                    if area < 100:
                        # 小斑点：直接填充
                        cv2.drawContours(small_mask, [cnt], -1, 255, thickness=cv2.FILLED)
                    else:
                        # 大面积污渍：inpainting
                        cv2.drawContours(large_mask, [cnt], -1, 255, thickness=cv2.FILLED)

            # 小斑点直接填充白色
            if np.sum(small_mask > 0) > 0:
                result[small_mask > 0] = 255

            # 大面积污渍使用inpainting
            if np.sum(large_mask > 0) > 0:
                # 先膨胀一下
                kernel = np.ones((3, 3), np.uint8)
                large_mask = cv2.dilate(large_mask, kernel, iterations=1)
                result = cv2.inpaint(result, large_mask, self.inpaint_radius,
                                   cv2.INPAINT_TELEA)
        else:
            result = original

        # 8. 保存结果
        if output_path:
            cv2.imwrite(output_path, result)
            print(f"已处理: {image_path}")

        if self.debug:
            cv2.imwrite("debug_05_result.png", result)

        return result

    def process_batch(self,
                     input_dir: str,
                     output_dir: str,
                     file_extensions: List[str] = ['.jpg', '.jpeg', '.png', '.tif', '.tiff']) -> dict:
        """
        批量处理目录中的所有图像
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


def main():
    """主函数 - 命令行接口"""
    parser = argparse.ArgumentParser(
        description='文档污渍智能去除工具 - 多特征评分版',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  # 处理单张图像
  python document_cleaner.py input.jpg output.jpg

  # 启用调试模式（查看中间结果）
  python document_cleaner.py input.jpg output.jpg --debug

  # 调整参数
  python document_cleaner.py input.jpg output.jpg --threshold 0.8

  # 批量处理目录
  python document_cleaner.py -i ./input_dir -o ./output_dir

参数说明:
  --threshold: 污渍得分阈值（默认0.75），高于此值认为是污渍
  --min-area: 最小文字面积（默认5），小于此值的忽略
  --max-area: 最大文字面积（默认5000），大于此值的自动去除
  --inpaint-radius: 修复半径（默认3），值越大修复越平滑
        """
    )

    parser.add_argument('input', nargs='?', help='输入图像路径')
    parser.add_argument('output', nargs='?', help='输出图像路径')
    parser.add_argument('-i', '--input-dir', help='输入目录（批量处理）')
    parser.add_argument('-o', '--output-dir', help='输出目录')
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    parser.add_argument('--threshold', type=float, default=0.75,
                       help='污渍得分阈值（默认0.75）')
    parser.add_argument('--min-area', type=int, default=5,
                       help='最小文字面积（默认5）')
    parser.add_argument('--max-area', type=int, default=5000,
                       help='最大文字面积（默认5000）')
    parser.add_argument('--inpaint-radius', type=int, default=3,
                       help='修复半径（默认3）')

    args = parser.parse_args()

    # 创建去除器实例
    cleaner = DocumentCleaner(
        debug=args.debug,
        min_text_area=args.min_area,
        max_text_area=args.max_area,
        stain_threshold=args.threshold,
        inpaint_radius=args.inpaint_radius
    )

    # 根据参数执行处理
    if args.input and args.output:
        # 单文件处理
        cleaner.process_image(args.input, args.output)
        print(f"处理完成: {args.output}")

    elif args.input_dir and args.output_dir:
        # 批量处理
        cleaner.process_batch(args.input_dir, args.output_dir)

    else:
        # 显示帮助
        parser.print_help()


if __name__ == "__main__":
    main()
