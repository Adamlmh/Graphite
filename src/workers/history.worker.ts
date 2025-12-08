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
): Promise<void> {
  const promises = Object.values(elements).map(async (element) => {
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

  try {
    // 0. 处理图片元素的 Blob URL 转换（重 CPU，在 Worker 中执行）
    if (msg.state.elements) {
      await processImageBlobUrls(msg.state.elements);
    }

    // 1. 序列化（重 CPU）
    const json = JSON.stringify(msg.state);

    // 2. 压缩（重 CPU）
    const compressed = compress(json);

    const response: WorkerSaveResponse = {
      type: 'save-done',
      snapshotId: msg.snapshotId,
      compressed,
    };

    // 3. 发送给主线程，主线程再写入 IndexedDB / localStorage
    self.postMessage(response);
  } catch (error) {
    console.error('Worker save error:', error);
    // 即使出错也发送响应，避免主线程永久等待
    self.postMessage({
      type: 'save-done',
      snapshotId: msg.snapshotId,
      compressed: '', // 空字符串表示失败
    });
  }
};
