import cv2
import numpy as np
from PIL import Image
import argparse
import os


def detect_black_borders(image_path, threshold=30):
    """
    检测图像的黑边（优化版本 - 扫描宽度）
    
    Args:
        image_path: 图像路径
        threshold: 阈值，用于判断黑色/深色边缘的界限，默认为30
    
    Returns:
        tuple: (top, bottom, left, right) 各方向需要裁剪的像素数
    """
    # 使用OpenCV读取图像
    img = cv2.imread(image_path)
    
    # 转换为灰度图以便于检测
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 获取图像尺寸
    h, w = gray.shape
    
    # 计算每列的黑像素比例
    col_black_ratios = np.sum(gray < threshold, axis=0) / h
    row_black_ratios = np.sum(gray < threshold, axis=1) / w
    
    # 左侧检测：使用"纯黑列之后可能跟过渡列"的模式
    # 找一个窗口，比如连续10列中，有8列以上是纯黑（>=95%），然后下一列就是内容开始
    left = 0
    for j in range(w):
        # 检查当前列是否是纯黑
        is_black = col_black_ratios[j] >= 0.95
        
        if not is_black:
            # 检查前面是否有连续纯黑区域
            if j >= 2:
                # 检查前几列是否大部分是纯黑
                window_start = max(0, j-3)
                window = col_black_ratios[window_start:j]
                black_count = np.sum(window >= 0.95)
                if black_count >= len(window) * 0.7:  # 70%是纯黑
                    left = j
                    break
            else:
                left = j
                break
    else:
        left = w
    
    # 右侧检测：从右向左扫描
    right = w
    for j in range(w-1, -1, -1):
        is_black = col_black_ratios[j] >= 0.95
        
        if not is_black:
            # 检查后面是否有连续纯黑区域
            if j <= w-3:
                window_end = min(w, j+4)
                window = col_black_ratios[j+1:window_end]
                black_count = np.sum(window >= 0.95)
                if black_count >= len(window) * 0.7:
                    right = j + 1
                    break
            else:
                right = j + 1
                break
    else:
        right = 0
    
    # 顶部和底部使用类似逻辑
    is_black_row = row_black_ratios >= 0.95
    
    top = 0
    for i in range(h):
        if not is_black_row[i]:
            if i >= 2:
                window_start = max(0, i-3)
                window = row_black_ratios[window_start:i]
                black_count = np.sum(window >= 0.95)
                if black_count >= len(window) * 0.7:
                    top = i
                    break
            else:
                top = i
                break
    else:
        top = h
    
    bottom = h
    for i in range(h-1, -1, -1):
        if not is_black_row[i]:
            if i <= h-3:
                window_end = min(h, i+4)
                window = row_black_ratios[i+1:window_end]
                black_count = np.sum(window >= 0.95)
                if black_count >= len(window) * 0.7:
                    bottom = i + 1
                    break
            else:
                bottom = i + 1
                break
    else:
        bottom = 0
    
    return top, bottom, left, right


def smart_crop_image(image_path, output_path=None, threshold=30, padding=0):
    """
    智能裁剪图像，去除黑边
    
    Args:
        image_path: 输入图像路径
        output_path: 输出图像路径，如果为None则在原路径基础上加"_cropped"
        threshold: 阈值，用于判断黑色/深色边缘的界限
        padding: 裁剪后额外保留的边距
    
    Returns:
        str: 输出图像路径
    """
    # 检测黑边
    top, bottom, left, right = detect_black_borders(image_path, threshold)
    
    # 添加边距
    img = cv2.imread(image_path)
    h, w = img.shape[:2]
    top = max(0, top - padding)
    bottom = min(h, bottom + padding)
    left = max(0, left - padding)
    right = min(w, right + padding)
    
    # 读取原始图像（使用PIL以保持质量）
    pil_img = Image.open(image_path)
    
    # 执行裁剪
    cropped_img = pil_img.crop((left, top, right, bottom))
    
    # 确定输出路径
    if output_path is None:
        name, ext = os.path.splitext(image_path)
        output_path = f"{name}_cropped{ext}"
    
    # 保存裁剪后的图像
    cropped_img.save(output_path, quality=95)
    
    print(f"图像已成功处理: {image_path} -> {output_path}")
    print(f"裁剪区域: Top={top}, Bottom={bottom}, Left={left}, Right={right}")
    
    return output_path


def advanced_detect_black_borders(image_path, threshold=30, sensitivity=0.05):
    """
    高级黑边检测算法，考虑更复杂的场景
    
    Args:
        image_path: 图像路径
        threshold: 阈值，用于判断黑色/深色边缘的界限
        sensitivity: 敏感度，表示多少比例的行/列超过阈值才认为是有效内容
    
    Returns:
        tuple: (top, bottom, left, right) 各方向需要裁剪的像素数
    """
    # 使用OpenCV读取图像
    img = cv2.imread(image_path)
    
    # 转换为灰度图
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 获取图像尺寸
    h, w = gray.shape
    
    # 计算每行和每列的平均亮度
    row_means = np.mean(gray, axis=1)  # 每行的平均值
    col_means = np.mean(gray, axis=0)  # 每列的平均值
    
    # 计算敏感度阈值
    row_threshold = threshold
    col_threshold = threshold
    
    # 从顶部开始检测
    top = 0
    for i in range(h):
        if row_means[i] > row_threshold:
            # 检查该行是否大部分像素都超过阈值
            row_data = gray[i, :]
            if np.sum(row_data > threshold) / len(row_data) > sensitivity:
                top = i
                break
    
    # 从底部开始检测
    bottom = h
    for i in range(h-1, -1, -1):
        if row_means[i] > row_threshold:
            # 检查该行是否大部分像素都超过阈值
            row_data = gray[i, :]
            if np.sum(row_data > threshold) / len(row_data) > sensitivity:
                bottom = i + 1
                break
    
    # 从左侧开始检测
    left = 0
    for j in range(w):
        if col_means[j] > col_threshold:
            # 检查该列是否大部分像素都超过阈值
            col_data = gray[:, j]
            if np.sum(col_data > threshold) / len(col_data) > sensitivity:
                left = j
                break
    
    # 从右侧开始检测
    right = w
    for j in range(w-1, -1, -1):
        if col_means[j] > col_threshold:
            # 检查该列是否大部分像素都超过阈值
            col_data = gray[:, j]
            if np.sum(col_data > threshold) / len(col_data) > sensitivity:
                right = j + 1
                break
    
    return top, bottom, left, right


def remove_black_borders(image_path, output_path=None, threshold=30, padding=0, advanced=True):
    """
    主函数：移除图像的黑边
    
    Args:
        image_path: 输入图像路径
        output_path: 输出图像路径
        threshold: 阈值，用于判断黑色/深色边缘的界限
        padding: 裁剪后额外保留的边距
        advanced: 是否使用高级检测算法
    
    Returns:
        str: 输出图像路径
    """
    if advanced:
        # 使用高级检测算法
        top, bottom, left, right = advanced_detect_black_borders(image_path, threshold)
    else:
        # 使用基础检测算法
        top, bottom, left, right = detect_black_borders(image_path, threshold)
    
    # 读取原始图像
    pil_img = Image.open(image_path)
    
    # 添加边距
    img_h, img_w = cv2.imread(image_path).shape[:2]
    top = max(0, top - padding)
    bottom = min(img_h, bottom + padding)
    left = max(0, left - padding)
    right = min(img_w, right + padding)
    
    # 执行裁剪
    cropped_img = pil_img.crop((left, top, right, bottom))
    
    # 确定输出路径
    if output_path is None:
        name, ext = os.path.splitext(image_path)
        output_path = f"{name}_cropped{ext}"
    
    # 保存裁剪后的图像
    cropped_img.save(output_path, quality=95)
    
    print(f"图像已成功处理: {image_path} -> {output_path}")
    print(f"裁剪区域: Top={top}, Bottom={bottom}, Left={left}, Right={right}")
    print(f"原始尺寸: {pil_img.size}, 裁剪后尺寸: {cropped_img.size}")
    
    return output_path


def main():
    parser = argparse.ArgumentParser(description='AI-powered automatic image processing tool for removing black borders')
    parser.add_argument('input', help='Input image path')
    parser.add_argument('-o', '--output', help='Output image path')
    parser.add_argument('-t', '--threshold', type=int, default=30, help='Threshold for detecting black borders (default: 30)')
    parser.add_argument('-p', '--padding', type=int, default=0, help='Additional padding around the content (default: 0)')
    parser.add_argument('--basic', action='store_true', help='Use basic detection algorithm instead of advanced')
    
    args = parser.parse_args()
    
    try:
        output_path = remove_black_borders(
            args.input,
            args.output,
            args.threshold,
            args.padding,
            not args.basic
        )
        print(f"处理完成！输出文件: {output_path}")
    except Exception as e:
        print(f"处理过程中出现错误: {str(e)}")


if __name__ == "__main__":
    main()