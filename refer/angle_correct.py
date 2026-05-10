#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文档图像旋转校正工具
Document Image Rotation and Deskewing Tool

功能：
    - 自动检测文档的倾斜角度
    - 使用霍夫变换检测直线并计算平均角度
    - 旋转校正使文档摆正
    - 支持手动指定角度
    - 保持文档内容居中

使用示例：
    # 自动检测并旋转
    python main.py case/p3.jpeg -o output.jpg

    # 手动指定角度（例如15度）
    python main.py case/p3.jpeg -o output.jpg --angle 15

    # 启用调试模式查看中间结果
    python main.py case/p3.jpeg -o output.jpg --debug
"""

import cv2
import numpy as np
import argparse
import os
from typing import Tuple, Optional, List
from pathlib import Path


class DocumentRotator:
    """
    文档旋转校正器

    核心算法：
    1. 使用Canny边缘检测提取文档轮廓
    2. 通过概率霍夫变换检测直线
    3. 计算直线的倾斜角度（加权平均）
    4. 应用仿射变换进行旋转校正

    参数说明：
    - canny_threshold1/2: Canny边缘检测的双阈值
    - hough_threshold: 霍夫变换的投票阈值
    - min_line_length: 最小线段长度（像素）
    - max_line_gap: 线段间最大间隙（像素）
    - angle_weight: 是否按线段长度加权计算角度
    - rotate_mode: 旋转模式 - 'auto'自动检测, 'fixed'手动指定
    """

    def __init__(self,
                 canny_threshold1: int = 50,
                 canny_threshold2: int = 150,
                 hough_threshold: int = 50,
                 min_line_length: int = 100,
                 max_line_gap: int = 10,
                 angle_weight: bool = True,
                 debug: bool = False):
        """
        初始化旋转校正器

        参数:
            canny_threshold1: Canny边缘检测低阈值
            canny_threshold2: Canny边缘检测高阈值
            hough_threshold: 霍夫变换最小投票数
            min_line_length: 最小线段长度
            max_line_gap: 线段间最大间隙
            angle_weight: 是否按长度加权计算角度
            debug: 是否保存调试图像
        """
        self.canny_threshold1 = canny_threshold1
        self.canny_threshold2 = canny_threshold2
        self.hough_threshold = hough_threshold
        self.min_line_length = min_line_length
        self.max_line_gap = max_line_gap
        self.angle_weight = angle_weight
        self.debug = debug

    def detect_skew_angle(self, image: np.ndarray) -> float:
        """
        检测图像的倾斜角度

        参数:
            image: 输入图像（BGR格式）

        返回:
            倾斜角度（度），正值表示顺时针倾斜，负值表示逆时针倾斜
        """
        # 转换为灰度图
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # 高斯模糊减少噪声
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # Canny边缘检测
        edges = cv2.Canny(blurred, self.canny_threshold1, self.canny_threshold2)

        if self.debug:
            cv2.imwrite("debug_01_edges.png", edges)

        # 概率霍夫直线检测
        lines = cv2.HoughLinesP(edges,
                                rho=1,
                                theta=np.pi / 180,
                                threshold=self.hough_threshold,
                                minLineLength=self.min_line_length,
                                maxLineGap=self.max_line_gap)

        if lines is None or len(lines) == 0:
            print("警告：未检测到足够的直线，返回0度")
            return 0.0

        # 提取线段角度并过滤
        angles = []
        weights = []

        for line in lines:
            x1, y1, x2, y2 = line[0]

            # 计算线段方向和角度
            dx = x2 - x1
            dy = y2 - y1

            # 忽略太短的线段
            line_length = np.sqrt(dx**2 + dy**2)
            if line_length < self.min_line_length:
                continue

            # 计算角度（相对于水平方向）
            angle = np.degrees(np.arctan2(dy, dx))

            # 归一化角度到 -90 到 90 度
            if angle > 90:
                angle -= 180
            elif angle < -90:
                angle += 180

            # 过滤：只保留接近水平或垂直的直线（文档边缘）
            # 文档通常有水平和垂直边缘，我们关注 -45 到 45 度的范围
            if abs(angle) > 45:
                continue

            angles.append(angle)
            weights.append(line_length if self.angle_weight else 1.0)

        if len(angles) == 0:
            print("警告：没有合适的直线用于角度计算，返回0度")
            return 0.0

        # 使用加权平均计算整体倾斜角度
        if self.angle_weight:
            avg_angle = np.average(angles, weights=weights)
        else:
            avg_angle = np.mean(angles)

        # 限制角度范围
        avg_angle = max(-45, min(45, avg_angle))

        print(f"检测到 {len(angles)} 条有效直线，平均倾斜角度: {avg_angle:.2f}°")
        return avg_angle

    def rotate_image(self,
                     image: np.ndarray,
                     angle: float,
                     center: Optional[Tuple[float, float]] = None) -> np.ndarray:
        """
        旋转图像

        参数:
            image: 输入图像
            angle: 旋转角度（度），正值表示顺时针
            center: 旋转中心，None表示使用图像中心

        返回:
            旋转后的图像
        """
        h, w = image.shape[:2]

        if center is None:
            center = (w // 2, h // 2)

        # 计算旋转矩阵
        rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)

        # 计算旋转后的边界尺寸
        cos = np.abs(rotation_matrix[0, 0])
        sin = np.abs(rotation_matrix[0, 1])
        new_w = int((h * sin) + (w * cos))
        new_h = int((h * cos) + (w * sin))

        # 调整旋转矩阵以保持图像中心
        rotation_matrix[0, 2] += (new_w / 2) - center[0]
        rotation_matrix[1, 2] += (new_h / 2) - center[1]

        # 执行旋转
        rotated = cv2.warpAffine(image,
                                 rotation_matrix,
                                 (new_w, new_h),
                                 flags=cv2.INTER_LINEAR,
                                 borderValue=(255, 255, 255))  # 白色背景

        return rotated

    def process_image(self,
                      input_path: str,
                      output_path: str,
                      fixed_angle: Optional[float] = None) -> float:
        """
        处理单张图像：检测角度并旋转校正

        参数:
            input_path: 输入图像路径
            output_path: 输出图像路径
            fixed_angle: 手动指定的旋转角度，如果为None则自动检测

        返回:
            使用的旋转角度（度）
        """
        # 读取图像
        image = cv2.imread(input_path)
        if image is None:
            raise ValueError(f"无法读取图像: {input_path}")

        print(f"原始图像尺寸: {image.shape[1]} x {image.shape[0]}")

        # 确定旋转角度
        if fixed_angle is not None:
            angle = fixed_angle
            print(f"使用手动指定角度: {angle:.2f}°")
        else:
            angle = self.detect_skew_angle(image)

        # 旋转图像
        rotated = self.rotate_image(image, angle)

        # 保存结果
        cv2.imwrite(output_path, rotated)
        print(f"旋转后图像尺寸: {rotated.shape[1]} x {rotated.shape[0]}")
        print(f"输出文件: {output_path}")

        if self.debug:
            cv2.imwrite("debug_02_rotated.png", rotated)

        return angle

    def process_batch(self,
                      input_dir: str,
                      output_dir: str,
                      file_extensions: List[str] = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'],
                      fixed_angle: Optional[float] = None) -> dict:
        """
        批量处理目录中的所有图像

        参数:
            input_dir: 输入目录路径
            output_dir: 输出目录路径
            file_extensions: 要处理的文件扩展名列表
            fixed_angle: 手动指定的旋转角度，如果为None则自动检测

        返回:
            处理统计信息字典
        """
        input_path = Path(input_dir)
        output_path = Path(output_dir)
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
                self.process_image(str(img_file), str(output_file), fixed_angle)
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


def create_sample_document():
    """创建一个示例倾斜文档图像用于测试"""
    # 创建白色背景
    img = np.ones((600, 800, 3), dtype=np.uint8) * 255

    # 定义文档区域（矩形）
    doc_points = np.array([
        [100, 100],
        [700, 80],
        [720, 500],
        [90, 520]
    ], np.int32)

    # 绘制文档背景（浅灰色）
    cv2.fillPoly(img, [doc_points], (240, 240, 240))

    # 绘制文档边框
    cv2.polylines(img, [doc_points], True, (150, 150, 150), 3)

    # 添加一些文字内容
    cv2.putText(img, "Sample Document", (200, 250),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2)
    cv2.putText(img, "This is a test document", (180, 300),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (50, 50, 50), 2)
    cv2.putText(img, "with slightly rotated text", (200, 340),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (50, 50, 50), 2)

    # 添加表格线
    for i in range(4):
        y = 400 + i * 30
        cv2.line(img, (150, y), (650, y), (100, 100, 100), 1)
    cv2.line(img, (300, 400), (300, 490), (100, 100, 100), 1)
    cv2.line(img, (450, 400), (450, 490), (100, 100, 100), 1)

    return img


def main():
    """主函数 - 命令行接口"""
    parser = argparse.ArgumentParser(
        description='文档图像旋转校正工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  # 自动检测并旋转校正
  python main.py input.jpg -o output.jpg

  # 手动指定旋转角度
  python main.py input.jpg -o output.jpg --angle 15

  # 批量处理整个目录
  python main.py -i ./input_dir -o ./output_dir

  # 启用调试模式（保存中间结果）
  python main.py input.jpg -o output.jpg --debug

  # 调整检测参数
  python main.py input.jpg -o output.jpg --canny1 30 --canny2 100 --min-line 150
        """
    )

    parser.add_argument('input', nargs='?', help='输入图像路径')
    parser.add_argument('output', nargs='?', help='输出图像路径')
    parser.add_argument('-i', '--input-dir', help='输入目录（批量处理）')
    parser.add_argument('-o', '--output', help='输出图像路径（与位置参数output功能相同）')
    parser.add_argument('--output-dir', help='输出目录（批量处理时使用）')
    parser.add_argument('--angle', type=float, help='手动指定旋转角度（度）')
    parser.add_argument('--debug', action='store_true', help='启用调试模式，保存中间结果')
    parser.add_argument('--canny1', type=int, default=50, help='Canny低阈值（默认50）')
    parser.add_argument('--canny2', type=int, default=150, help='Canny高阈值（默认150）')
    parser.add_argument('--min-line', type=int, default=100, help='最小线段长度（默认100）')
    parser.add_argument('--hough-thresh', type=int, default=50, help='霍夫阈值（默认50）')
    parser.add_argument('--test', action='store_true', help='创建并测试示例倾斜文档')

    args = parser.parse_args()

    # 创建旋转校正器
    rotator = DocumentRotator(
        canny_threshold1=args.canny1,
        canny_threshold2=args.canny2,
        hough_threshold=args.hough_thresh,
        min_line_length=args.min_line,
        debug=args.debug
    )

    if args.test:
        # 创建并测试示例文档
        print("创建示例倾斜文档...")
        sample_img = create_sample_document()
        test_path = "test_document.png"
        cv2.imwrite(test_path, sample_img)
        output_path = "test_document_rotated.png"
        rotator.process_image(test_path, output_path)
        print(f"示例文件已保存: {test_path} -> {output_path}")

    elif args.input and args.output:
        # 单文件处理
        angle = rotator.process_image(args.input, args.output, args.angle)
        print(f"完成！旋转角度: {angle:.2f}°")

    elif args.input_dir and args.output_dir:
        # 批量处理
        rotator.process_batch(args.input_dir, args.output_dir, fixed_angle=args.angle)

    else:
        # 显示帮助
        parser.print_help()
        print("\n快速开始:")
        print("  1. 运行 'python main.py --test' 创建示例并测试")
        print("  2. 处理实际文档: python main.py case/p3.jpeg -o output.jpg")


if __name__ == "__main__":
    main()