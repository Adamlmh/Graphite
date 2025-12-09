import { compress } from 'lz-string';

export interface WorkerSaveRequest {
  type: 'save';
  snapshotId: string;
  state: {
    elements: Record<
      string,
      {
        type: string;
        src?: string;
        [key: string]: unknown;
      }
    >;
    viewport: unknown;
    selection: unknown;
    tool: unknown;
    version: string;
    schemaVersion: number;
    lastModified: number;
  };
  isFullSnapshot: boolean;
}

export interface WorkerSaveResponse {
  type: 'save-done';
  snapshotId: string;
  compressed: string;
}

// 维护当前正在处理的任务
let currentTask: {
  snapshotId: string;
  abortController: AbortController;
} | null = null;

/**
 * 将 Blob URL 转换为 DataURL（base64）
 * 在 Worker 中执行，不阻塞主线程
 */
async function blobUrlToDataURL(blobUrl: string): Promise<string> {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to data URL'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to convert blob URL to data URL:', error);
    // 如果转换失败，返回原始 URL（虽然可能无法恢复，但至少不会丢失引用）
    return blobUrl;
  }
}

/**
 * 处理图片元素的 Blob URL 转换
 */
async function processImageBlobUrls(
  elements: Record<string, { type: string; src?: string; [key: string]: unknown }>,
  signal?: AbortSignal,
): Promise<void> {
  const promises = Object.values(elements).map(async (element) => {
    // 检查是否被取消
    if (signal?.aborted) {
      return;
    }

    if (
      element.type === 'image' &&
      element.src &&
      typeof element.src === 'string' &&
      element.src.startsWith('blob:')
    ) {
      // 在 Worker 中转换 Blob URL 为 DataURL
      element.src = await blobUrlToDataURL(element.src);
    }
  });
  await Promise.all(promises);
}

self.onmessage = async (e: MessageEvent<WorkerSaveRequest>) => {
  const msg = e.data;
  if (msg.type !== 'save') return;

  // 如果有正在处理的任务，取消它（只保留最新的）
  if (currentTask) {
    console.log(`Worker: 取消旧任务 ${currentTask.snapshotId}，处理新任务 ${msg.snapshotId}`);
    currentTask.abortController.abort();
    currentTask = null;
  }

  // 创建新的 AbortController 用于取消当前任务
  const abortController = new AbortController();
  currentTask = {
    snapshotId: msg.snapshotId,
    abortController,
  };

  try {
    // 0. 处理图片元素的 Blob URL 转换（重 CPU，在 Worker 中执行）
    if (msg.state.elements) {
      // 检查是否被取消
      if (abortController.signal.aborted) {
        console.log(`Worker: 任务 ${msg.snapshotId} 在处理图片时被取消`);
        return;
      }
      await processImageBlobUrls(msg.state.elements, abortController.signal);
    }

    // 检查是否被取消
    if (abortController.signal.aborted) {
      console.log(`Worker: 任务 ${msg.snapshotId} 在序列化前被取消`);
      return;
    }

    // 1. 序列化（重 CPU）
    const json = JSON.stringify(msg.state);

    // 检查是否被取消
    if (abortController.signal.aborted) {
      console.log(`Worker: 任务 ${msg.snapshotId} 在压缩前被取消`);
      return;
    }

    // 2. 压缩（重 CPU）
    const compressed = compress(json);

    // 最后检查是否被取消
    if (abortController.signal.aborted) {
      console.log(`Worker: 任务 ${msg.snapshotId} 在发送前被取消`);
      return;
    }

    // 清除当前任务标记
    if (currentTask?.snapshotId === msg.snapshotId) {
      currentTask = null;
    }

    const response: WorkerSaveResponse = {
      type: 'save-done',
      snapshotId: msg.snapshotId,
      compressed,
    };

    // 3. 发送给主线程，主线程再写入 IndexedDB / localStorage
    self.postMessage(response);
  } catch (error) {
    // 如果是取消错误，不发送响应
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`Worker: 任务 ${msg.snapshotId} 被取消`);
      return;
    }

    console.error('Worker save error:', error);

    // 清除当前任务标记
    if (currentTask?.snapshotId === msg.snapshotId) {
      currentTask = null;
    }

    // 即使出错也发送响应，避免主线程永久等待
    self.postMessage({
      type: 'save-done',
      snapshotId: msg.snapshotId,
      compressed: '', // 空字符串表示失败
    });
  }
};
