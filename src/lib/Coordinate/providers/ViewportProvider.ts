import type { IViewportProvider } from '../CoordinateTransformer';
import { useCanvasStore } from '../../../stores/canvas-store';

/**
 * 视口提供者实现
 * 自动从 canvas-store 中读取 viewport 状态
 * 无需外部传入参数，直接获取最新的视口信息
 */
export class ViewportProvider implements IViewportProvider {
  /**
   * 获取视口缩放级别（1.0 = 100%）
   */
  getZoom(): number {
    return useCanvasStore.getState().viewport.zoom;
  }

  /**
   * 获取视口偏移量（世界坐标系）
   */
  getOffset(): { x: number; y: number } {
    return useCanvasStore.getState().viewport.offset;
  }
}
