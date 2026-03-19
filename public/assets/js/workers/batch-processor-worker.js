/**
 * 批量处理 Web Worker
 * 处理多个图片的批量处理任务
 */

// 存储任务队列
let taskQueue = [];
let isProcessing = false;

// 处理消息
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'addTask':
      addTask(data);
      break;
    case 'start':
      startProcessing();
      break;
    case 'pause':
      pauseProcessing();
      break;
    case 'resume':
      resumeProcessing();
      break;
    case 'cancel':
      cancelProcessing();
      break;
    case 'getStatus':
      sendStatus();
      break;
  }
};

/**
 * 添加任务到队列
 * @param {Object} task - 任务对象
 */
function addTask(task) {
  taskQueue.push({
    id: task.id,
    data: task.data,
    operations: task.operations,
    status: 'pending',
    result: null,
    error: null
  });
  
  self.postMessage({
    type: 'taskAdded',
    taskId: task.id,
    queueLength: taskQueue.length
  });
}

/**
 * 开始处理
 */
async function startProcessing() {
  if (isProcessing) return;
  
  isProcessing = true;
  
  for (let i = 0; i < taskQueue.length; i++) {
    const task = taskQueue[i];
    
    if (task.status !== 'pending') continue;
    
    // 更新任务状态
    task.status = 'processing';
    
    // 发送进度更新
    self.postMessage({
      type: 'progress',
      taskId: task.id,
      index: i,
      total: taskQueue.length,
      status: 'processing'
    });
    
    try {
      // 执行处理
      const result = await processTask(task);
      task.result = result;
      task.status = 'completed';
      
      // 发送完成通知
      self.postMessage({
        type: 'taskComplete',
        taskId: task.id,
        result: result
      });
    } catch (error) {
      task.error = error.message;
      task.status = 'failed';
      
      // 发送错误通知
      self.postMessage({
        type: 'taskError',
        taskId: task.id,
        error: error.message
      });
    }
  }
  
  isProcessing = false;
  
  // 发送批量完成通知
  self.postMessage({
    type: 'batchComplete',
    results: taskQueue.map(t => ({
      id: t.id,
      status: t.status,
      result: t.result,
      error: t.error
    }))
  });
}

/**
 * 处理单个任务
 * @param {Object} task - 任务对象
 * @returns {Promise<Object>} 处理结果
 */
async function processTask(task) {
  // 这里需要动态加载图像处理Worker
  // 在实际实现中，可以将图像处理逻辑内联到这里
  // 或者使用其他方式实现
  
  return new Promise((resolve, reject) => {
    // 模拟处理过程
    // 实际实现中应该调用真正的图像处理函数
    
    const operations = task.operations;
    let result = task.data;
    
    // 执行每个操作
    for (const op of operations) {
      // 这里需要实现具体的图像处理逻辑
      // 由于Worker环境的限制，需要特殊处理
    }
    
    resolve(result);
  });
}

/**
 * 暂停处理
 */
function pauseProcessing() {
  isProcessing = false;
  self.postMessage({ type: 'paused' });
}

/**
 * 恢复处理
 */
function resumeProcessing() {
  if (!isProcessing) {
    startProcessing();
  }
}

/**
 * 取消处理
 */
function cancelProcessing() {
  isProcessing = false;
  taskQueue = [];
  self.postMessage({ type: 'cancelled' });
}

/**
 * 发送状态
 */
function sendStatus() {
  const status = {
    isProcessing: isProcessing,
    queueLength: taskQueue.length,
    pendingCount: taskQueue.filter(t => t.status === 'pending').length,
    completedCount: taskQueue.filter(t => t.status === 'completed').length,
    failedCount: taskQueue.filter(t => t.status === 'failed').length,
    tasks: taskQueue.map(t => ({
      id: t.id,
      status: t.status
    }))
  };
  
  self.postMessage({
    type: 'status',
    status: status
  });
}

/**
 * 优先处理某个任务
 * @param {string} taskId - 任务ID
 */
function prioritizeTask(taskId) {
  const index = taskQueue.findIndex(t => t.id === taskId);
  if (index > 0) {
    const task = taskQueue.splice(index, 1)[0];
    taskQueue.unshift(task);
    
    self.postMessage({
      type: 'taskPrioritized',
      taskId: taskId
    });
  }
}

/**
 * 移除任务
 * @param {string} taskId - 任务ID
 */
function removeTask(taskId) {
  const index = taskQueue.findIndex(t => t.id === taskId);
  if (index !== -1) {
    taskQueue.splice(index, 1);
    
    self.postMessage({
      type: 'taskRemoved',
      taskId: taskId
    });
  }
}