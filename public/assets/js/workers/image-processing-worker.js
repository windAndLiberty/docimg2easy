/**
 * 图像处理 Web Worker
 * 在后台线程中执行图像处理任务，避免阻塞主线程
 * 
 * 注意：此 Worker 不再加载 OpenCV.js，因为会导致与主线程冲突
 * 图像处理现在完全在主线程中执行
 */

// 标记 Worker 已就绪
console.log('Worker: 图像处理 Worker 已就绪（无 OpenCV）');
self.postMessage({ type: 'worker-ready' });

// 简单的错误响应
self.onmessage = function(e) {
  if (e.data.type === 'init' || e.data.type === 'process') {
    // 返回错误，告诉主线程 Worker 不再支持
    self.postMessage({ 
      type: 'error', 
      message: '图像处理现在完全在主线程中执行，Worker 不再需要' 
    });
  }
};

/**
 * 处理图像
 * @param {Object} data - 处理数据
 */
function processImage(data) {
  const { taskId, operation, imageData, params } = data;
  
  try {
    // 从ImageData创建Mat
    const mat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
    mat.data.set(new Uint8Array(imageData.data));
    
    let result;
    
    // 根据操作类型执行不同的处理
    switch (operation) {
      case 'rotate':
        result = rotateImage(mat, params.angle);
        break;
      case 'crop':
        result = cropImage(mat, params.rect);
        break;
      case 'gray':
        result = toGray(mat);
        break;
      case 'blur':
        result = blurImage(mat, params.kernelSize);
        break;
      case 'threshold':
        result = thresholdImage(mat, params.threshold, params.adaptive);
        break;
      case 'canny':
        result = cannyEdge(mat, params.threshold1, params.threshold2);
        break;
      case 'angleCorrect':
        result = angleCorrect(mat);
        break;
      case 'removeBorder':
        result = removeBorder(mat);
        break;
      case 'cleanDocument':
        result = cleanDocument(mat);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
    
    // 将结果转换回ImageData
    const resultImageData = matToImageData(result);
    
    // 发送结果
    self.postMessage({
      type: 'result',
      taskId: taskId,
      result: resultImageData
    });
    
    // 释放内存
    mat.delete();
    result.delete();
    
  } catch (error) {
    self.postMessage({
      type: 'error',
      taskId: taskId,
      message: error.message
    });
  }
}

/**
 * 旋转图像
 */
function rotateImage(mat, angle) {
  const dst = new cv.Mat();
  const dsize = new cv.Size(mat.cols, mat.rows);
  const center = new cv.Point(mat.cols / 2, mat.rows / 2);
  const M = cv.getRotationMatrix2D(center, angle, 1);
  cv.warpAffine(mat, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  M.delete();
  return dst;
}

/**
 * 裁剪图像
 */
function cropImage(mat, rect) {
  const roi = mat.roi(new cv.Rect(rect.x, rect.y, rect.width, rect.height));
  const dst = roi.clone();
  roi.delete();
  return dst;
}

/**
 * 转换为灰度图
 */
function toGray(mat) {
  const dst = new cv.Mat();
  if (mat.channels() === 4) {
    const temp = new cv.Mat();
    cv.cvtColor(mat, temp, cv.COLOR_RGBA2RGB);
    cv.cvtColor(temp, dst, cv.COLOR_RGB2GRAY);
    temp.delete();
  } else {
    cv.cvtColor(mat, dst, cv.COLOR_RGB2GRAY);
  }
  return dst;
}

/**
 * 模糊图像
 */
function blurImage(mat, kernelSize) {
  const dst = new cv.Mat();
  const ksize = new cv.Size(kernelSize, kernelSize);
  cv.GaussianBlur(mat, dst, ksize, 0);
  return dst;
}

/**
 * 二值化
 */
function thresholdImage(mat, threshold, adaptive) {
  const gray = toGray(mat);
  const dst = new cv.Mat();
  
  if (adaptive) {
    cv.adaptiveThreshold(gray, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
  } else {
    cv.threshold(gray, dst, threshold, 255, cv.THRESH_BINARY);
  }
  
  gray.delete();
  return dst;
}

/**
 * Canny边缘检测
 */
function cannyEdge(mat, threshold1, threshold2) {
  const gray = toGray(mat);
  const dst = new cv.Mat();
  cv.Canny(gray, dst, threshold1, threshold2);
  gray.delete();
  return dst;
}

/**
 * 角度校正
 */
function angleCorrect(mat) {
  // 计算角度
  const gray = toGray(mat);
  const blurred = new cv.Mat();
  const ksize = new cv.Size(5, 5);
  cv.GaussianBlur(gray, blurred, ksize, 0);
  gray.delete();
  
  const edges = new cv.Mat();
  cv.Canny(blurred, edges, 50, 150);
  blurred.delete();
  
  const lines = new cv.Mat();
  cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 100, 100, 10);
  edges.delete();
  
  let angle = 0;
  if (lines.rows > 0) {
    const angles = [];
    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4];
      const y1 = lines.data32S[i * 4 + 1];
      const x2 = lines.data32S[i * 4 + 2];
      const y2 = lines.data32S[i * 4 + 3];
      
      let a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      if (a > 45) a -= 90;
      else if (a < -45) a += 90;
      
      if (Math.abs(a) <= 5) {
        angles.push(a);
      }
    }
    lines.delete();
    
    if (angles.length > 0) {
      angles.sort((a, b) => a - b);
      angle = angles[Math.floor(angles.length / 2)];
    }
  }
  
  // 旋转校正
  return rotateImage(mat, angle);
}

/**
 * 移除边框
 */
function removeBorder(mat) {
  const gray = toGray(mat);
  const binary = new cv.Mat();
  cv.threshold(gray, binary, 30, 255, cv.THRESH_BINARY);
  gray.delete();
  
  const inverted = new cv.Mat();
  cv.bitwise_not(binary, inverted);
  binary.delete();
  
  // 检测四边
  const top = detectTopBorder(inverted);
  const bottom = detectBottomBorder(inverted);
  const left = detectLeftBorder(inverted);
  const right = detectRightBorder(inverted);
  
  inverted.delete();
  
  // 裁剪
  const rect = {
    x: left,
    y: top,
    width: mat.cols - left - right,
    height: mat.rows - top - bottom
  };
  
  return cropImage(mat, rect);
}

function detectTopBorder(mat) {
  for (let y = 0; y < Math.min(mat.rows * 0.3, 200); y++) {
    let count = 0;
    for (let x = 0; x < mat.cols; x++) {
      if (mat.ucharAt(y, x) > 128) count++;
    }
    if (count / mat.cols <= 0.9) return y;
  }
  return 0;
}

function detectBottomBorder(mat) {
  for (let y = mat.rows - 1; y >= mat.rows * 0.7; y--) {
    let count = 0;
    for (let x = 0; x < mat.cols; x++) {
      if (mat.ucharAt(y, x) > 128) count++;
    }
    if (count / mat.cols <= 0.9) return mat.rows - 1 - y;
  }
  return 0;
}

function detectLeftBorder(mat) {
  for (let x = 0; x < Math.min(mat.cols * 0.3, 200); x++) {
    let count = 0;
    for (let y = 0; y < mat.rows; y++) {
      if (mat.ucharAt(y, x) > 128) count++;
    }
    if (count / mat.rows <= 0.9) return x;
  }
  return 0;
}

function detectRightBorder(mat) {
  for (let x = mat.cols - 1; x >= mat.cols * 0.7; x--) {
    let count = 0;
    for (let y = 0; y < mat.rows; y++) {
      if (mat.ucharAt(y, x) > 128) count++;
    }
    if (count / mat.rows <= 0.9) return mat.cols - 1 - x;
  }
  return 0;
}

/**
 * 清理文档
 */
function cleanDocument(mat) {
  const gray = toGray(mat);
  const blurred = new cv.Mat();
  const ksize = new cv.Size(5, 5);
  cv.GaussianBlur(gray, blurred, ksize, 0);
  gray.delete();
  
  const binary = new cv.Mat();
  cv.adaptiveThreshold(blurred, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
  blurred.delete();
  
  const inverted = new cv.Mat();
  cv.bitwise_not(binary, inverted);
  binary.delete();
  
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  const cleaned = new cv.Mat();
  cv.morphologyEx(inverted, cleaned, cv.MORPH_OPEN, kernel);
  inverted.delete();
  kernel.delete();
  
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(cleaned, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  cleaned.delete();
  
  const mask = new cv.Mat.zeros(mat.rows, mat.cols, cv.CV_8UC1);
  
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    
    if (area >= 100 && area <= 10000) {
      const hull = new cv.Mat();
      cv.convexHull(contour, hull, false, false);
      const hullArea = cv.contourArea(hull);
      const solidity = hullArea > 0 ? area / hullArea : 0;
      hull.delete();
      
      if (solidity > 0.8) {
        cv.drawContours(mask, contours, i, new cv.Scalar(255), -1);
      }
    }
  }
  
  contours.delete();
  hierarchy.delete();
  
  const dilatedMask = new cv.Mat();
  const dilateKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.dilate(mask, dilatedMask, dilateKernel);
  mask.delete();
  dilateKernel.delete();
  
  const result = new cv.Mat();
  cv.inpaint(mat, dilatedMask, result, 3, cv.INPAINT_TELEA);
  dilatedMask.delete();
  
  return result;
}

/**
 * 将Mat转换为ImageData
 */
function matToImageData(mat) {
  const canvas = new OffscreenCanvas(mat.cols, mat.rows);
  cv.imshow(canvas, mat);
  const ctx = canvas.getContext('2d');
  return ctx.getImageData(0, 0, mat.cols, mat.rows);
}