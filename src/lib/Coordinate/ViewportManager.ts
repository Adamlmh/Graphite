/**
 * 视口管理模块（纯计算层）
 *
 * 职责：
 * 1. 计算视口对应的世界坐标边界（可见区域）
 * 2. 判断元素是否在可视区域内
 *
 * 注意：
 * - 不包含任何渲染层逻辑
 * - 不依赖 PixiJS 或其它具体渲染实现
 */

import type { IViewportProvider, ICanvasDOMProvider } from './CoordinateTransformer';
import { CoordinateTransformer } from './CoordinateTransformer';
import { ViewportProvider } from './providers/ViewportProvider';
import { CanvasDOMProvider } from './providers/CanvasDOMProvider';

/**
 * 边界框类型，用于表示矩形区域
 */
export interface Bounds {
  x: number; // 左上角X坐标
  y: number; // 左上角Y坐标
  width: number; // 宽度
  height: number; // 高度
}

/**
 * 视口状态提供者接口
 * 负责提供 viewport.zoom 和 viewport.offset
 * （复用 CoordinateTransformer 中的 IViewportProvider）
 */
export type IViewportStateProvider = IViewportProvider;

export class ViewportManager {
  private viewportProvider: IViewportStateProvider;
  private canvasDOMProvider: ICanvasDOMProvider;
  private coordinateTransformer: CoordinateTransformer;

  /**
   * 构造函数
   * @param coordinateTransformer 坐标转换器（用于坐标转换，可选，默认创建新的）
   * @param viewportProvider 视口状态提供者（可选，默认使用 ViewportProvider）
   * @param canvasDOMProvider 画布 DOM 提供者（可选，默认使用 CanvasDOMProvider）
   */
  constructor(
    coordinateTransformer?: CoordinateTransformer,
    viewportProvider?: IViewportStateProvider,
    canvasDOMProvider?: ICanvasDOMProvider,
  ) {
    // 如果没有传入提供者，使用默认实现（自动获取数据）
    this.viewportProvider = viewportProvider || new ViewportProvider();
    this.canvasDOMProvider = canvasDOMProvider || new CanvasDOMProvider();

    // 如果没有传入坐标转换器，使用默认提供者创建新的
    this.coordinateTransformer =
      coordinateTransformer ||
      new CoordinateTransformer(this.viewportProvider, this.canvasDOMProvider);
  }

  /**
   * 计算当前画布对应的世界坐标区域（可见世界边界）
   *
   * @returns 可见世界区域的边界框
   */
  public getVisibleWorldBounds(): Bounds {
    const canvasRect = this.canvasDOMProvider.getCanvasRect();
    const canvasWidth = canvasRect.width;
    const canvasHeight = canvasRect.height;

    // 获取画布四个角点的世界坐标（相对于画布的坐标）
    const topLeft = this.coordinateTransformer.canvasToWorld(0, 0);
    const topRight = this.coordinateTransformer.canvasToWorld(canvasWidth, 0);
    const bottomLeft = this.coordinateTransformer.canvasToWorld(0, canvasHeight);
    const bottomRight = this.coordinateTransformer.canvasToWorld(canvasWidth, canvasHeight);

    // 计算最小外接矩形
    const minX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * 判断元素是否在可视区域内
   *
   * @param elementBounds 元素边界框（世界坐标系）
   * @returns 如果元素在可视区域内返回 true，否则返回 false
   */
  public isElementVisible(elementBounds: Bounds): boolean {
    const visibleBounds = this.getVisibleWorldBounds();

    // 矩形相交判断（AABB）
    return (
      elementBounds.x < visibleBounds.x + visibleBounds.width &&
      elementBounds.x + elementBounds.width > visibleBounds.x &&
      elementBounds.y < visibleBounds.y + visibleBounds.height &&
      elementBounds.y + elementBounds.height > visibleBounds.y
    );
  }
}
