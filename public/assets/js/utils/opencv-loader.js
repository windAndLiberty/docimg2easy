/**
 * OpenCV.js 加载器
 * 负责加载和管理OpenCV.js库
 */

export class OpenCVLoader {
  constructor() {
    this.cv = null;
    this.isLoaded = false;
    this.isLoading = false;
    this.loadPromise = null;
    this.callbacks = [];
    
    // 本地地址
    this.cdnUrl = './lib/opencv/opencv.js';
  }
  
  /**
   * 加载OpenCV.js
   * @param {string} customUrl - 自定义URL（可选）
   * @returns {Promise} 加载完成的Promise
   */
  load(customUrl) {
    if (this.isLoaded) {
      return Promise.resolve(this.cv);
    }
    
    if (this.isLoading) {
      return this.loadPromise;
    }
    
    this.isLoading = true;
    
    this.loadPromise = new Promise((resolve, reject) => {
      // 检查是否已经存在cv对象
      if (typeof cv !== 'undefined' && cv.Mat) {
        this.cv = cv;
        this.isLoaded = true;
        this.isLoading = false;
        resolve(cv);
        return;
      }
      
      // 创建script标签
      const script = document.createElement('script');
      script.src = customUrl || this.cdnUrl;
      script.async = true;
      
      script.onload = () => {
        // 等待OpenCV.js初始化完成
        if (typeof cv !== 'undefined') {
          cv['onRuntimeInitialized'] = () => {
            this.cv = cv;
            this.isLoaded = true;
            this.isLoading = false;
            
            // 执行所有回调
            this.callbacks.forEach(cb => cb(cv));
            this.callbacks = [];
            
            resolve(cv);
          };
        } else {
          reject(new Error('OpenCV.js加载失败'));
        }
      };
      
      script.onerror = () => {
        this.isLoading = false;
        reject(new Error('OpenCV.js脚本加载失败'));
      };
      
      document.head.appendChild(script);
    });
    
    return this.loadPromise;
  }
  
  /**
   * 注册加载完成回调
   * @param {Function} callback - 回调函数
   */
  onReady(callback) {
    if (this.isLoaded) {
      callback(this.cv);
    } else {
      this.callbacks.push(callback);
    }
  }
  
  /**
   * 检查是否已加载
   * @returns {boolean} 是否已加载
   */
  isReady() {
    return this.isLoaded;
  }
  
  /**
   * 获取cv对象
   * @returns {Object} OpenCV对象
   */
  getCV() {
    if (!this.isLoaded) {
      throw new Error('OpenCV.js未加载完成');
    }
    return this.cv;
  }
  
  /**
   * 等待加载完成
   * @returns {Promise} 加载完成的Promise
   */
  async waitReady() {
    if (this.isLoaded) {
      return this.cv;
    }
    
    if (this.isLoading) {
      return this.loadPromise;
    }
    
    return this.load();
  }
}

// 创建全局实例
export const opencvLoader = new OpenCVLoader();

// 全局初始化函数
window.onOpenCvReady = function() {
  if (typeof cv !== 'undefined') {
    cv['onRuntimeInitialized'] = () => {
      console.log('OpenCV.js 初始化完成');
      // 触发自定义事件
      window.dispatchEvent(new CustomEvent('opencv-ready'));
    };
  }
};