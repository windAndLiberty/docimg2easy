/**
 * 性能监控器
 * 负责监控图像处理过程中的性能指标
 */

export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      fps: 0,
      frameTime: 0,
      memoryUsage: 0,
      cpuTime: 0,
      processCount: 0
    };
    
    this.startTime = 0;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    
    this.isMonitoring = false;
    this.animationFrameId = null;
    
    // 性能历史记录
    this.history = [];
    this.maxHistorySize = 100;
  }
  
  /**
   * 开始监控
   */
  start() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.frameCount = 0;
    
    this.monitor();
  }
  
  /**
   * 停止监控
   */
  stop() {
    this.isMonitoring = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * 监控循环
   */
  monitor() {
    if (!this.isMonitoring) return;
    
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    
    // 计算FPS
    this.metrics.fps = 1000 / deltaTime;
    this.metrics.frameTime = deltaTime;
    
    // 获取内存使用情况（如果浏览器支持）
    if (performance.memory) {
      this.metrics.memoryUsage = performance.memory.usedJSHeapSize / (1024 * 1024);
    }
    
    // 记录历史
    this.recordHistory();
    
    this.lastFrameTime = currentTime;
    this.frameCount++;
    
    // 继续监控
    this.animationFrameId = requestAnimationFrame(() => this.monitor());
  }
  
  /**
   * 记录历史
   */
  recordHistory() {
    this.history.push({
      timestamp: Date.now(),
      fps: this.metrics.fps,
      frameTime: this.metrics.frameTime,
      memoryUsage: this.metrics.memoryUsage
    });
    
    // 限制历史记录大小
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }
  
  /**
   * 开始计时任务
   * @param {string} taskName - 任务名称
   * @returns {Function} 结束计时函数
   */
  startTask(taskName) {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`[性能] ${taskName} 耗时: ${duration.toFixed(2)}ms`);
      
      return duration;
    };
  }
  
  /**
   * 测量函数执行时间
   * @param {Function} fn - 要测量的函数
   * @param {string} label - 标签
   * @returns {*} 函数返回值
   */
  measure(fn, label = 'Function') {
    const startTime = performance.now();
    const result = fn();
    const endTime = performance.now();
    
    console.log(`[性能] ${label} 耗时: ${(endTime - startTime).toFixed(2)}ms`);
    
    return result;
  }
  
  /**
   * 测量异步函数执行时间
   * @param {Function} fn - 要测量的异步函数
   * @param {string} label - 标签
   * @returns {Promise<*>} 函数返回值
   */
  async measureAsync(fn, label = 'Async Function') {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    
    console.log(`[性能] ${label} 耗时: ${(endTime - startTime).toFixed(2)}ms`);
    
    return result;
  }
  
  /**
   * 获取当前指标
   * @returns {Object} 性能指标
   */
  getMetrics() {
    return { ...this.metrics };
  }
  
  /**
   * 获取历史记录
   * @param {number} count - 获取数量
   * @returns {Array} 历史记录
   */
  getHistory(count = 10) {
    return this.history.slice(-count);
  }
  
  /**
   * 计算平均FPS
   * @param {number} sampleCount - 采样数量
   * @returns {number} 平均FPS
   */
  getAverageFPS(sampleCount = 30) {
    const samples = this.history.slice(-sampleCount);
    if (samples.length === 0) return 0;
    
    const sum = samples.reduce((acc, item) => acc + item.fps, 0);
    return sum / samples.length;
  }
  
  /**
   * 检测性能问题
   * @returns {Array} 性能问题列表
   */
  detectIssues() {
    const issues = [];
    
    // 检测低FPS
    const avgFPS = this.getAverageFPS();
    if (avgFPS < 30) {
      issues.push({
        type: 'low_fps',
        severity: 'warning',
        message: `FPS较低 (${avgFPS.toFixed(1)})`,
        suggestion: '考虑降低处理分辨率或减少处理频率'
      });
    }
    
    // 检测高内存使用
    if (this.metrics.memoryUsage > 500) {
      issues.push({
        type: 'high_memory',
        severity: 'warning',
        message: `内存使用较高 (${this.metrics.memoryUsage.toFixed(1)}MB)`,
        suggestion: '检查是否有内存泄漏，及时释放不需要的资源'
      });
    }
    
    // 检测长帧时间
    if (this.metrics.frameTime > 100) {
      issues.push({
        type: 'long_frame',
        severity: 'info',
        message: `帧时间较长 (${this.metrics.frameTime.toFixed(1)}ms)`,
        suggestion: '考虑使用Web Worker进行后台处理'
      });
    }
    
    return issues;
  }
  
  /**
   * 生成性能报告
   * @returns {Object} 性能报告
   */
  generateReport() {
    const avgFPS = this.getAverageFPS();
    const issues = this.detectIssues();
    
    return {
      summary: {
        averageFPS: avgFPS,
        currentMemory: this.metrics.memoryUsage,
        totalFrames: this.frameCount,
        monitoringDuration: performance.now() - this.startTime
      },
      metrics: this.getMetrics(),
      issues: issues,
      recommendations: this.getRecommendations(issues)
    };
  }
  
  /**
   * 获取优化建议
   * @param {Array} issues - 性能问题列表
   * @returns {Array} 优化建议
   */
  getRecommendations(issues) {
    const recommendations = [];
    
    for (const issue of issues) {
      recommendations.push({
        issue: issue.type,
        suggestion: issue.suggestion
      });
    }
    
    // 添加通用建议
    if (issues.length === 0) {
      recommendations.push({
        issue: 'none',
        suggestion: '性能表现良好'
      });
    }
    
    return recommendations;
  }
  
  /**
   * 重置监控器
   */
  reset() {
    this.metrics = {
      fps: 0,
      frameTime: 0,
      memoryUsage: 0,
      cpuTime: 0,
      processCount: 0
    };
    
    this.history = [];
    this.frameCount = 0;
    this.startTime = 0;
    this.lastFrameTime = 0;
  }
  
  /**
   * 显示性能面板
   * @param {HTMLElement} container - 容器元素
   */
  showPanel(container) {
    // 创建性能面板
    const panel = document.createElement('div');
    panel.id = 'performance-panel';
    panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 10px;
      border-radius: 5px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      min-width: 150px;
    `;
    
    container.appendChild(panel);
    
    // 更新面板内容
    const updatePanel = () => {
      const metrics = this.getMetrics();
      panel.innerHTML = `
        <div>FPS: ${metrics.fps.toFixed(1)}</div>
        <div>帧时间: ${metrics.frameTime.toFixed(1)}ms</div>
        <div>内存: ${metrics.memoryUsage.toFixed(1)}MB</div>
        <div>处理次数: ${this.metrics.processCount}</div>
      `;
    };
    
    // 定时更新
    this.panelInterval = setInterval(updatePanel, 500);
  }
  
  /**
   * 隐藏性能面板
   */
  hidePanel() {
    if (this.panelInterval) {
      clearInterval(this.panelInterval);
      this.panelInterval = null;
    }
    
    const panel = document.getElementById('performance-panel');
    if (panel) {
      panel.remove();
    }
  }
}