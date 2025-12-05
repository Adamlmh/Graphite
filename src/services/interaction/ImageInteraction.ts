// services/interaction/ImageInteraction.ts (完整修复版)
import { eventBus } from '../../lib/eventBus';
import { useCanvasStore } from '../../stores/canvas-store';
import { ElementFactory } from '../element-factory';
import { CoordinateTransformer } from '../../lib/Coordinate/CoordinateTransformer';
import { ImageCommand } from '../command/HistoryCommand';
import type { HistoryService } from '../HistoryService';
import type { Element } from '../../types/index';

export class ImageInteraction {
  private fileInputElement: HTMLInputElement | null = null;
  private isActive = false;
  private coordinateTransformer: CoordinateTransformer;
  private cancelCheckTimeout: number | null = null;
  private historyService: HistoryService | null = null;

  constructor(historyService?: HistoryService) {
    this.coordinateTransformer = new CoordinateTransformer();
    if (historyService) {
      this.historyService = historyService;
    }
    this.initFileInput();
    this.setupEventListeners();
  }

  /**
   * 设置历史服务
   */
  setHistoryService(historyService: HistoryService): void {
    this.historyService = historyService;
  }

  /**
   * 初始化隐藏的文件输入元素
   */
  private initFileInput(): void {
    this.fileInputElement = document.createElement('input');
    this.fileInputElement.type = 'file';
    this.fileInputElement.accept = 'image/png,image/jpeg,image/jpg,image/gif,image/webp';
    this.fileInputElement.style.display = 'none';
    document.body.appendChild(this.fileInputElement);

    // 监听文件选择事件
    this.fileInputElement.addEventListener('change', this.handleFileChange.bind(this));
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    // 监听图片工具触发事件
    eventBus.on('image:trigger-upload', this.triggerUpload.bind(this));
  }

  /**
   * 触发文件选择
   */
  public triggerUpload(): void {
    if (this.fileInputElement) {
      this.isActive = true;
      this.fileInputElement.click();

      const checkCancel = () => {
        this.cancelCheckTimeout = window.setTimeout(() => {
          if (this.isActive) {
            this.handleCancel();
          }
        }, 300);
      };

      // 监听窗口焦点事件
      window.addEventListener('focus', checkCancel, { once: true });
    }
  }

  /**
   * 处理用户取消选择
   */
  private handleCancel(): void {
    this.isActive = false;
    useCanvasStore.getState().setTool('select');
  }

  /**
   * 处理文件选择变化
   */
  private async handleFileChange(event: Event): Promise<void> {
    // 清除取消检查定时器
    if (this.cancelCheckTimeout !== null) {
      clearTimeout(this.cancelCheckTimeout);
      this.cancelCheckTimeout = null;
    }

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      this.isActive = false;
      // 用户取消选择，切换回选择工具
      useCanvasStore.getState().setTool('select');
      return;
    }

    try {
      // 读取图片文件并转换为 DataURL
      const dataUrl = await this.readFileAsDataURL(file);

      // 获取图片的实际尺寸
      const imageDimensions = await this.getImageDimensions(dataUrl);

      // 在画布中心创建图片元素
      await this.createImageElement(dataUrl, imageDimensions);
    } catch (error) {
      console.error('ImageInteraction: 图片处理失败', error);
      // 处理失败时切换回选择工具
      useCanvasStore.getState().setTool('select');
    } finally {
      // 清空 input 值，允许重复选择同一文件
      if (input) {
        input.value = '';
      }
      this.isActive = false;
    }
  }

  /**
   * 读取文件为 DataURL
   */
  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('读取文件失败：结果不是字符串'));
        }
      };

      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * 获取图片实际尺寸
   */
  private getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };

      img.onerror = () => {
        reject(new Error('加载图片失败'));
      };

      img.src = dataUrl;
    });
  }

  /**
   * 在视口中央创建图片元素
   */
  private async createImageElement(
    dataUrl: string,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    const store = useCanvasStore.getState();

    // 获取画布 DOM 边界 - 使用备用方案
    const rect = this.getCanvasRect();

    // 计算画布视口中心（屏幕坐标）
    const centerScreenX = rect.left + rect.width / 2;
    const centerScreenY = rect.top + rect.height / 2;

    // 转换为世界坐标
    const worldCenter = this.coordinateTransformer.screenToWorld(centerScreenX, centerScreenY);

    // 图片大小适配
    const maxSize = 500;
    const scale = Math.min(maxSize / dimensions.width, maxSize / dimensions.height, 1);

    const displayWidth = dimensions.width * scale;
    const displayHeight = dimensions.height * scale;

    // 左上角对齐
    const x = worldCenter.x - displayWidth / 2;
    const y = worldCenter.y - displayHeight / 2;

    const imageElement = ElementFactory.createImage(
      x,
      y,
      dataUrl,
      displayWidth,
      displayHeight,
      dimensions.width,
      dimensions.height,
    );

    // ZIndex + Store 操作
    const maxZ = Math.max(0, ...Object.values(store.elements).map((el) => el.zIndex));
    imageElement.zIndex = maxZ + 1;

    // 使用历史服务执行命令
    if (this.historyService) {
      await this.createImageWithHistory(imageElement);
    } else {
      // 降级处理：直接添加到画布
      store.addElement(imageElement);
    }

    store.setSelectedElements([imageElement.id]);

    // 切换回选择工具
    store.setTool('select');

    eventBus.emit('image:created', { elementId: imageElement.id });
  }

  /**
   * 获取画布边界 - 替代方案
   */
  private getCanvasRect(): DOMRect {
    // 尝试从 document 中查找 canvas 元素
    const canvasElement = document.querySelector('.canvas, .canvas-container, canvas');

    if (canvasElement) {
      return canvasElement.getBoundingClientRect();
    }

    // 如果没有找到，返回默认值
    console.warn('ImageInteraction: 无法获取画布边界，使用默认值');
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      right: window.innerWidth,
      bottom: window.innerHeight,
      x: 0,
      y: 0,
    } as DOMRect;
  }

  /**
   * 使用历史服务创建图片元素
   */
  private async createImageWithHistory(element: Element): Promise<void> {
    if (!this.historyService) {
      return;
    }

    try {
      // 创建命令
      const command = new ImageCommand(element, {
        addElement: (element: Element) => useCanvasStore.getState().addElement(element),
        deleteElement: (id: string) => useCanvasStore.getState().deleteElement(id),
      });

      // 通过历史服务执行命令
      await this.historyService.executeCommand(command);
    } catch (error) {
      console.error('通过历史服务创建图片元素失败:', error);
      // 降级处理：直接添加到画布
      useCanvasStore.getState().addElement(element);
    }
  }

  /**
   * 销毁交互实例
   */
  public destroy(): void {
    // 清除定时器
    if (this.cancelCheckTimeout !== null) {
      clearTimeout(this.cancelCheckTimeout);
      this.cancelCheckTimeout = null;
    }

    if (this.fileInputElement) {
      this.fileInputElement.removeEventListener('change', this.handleFileChange.bind(this));
      document.body.removeChild(this.fileInputElement);
      this.fileInputElement = null;
    }

    eventBus.off('image:trigger-upload', this.triggerUpload.bind(this));
  }
}
