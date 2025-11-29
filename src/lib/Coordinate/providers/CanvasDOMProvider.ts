import type { ICanvasDOMProvider } from '../CoordinateTransformer';
import { getPixiApp } from '../../pixiApp';

/**
 * 画布 DOM 提供者实现
 * 自动从 CanvasRenderer 组件的容器 div 获取位置和尺寸
 * 通过 pixiApp.canvas 的 parentElement 找到容器 div（canvas-container）
 * 无需外部传入 DOM 元素，自动查找画布容器
 */
export class CanvasDOMProvider implements ICanvasDOMProvider {
  private cachedRect: DOMRect | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 16; // 缓存 16ms（一帧）

  /**
   * 获取画布容器 DOM 元素
   * 通过 pixiApp.canvas 的 parentElement 找到容器 div
   */
  private getCanvasContainer(): HTMLElement | null {
    const pixiApp = getPixiApp();
    if (!pixiApp) {
      return null;
    }

    const canvas = pixiApp.canvas as HTMLCanvasElement;
    if (!canvas) {
      return null;
    }

    // canvas 的 parentElement 就是 CanvasRenderer 的容器 div
    return canvas.parentElement;
  }

  /**
   * 获取画布 DOM 元素的边界矩形
   * 使用 getBoundingClientRect() 获取相对于视口的位置
   *
   * 性能优化：使用缓存机制，在 16ms 内复用相同的 DOMRect
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

    // 如果缓存有效，直接返回
    if (this.cachedRect && now - this.cacheTimestamp < this.CACHE_DURATION) {
      return this.cachedRect;
    }

    // 重新获取并缓存
    this.cachedRect = container.getBoundingClientRect();
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
}
