import type { ICanvasDOMProvider } from '../CoordinateTransformer';

/**
 * 画布 DOM 提供者实现
 * 自动从 CanvasRenderer 组件的容器 div 获取位置和尺寸
 * 直接通过 DOM 查询获取 .canvas-container 元素
 * 无需依赖 PixiJS 初始化状态，更可靠
 */
export class CanvasDOMProvider implements ICanvasDOMProvider {
  private cachedRect: DOMRect | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 16; // 缓存 16ms（一帧）
  private resizeObserver: ResizeObserver | null = null;
  private handleResize: () => void;
  private handleOrientationChange: () => void;
  private containerElement: HTMLElement | null = null;

  constructor() {
    // 保存回调函数引用，以便后续移除监听器
    this.handleResize = () => this.invalidateCache();
    this.handleOrientationChange = () => this.invalidateCache();

    // 监听窗口大小变化，清除缓存
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResize);
      window.addEventListener('orientationchange', this.handleOrientationChange);

      // 监听 DOM 变化，清除缓存
      if (typeof ResizeObserver !== 'undefined') {
        this.setupResizeObserver();
      }
    }
  }

  /**
   * 设置 ResizeObserver 监听容器尺寸变化
   */
  private setupResizeObserver(): void {
    // 延迟设置，确保容器已存在
    setTimeout(() => {
      const container = this.getCanvasContainer();
      if (container && !this.resizeObserver) {
        this.resizeObserver = new ResizeObserver(() => {
          this.invalidateCache();
        });
        this.resizeObserver.observe(container);
      }
    }, 100);
  }

  /**
   * 获取画布容器 DOM 元素
   * 直接通过 DOM 查询获取 .canvas-container 元素
   */
  private getCanvasContainer(): HTMLElement | null {
    // 如果已经缓存了容器元素，直接返回
    if (this.containerElement && document.contains(this.containerElement)) {
      return this.containerElement;
    }

    // 直接通过 DOM 查询获取容器元素
    const container = document.querySelector('.canvas-container') as HTMLElement;

    // 缓存容器元素引用
    if (container) {
      this.containerElement = container;
    }

    return container;
  }

  /**
   * 验证布局是否已完成
   * 如果 top 为 0 但 header 存在，说明布局可能未完成
   */
  private isLayoutReady(rect: DOMRect): boolean {
    // 如果 top 为 0，检查是否有 header
    if (rect.top === 0) {
      const header = document.querySelector('header');
      if (header) {
        const headerRect = header.getBoundingClientRect();
        // 如果 header 存在且有高度，但 canvas top 为 0，说明布局未完成
        if (headerRect.height > 0) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * 获取画布 DOM 元素的边界矩形
   * 使用 getBoundingClientRect() 获取相对于视口的位置
   *
   * 性能优化：使用缓存机制，在 16ms 内复用相同的 DOMRect
   * 布局检测：如果检测到布局未完成，会清除缓存并重新获取
   */
  getCanvasRect(): DOMRect {
    const container = this.getCanvasContainer();
    if (!container) {
      // 如果容器未找到，返回默认值
      return {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    }

    const now = performance.now();

    // 如果缓存有效，验证布局是否完成
    if (this.cachedRect && now - this.cacheTimestamp < this.CACHE_DURATION) {
      // 验证缓存的 rect 是否有效（布局是否完成）
      if (this.isLayoutReady(this.cachedRect)) {
        return this.cachedRect;
      } else {
        // 布局未完成，清除缓存
        this.invalidateCache();
      }
    }

    // 重新获取并缓存
    const rect = container.getBoundingClientRect();

    // 再次验证布局是否完成
    if (!this.isLayoutReady(rect)) {
      // 布局未完成，返回当前值但标记需要重新获取
      // 下次调用时会重新获取
      this.cachedRect = rect;
      this.cacheTimestamp = now - this.CACHE_DURATION; // 设置过期时间，强制下次重新获取
      return rect;
    }

    // 布局完成，正常缓存
    this.cachedRect = rect;
    this.cacheTimestamp = now;
    return this.cachedRect;
  }

  /**
   * 清除缓存，强制下次获取时重新计算
   */
  invalidateCache(): void {
    this.cachedRect = null;
    this.cacheTimestamp = 0;
  }

  /**
   * 销毁资源，清理事件监听器
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
      window.removeEventListener('orientationchange', this.handleOrientationChange);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.invalidateCache();
  }
}
