/**
 * 工具栏控制器
 * 负责工具栏按钮的事件处理和状态管理
 */

export class ToolbarController {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.activeButton = null;
    this.persistentActiveButton = null; // 持久化激活的按钮（如框选按钮）
    
    this.init();
  }
  
  init() {
    // 绑定按钮事件
    document.getElementById('rotate180Btn').addEventListener('click', () => {
      this.executeAction('onRotate180', 'rotate180Btn');
    });
    
    document.getElementById('rotateLeftBtn').addEventListener('click', () => {
      this.executeAction('onRotateLeft', 'rotateLeftBtn');
    });
    
    document.getElementById('rotateRightBtn').addEventListener('click', () => {
      this.executeAction('onRotateRight', 'rotateRightBtn');
    });
    
    document.getElementById('cropBtn').addEventListener('click', () => {
      this.executeAction('onCrop', 'cropBtn');
    });
    
    document.getElementById('skewLeftBtn').addEventListener('click', () => {
      this.executeAction('onSkewLeft', 'skewLeftBtn');
    });
    
    document.getElementById('skewRightBtn').addEventListener('click', () => {
      this.executeAction('onSkewRight', 'skewRightBtn');
    });
    
    document.getElementById('undoBtn').addEventListener('click', () => {
      this.executeAction('onUndo', 'undoBtn');
    });
    
    document.getElementById('resetBtn').addEventListener('click', () => {
      this.executeAction('onReset', 'resetBtn');
    });
    
    document.getElementById('autoCorrectBtn').addEventListener('click', () => {
      this.executeAction('onAutoCorrect', 'autoCorrectBtn');
    });
    
    document.getElementById('autoRemoveBorderBtn').addEventListener('click', () => {
      this.executeAction('onAutoRemoveBorder', 'autoRemoveBorderBtn');
    });
    
    document.getElementById('autoCleanBtn').addEventListener('click', () => {
      this.executeAction('onAutoClean', 'autoCleanBtn');
    });
    
    document.getElementById('selectRegionBtn').addEventListener('click', () => {
      this.executeAction('onSelectRegion', 'selectRegionBtn');
    });
  }
  
  /**
   * 执行动作
   * @param {string} callbackName - 回调函数名称
   * @param {string} buttonId - 按钮ID
   */
  executeAction(callbackName, buttonId) {
    if (this.callbacks[callbackName]) {
      // 框选相关按钮的特殊处理
      const isSelectRegion = callbackName === 'onSelectRegion';
      const isRegionOperation = callbackName === 'onAutoRemoveBorder' || callbackName === 'onAutoClean';
      
      // 如果是框选按钮，切换持久化激活状态
      if (isSelectRegion) {
        if (this.persistentActiveButton === buttonId) {
          // 再次点击框选按钮，取消框选
          this.clearPersistentActiveButton();
          if (this.callbacks.onCancelSelection) {
            this.callbacks.onCancelSelection();
          }
          return;
        } else {
          // 进入框选模式
          this.setPersistentActiveButton(buttonId);
        }
      } else if (!isRegionOperation) {
        // 非框选相关操作，先取消框选
        if (this.callbacks.onCancelSelection) {
          this.callbacks.onCancelSelection();
        }
        // 设置临时激活状态
        this.setActiveButton(buttonId);
      } else {
        // 自动去黑边/自动去污操作，保持框选按钮的激活状态
        // 这些操作可以在有选区的情况下执行
        this.setActiveButton(buttonId);
      }
      
      // 执行回调
      this.callbacks[callbackName]();
    }
  }
  
  /**
   * 设置激活按钮（临时）
   * @param {string} buttonId - 按钮ID
   */
  setActiveButton(buttonId) {
    // 移除之前的临时激活状态
    if (this.activeButton && this.activeButton !== this.persistentActiveButton) {
      const prevBtn = document.getElementById(this.activeButton);
      if (prevBtn) {
        prevBtn.classList.remove('active');
      }
    }
    
    // 设置新的激活状态
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.classList.add('active');
      this.activeButton = buttonId;
      
      // 如果不是持久化激活的按钮，短暂显示后移除激活状态
      if (buttonId !== this.persistentActiveButton) {
        setTimeout(() => {
          btn.classList.remove('active');
          if (this.activeButton === buttonId) {
            this.activeButton = null;
          }
        }, 300);
      }
    }
  }
  
  /**
   * 设置持久化激活按钮（如框选按钮）
   * @param {string} buttonId - 按钮ID
   */
  setPersistentActiveButton(buttonId) {
    // 清除之前的持久化激活状态
    this.clearPersistentActiveButton();
    
    // 设置新的持久化激活状态
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.classList.add('active');
      this.persistentActiveButton = buttonId;
      this.activeButton = buttonId;
    }
  }
  
  /**
   * 清除持久化激活按钮状态
   */
  clearPersistentActiveButton() {
    if (this.persistentActiveButton) {
      const btn = document.getElementById(this.persistentActiveButton);
      if (btn) {
        btn.classList.remove('active');
      }
      this.persistentActiveButton = null;
      this.activeButton = null;
    }
  }
  
  /**
   * 启用所有按钮
   */
  enableAll() {
    const buttons = document.querySelectorAll('.toolbar button');
    buttons.forEach(btn => {
      btn.disabled = false;
    });
  }
  
  /**
   * 禁用所有按钮
   */
  disableAll() {
    const buttons = document.querySelectorAll('.toolbar button');
    buttons.forEach(btn => {
      btn.disabled = true;
    });
  }
  
  /**
   * 更新进度条
   * @param {number} percent - 进度百分比
   */
  updateProgress(percent) {
    const fill = document.querySelector('.progress-fill');
    if (fill) {
      fill.style.width = `${percent}%`;
    }
  }
  
  /**
   * 显示进度条
   */
  showProgress() {
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
      progressBar.style.display = 'block';
    }
  }
  
  /**
   * 隐藏进度条
   */
  hideProgress() {
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
      progressBar.style.display = 'none';
    }
  }
  
  /**
   * 显示状态消息
   * @param {string} message - 状态消息
   * @param {string} type - 消息类型 ('info', 'success', 'error', 'warning')
   */
  showMessage(message, type = 'info') {
    // 创建消息元素
    const msgElement = document.createElement('div');
    msgElement.className = `status-message ${type}`;
    msgElement.textContent = message;
    
    // 添加到页面
    const container = document.querySelector('.processing-panel');
    if (container) {
      container.appendChild(msgElement);
      
      // 自动消失
      setTimeout(() => {
        msgElement.remove();
      }, 3000);
    }
  }
}
