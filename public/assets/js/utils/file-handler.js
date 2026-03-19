/**
 * 文件处理器
 * 负责文件的读取、保存等操作
 */

export class FileHandler {
  constructor() {
    this.cv = window.cv;
    this.supportedTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/webp'];
  }
  
  /**
   * 加载图片文件
   * @param {File} file - 文件对象
   * @returns {Promise<cv.Mat>} OpenCV Mat对象
   */
  async loadImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!this.supportedTypes.includes(file.type)) {
        reject(new Error(`不支持的文件类型: ${file.type}`));
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onload = () => {
          // 验证图像尺寸
          if (img.width === 0 || img.height === 0) {
            reject(new Error('图片尺寸无效'));
            return;
          }
          
          // 验证图像尺寸是否在合理范围内
          const MAX_DIMENSION = 20000;
          if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
            reject(new Error(`图片尺寸过大: ${img.width}x${img.height}，最大支持 ${MAX_DIMENSION}px`));
            return;
          }
          
          // 验证 cv 对象是否存在
          if (!this.cv) {
            reject(new Error('OpenCV 库未加载'));
            return;
          }
          
          // 创建Canvas并绘制图像
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建 Canvas 上下文'));
            return;
          }
          
          ctx.drawImage(img, 0, 0);
          
          try {
            // 转换为OpenCV Mat
            const mat = this.cv.imread(canvas);
            
            // 验证 Mat 是否创建成功
            if (!mat || mat.empty()) {
              reject(new Error('图片转换为 Mat 失败'));
              return;
            }
            
            resolve(mat);
          } catch (error) {
            // 提供更详细的错误信息
            const errorMsg = error.message || String(error);
            if (errorMsg.includes('index out of bounds') || errorMsg.includes('range')) {
              reject(new Error(`OpenCV处理图片失败: 图片尺寸 ${img.width}x${img.height} 可能超出处理范围`));
            } else {
              reject(new Error('OpenCV处理图片失败: ' + errorMsg));
            }
          }
        };
        
        img.onerror = () => {
          reject(new Error('图片加载失败'));
        };
        
        img.src = e.target.result;
      };
      
      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };
      
      reader.readAsDataURL(file);
    });
  }
  
  /**
   * 从URL加载图片
   * @param {string} url - 图片URL
   * @returns {Promise<cv.Mat>} OpenCV Mat对象
   */
  async loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const mat = this.cv.imread(canvas);
        resolve(mat);
      };
      
      img.onerror = () => {
        reject(new Error('图片加载失败'));
      };
      
      img.src = url;
    });
  }
  
  /**
   * 保存图片
   * @param {cv.Mat} mat - OpenCV Mat对象
   * @param {string} filename - 文件名
   * @param {string} format - 格式 ('png', 'jpeg')
   * @param {number} quality - 质量（0-1，仅对jpeg有效）
   */
  saveImage(mat, filename, format = 'png', quality = 0.92) {
    const canvas = document.createElement('canvas');
    canvas.width = mat.cols;
    canvas.height = mat.rows;
    
    this.cv.imshow(canvas, mat);
    
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mimeType, quality);
    
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename || `image.${format}`;
    link.click();
  }
  
  /**
   * 导出为Blob
   * @param {cv.Mat} mat - OpenCV Mat对象
   * @param {string} format - 格式 ('png', 'jpeg')
   * @param {number} quality - 质量（0-1）
   * @returns {Promise<Blob>} Blob对象
   */
  async exportAsBlob(mat, format = 'png', quality = 0.92) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = mat.cols;
      canvas.height = mat.rows;
      
      this.cv.imshow(canvas, mat);
      
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      canvas.toBlob((blob) => {
        resolve(blob);
      }, mimeType, quality);
    });
  }
  
  /**
   * 批量加载图片
   * @param {FileList} files - 文件列表
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Array>} 图片数组
   */
  async loadBatch(files, onProgress) {
    const results = [];
    const total = files.length;
    
    for (let i = 0; i < total; i++) {
      try {
        const mat = await this.loadImageFile(files[i]);
        results.push({
          file: files[i],
          mat: mat,
          name: files[i].name,
          success: true
        });
      } catch (error) {
        results.push({
          file: files[i],
          mat: null,
          name: files[i].name,
          success: false,
          error: error.message
        });
      }
      
      if (onProgress) {
        onProgress(i + 1, total);
      }
    }
    
    return results;
  }
  
  /**
   * 创建缩略图
   * @param {cv.Mat} mat - 源图像
   * @param {number} maxSize - 最大尺寸
   * @returns {cv.Mat} 缩略图
   */
  createThumbnail(mat, maxSize = 100) {
    const scale = Math.min(maxSize / mat.cols, maxSize / mat.rows);
    const width = Math.round(mat.cols * scale);
    const height = Math.round(mat.rows * scale);
    
    const dst = new this.cv.Mat();
    const dsize = new this.cv.Size(width, height);
    this.cv.resize(mat, dst, dsize, 0, 0, this.cv.INTER_AREA);
    
    return dst;
  }
  
  /**
   * 获取图片信息
   * @param {cv.Mat} mat - OpenCV Mat对象
   * @returns {Object} 图片信息
   */
  getImageInfo(mat) {
    return {
      width: mat.cols,
      height: mat.rows,
      channels: mat.channels(),
      depth: mat.depth(),
      type: this.getMatType(mat),
      size: mat.rows * mat.cols * mat.channels()
    };
  }
  
  /**
   * 获取Mat类型描述
   * @param {cv.Mat} mat - OpenCV Mat对象
   * @returns {string} 类型描述
   */
  getMatType(mat) {
    const typeMap = {
      [this.cv.CV_8U]: 'CV_8U',
      [this.cv.CV_8S]: 'CV_8S',
      [this.cv.CV_16U]: 'CV_16U',
      [this.cv.CV_16S]: 'CV_16S',
      [this.cv.CV_32S]: 'CV_32S',
      [this.cv.CV_32F]: 'CV_32F',
      [this.cv.CV_64F]: 'CV_64F'
    };
    
    const depth = mat.depth();
    return typeMap[depth] || `Unknown (${depth})`;
  }
  
  /**
   * 验证文件类型
   * @param {File} file - 文件对象
   * @returns {boolean} 是否为支持的图片类型
   */
  isValidImageType(file) {
    return this.supportedTypes.includes(file.type);
  }
  
  /**
   * 解析文件名（去除扩展名）
   * @param {string} filename - 文件名
   * @returns {string} 不含扩展名的文件名
   */
  getFileNameWithoutExtension(filename) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(0, lastDot) : filename;
  }
  
  /**
   * 获取文件扩展名
   * @param {string} filename - 文件名
   * @returns {string} 扩展名
   */
  getFileExtension(filename) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(lastDot + 1).toLowerCase() : '';
  }
}