/**
 * Document Cleaner - 污渍去除模块
 * 
 * 使用多特征评分系统识别文档图像中的污渍，并使用inpainting算法修复
 * 
 * @version 2.0 - 优化版本：引入背景减除和自适应阈值
 */

class DocumentCleaner {
    constructor() {
        this.cv = null;
        // 污渍检测参数 - 可通过外部配置调整
        this.params = {
            // 形态学操作参数
            kernelSize: 3,
            dilationIterations: 2,
            erosionIterations: 1,
            
            // 污渍尺寸过滤
            minArea: 50,
            maxArea: 5000,
            
            // 特征权重
            weights: {
                solidity: 0.3,      // 实心度权重
                circularity: 0.2,   // 圆形度权重
                compactness: 0.2,   // 紧凑度权重
                isolation: 0.3      // 孤立性权重（新增）
            },
            
            // 评分阈值
            stainThreshold: 0.6,
            
            // 自适应阈值参数
            adaptiveBlockSize: 11,
            adaptiveC: 5,
            
            // Inpainting 半径
            inpaintRadius: 3
        };
    }

    /**
     * 初始化 OpenCV
     */
    async init(cv) {
        this.cv = cv;
        return new Promise((resolve) => {
            cv.onRuntimeInitialized = () => {
                console.log('OpenCV initialized for DocumentCleaner');
                resolve();
            };
        });
    }

    /**
     * 主处理函数：检测并去除污渍
     * @param {HTMLImageElement|HTMLCanvasElement} srcElement - 源图像
     * @returns {Promise<HTMLCanvasElement>} - 处理后的图像
     */
    async clean(srcElement) {
        if (!this.cv) {
            throw new Error('OpenCV not initialized');
        }

        const src = this.cv.imread(srcElement);
        const result = await this._processImage(src);
        
        src.delete();
        return result;
    }

    /**
     * 核心图像处理流程
     */
    async _processImage(src) {
        const gray = new this.cv.Mat();
        const blurred = new this.cv.Mat();
        const background = new this.cv.Mat();
        const foreground = new this.cv.Mat();
        const mask = new this.cv.Mat();
        const result = new this.cv.Mat();

        try {
            // 1. 转换为灰度图
            this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY, 0);

            // 2. 高斯模糊减少噪声
            const ksize = new this.cv.Size(5, 5);
            this.cv.GaussianBlur(gray, blurred, ksize, 0, 0, this.cv.BORDER_DEFAULT);

            // 3. 【优化】背景估计与减除 - 处理光照不均和泛黄纸张
            this._estimateBackground(blurred, background);
            this.cv.subtract(blurred, background, foreground);

            // 4. 【优化】自适应阈值二值化 - 替代普通阈值，更好适应局部变化
            this.cv.adaptiveThreshold(
                foreground, 
                mask, 
                255,
                this.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                this.cv.THRESH_BINARY_INV,
                this.params.adaptiveBlockSize,
                this.params.adaptiveC
            );

            // 5. 形态学操作 - 连接断裂区域，填充小孔
            this._morphologicalOperations(mask, mask);

            // 6. 【优化】多特征分析检测污渍
            const stainMask = await this._detectStains(mask, src);

            // 7. 如果检测到污渍，使用inpainting修复
            if (this.cv.countNonZero(stainMask) > 0) {
                this.cv.inpaint(src, stainMask, result, this.params.inpaintRadius, this.cv.INPAINT_TELEA);
            } else {
                src.copyTo(result);
            }

            // 8. 转换回 Canvas
            const outputCanvas = document.createElement('canvas');
            this.cv.imshow(outputCanvas, result);
            return outputCanvas;

        } finally {
            // 清理内存
            gray.delete();
            blurred.delete();
            background.delete();
            foreground.delete();
            mask.delete();
            stainMask && stainMask.delete();
            result.delete();
        }
    }

    /**
     * 【优化】背景估计 - 使用大核形态学闭运算估计背景
     * 适用于文档图像，能有效分离前景文字/污渍与背景
     */
    _estimateBackground(src, dst) {
        const kernelSize = 51; // 大结构元素，大于文字和污渍尺寸
        const kernel = this.cv.getStructuringElement(
            this.cv.MORPH_RECT, 
            new this.cv.Size(kernelSize, kernelSize),
            new this.cv.Point(-1, -1)
        );
        
        const temp = new this.cv.Mat();
        
        // 闭运算：先膨胀后腐蚀，保留亮区，估计背景
        this.cv.morphologyEx(src, temp, this.cv.MORPH_CLOSE, kernel);
        temp.copyTo(dst);
        
        kernel.delete();
        temp.delete();
    }

    /**
     * 形态学操作优化
     */
    _morphologicalOperations(src, dst) {
        const kernel = this.cv.getStructuringElement(
            this.cv.MORPH_ELLIPSE,
            new this.cv.Size(this.params.kernelSize, this.params.kernelSize),
            new this.cv.Point(-1, -1)
        );

        const temp = new this.cv.Mat();

        try {
            // 开运算：去除小噪点
            this.cv.morphologyEx(src, temp, this.cv.MORPH_OPEN, kernel, 
                new this.cv.Point(-1, -1), this.params.erosionIterations);
            
            // 闭运算：填充小孔洞
            this.cv.morphologyEx(temp, dst, this.cv.MORPH_CLOSE, kernel,
                new this.cv.Point(-1, -1), this.params.dilationIterations);
        } finally {
            kernel.delete();
            temp.delete();
        }
    }

    /**
     * 【优化】多特征污渍检测
     * 结合几何特征和孤立性评分，更准确区分文字和污渍
     */
    async _detectStains(binaryMask, originalImage) {
        const contours = new this.cv.MatVector();
        const hierarchy = new this.cv.Mat();
        const stainMask = new this.cv.Mat();
        stainMask.zeros(binaryMask.rows, binaryMask.cols, this.cv.CV_8UC1);

        try {
            // 查找轮廓
            this.cv.findContours(binaryMask, contours, hierarchy, 
                this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE);

            const totalContours = contours.size();
            
            // 计算整图面积用于归一化
            const imageArea = originalImage.rows * originalImage.cols;

            for (let i = 0; i < totalContours; i++) {
                const contour = contours.get(i);
                const area = this.cv.contourArea(contour);

                // 尺寸过滤
                if (area < this.params.minArea || area > this.params.maxArea) {
                    continue;
                }

                // 计算多种特征
                const features = this._calculateFeatures(contour, area, imageArea);
                
                // 综合评分
                const score = this._calculateStainScore(features);

                // 超过阈值则标记为污渍
                if (score >= this.params.stainThreshold) {
                    this.cv.drawContours(stainMask, contours, i, 
                        new this.cv.Scalar(255, 255, 255, 255), 
                        this.cv.FILLED);
                }
            }

            // 【优化】后处理：形态学膨胀连接相邻污渍区域
            const kernel = this.cv.getStructuringElement(
                this.cv.MORPH_ELLIPSE,
                new this.cv.Size(5, 5),
                new this.cv.Point(-1, -1)
            );
            this.cv.dilate(stainMask, stainMask, kernel, 
                new this.cv.Point(-1, -1), 1);
            kernel.delete();

            return stainMask;

        } finally {
            contours.delete();
            hierarchy.delete();
        }
    }

    /**
     * 【优化】计算轮廓特征
     */
    _calculateFeatures(contour, area, imageArea) {
        const perimeter = this.cv.arcLength(contour, true);
        const rect = this.cv.boundingRect(contour);
        const rectArea = rect.width * rect.height;
        
        // 最小外接圆
        const circle = this.cv.minEnclosingCircle(contour);
        const circleArea = Math.PI * circle.radius * circle.radius;

        // 1. 实心度 (Solidity): 轮廓面积 / 凸包面积
        const hull = new this.cv.Mat();
        this.cv.convexHull(contour, hull);
        const hullArea = this.cv.contourArea(hull);
        const solidity = hullArea > 0 ? area / hullArea : 0;
        hull.delete();

        // 2. 圆形度 (Circularity): 4π*area/perimeter²
        const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;

        // 3. 紧凑度 (Compactness): area / boundingRectArea
        const compactness = rectArea > 0 ? area / rectArea : 0;

        // 4. 【新增】孤立性 (Isolation): 评估轮廓周围空白程度
        // 通过计算轮廓到最近其他轮廓的距离来评估
        const isolation = this._calculateIsolation(contour, imageArea);

        // 5. 【新增】长宽比异常度
        const aspectRatio = rect.width / Math.max(rect.height, 1);
        const aspectRatioAnomaly = Math.abs(aspectRatio - 1); // 偏离正方形的程度

        return {
            solidity,
            circularity,
            compactness,
            isolation,
            aspectRatioAnomaly,
            area,
            areaRatio: area / imageArea
        };
    }

    /**
     * 【新增】计算孤立性分数
     * 污渍通常孤立于文字块之外
     */
    _calculateIsolation(contour, imageArea) {
        // 简化版本：基于轮廓面积占比和位置
        // TODO: 可实现更复杂的距离场分析
        const rect = this.cv.boundingRect(contour);
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        
        // 距离图像中心的归一化距离（污渍常在边缘）
        const distFromCenter = Math.sqrt(
            Math.pow(centerX - imageArea / 2, 2) + 
            Math.pow(centerY - imageArea / 2, 2)
        );
        const maxDist = Math.sqrt(Math.pow(imageArea, 2) * 2) / 2;
        const normalizedDist = distFromCenter / maxDist;

        // 简单启发式：边缘区域 + 小面积 = 高孤立性
        return Math.min(normalizedDist * 1.5, 1.0);
    }

    /**
     * 【优化】多特征加权评分
     */
    _calculateStainScore(features) {
        const w = this.params.weights;
        
        // 污渍特征：
        // - 高实心度（通常是实心斑点）
        // - 中等圆形度（不完全规则）
        // - 低紧凑度（不规则形状）
        // - 高孤立性（远离文字块）
        
        let score = 0;
        
        // 实心度贡献：污渍通常实心度高
        score += w.solidity * features.solidity;
        
        // 圆形度贡献：适度圆形（0.3-0.8之间得分高）
        const circularityScore = 1 - Math.abs(features.circularity - 0.5) * 2;
        score += w.circularity * Math.max(0, circularityScore);
        
        // 紧凑度贡献：低紧凑度（不规则）得分高
        score += w.compactness * (1 - features.compactness);
        
        // 孤立性贡献：高孤立性得分高
        score += w.isolation * features.isolation;

        // 【新增】面积惩罚：过大或过小都降低分数
        if (features.areaRatio > 0.05 || features.areaRatio < 0.0001) {
            score *= 0.7;
        }

        return Math.min(score, 1.0);
    }

    /**
     * 设置参数
     */
    setParams(newParams) {
        this.params = { ...this.params, ...newParams };
        if (newParams.weights) {
            this.params.weights = { ...this.params.weights, ...newParams.weights };
        }
    }

    /**
     * 获取当前参数
     */
    getParams() {
        return { ...this.params };
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocumentCleaner;
} else {
    window.DocumentCleaner = DocumentCleaner;
}
