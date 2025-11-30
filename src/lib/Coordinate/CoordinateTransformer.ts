import type { ElementType } from '../../types';
import { CanvasDOMProvider } from './providers/CanvasDOMProvider';
import { ViewportProvider } from './providers/ViewportProvider';

/**
 * 坐标转换模块（CoordinateTransformer）
 *
 * 功能范围：
 * 1. 屏幕坐标 → 画布坐标（screenToCanvas）
 * 2. 画布坐标 → 世界坐标（canvasToWorld）
 * 3. 屏幕坐标 → 世界坐标（screenToWorld）
 * 4. 世界坐标 → 元素局部坐标（worldToLocal）
 * 5. 元素局部坐标 → 世界坐标（localToWorld）
 *
 */

/**
 * 视口提供者接口
 * 负责提供 viewport.zoom 和 viewport.offset
 */
export interface IViewportProvider {
  /**
   * 获取视口缩放级别（1.0 = 100%）
   */
  getZoom(): number;

  /**
   * 获取视口偏移量（世界坐标系）
   */
  getOffset(): { x: number; y: number };
}

/**
 * 画布 DOM 提供者接口
 * 负责提供 canvasRect（画布元素在屏幕上的位置和尺寸）
 */
export interface ICanvasDOMProvider {
  /**
   * 获取画布 DOM 元素的边界矩形
   */
  getCanvasRect(): DOMRect | { left: number; top: number; width: number; height: number };
}

/**
 * 元素提供者接口
 * 负责提供元素的几何变换属性
 */
export interface IElementProvider {
  /**
   * 获取元素的世界坐标位置（左上角）
   */
  getPosition(): { x: number; y: number };

  /**
   * 获取元素的尺寸
   */
  getSize(): { width: number; height: number };

  /**
   * 获取元素的旋转角度（度，0-360）
   */
  getRotation(): number;

  /**
   * 获取元素的缩放比例
   */
  getScale(): { scaleX: number; scaleY: number };

  /**
   * 获取元素的变换中心点（相对坐标，0-1）
   */
  getPivot(): { pivotX: number; pivotY: number };

  /**
   * 获取元素类型（rect/circle/triangle/text/...）
   */
  getType(): ElementType;

  /**
   * 可选：获取元素的局部顶点坐标
   * 用于自定义命中检测（例如三角形、任意多边形等）
   */
  getLocalPoints?(): LocalPoint[];
}

// ==================== 坐标点类型定义 ====================

/**
 * 屏幕坐标点（相对于浏览器视口的坐标）
 */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * 画布坐标点（相对于画布 DOM 元素左上角的坐标）
 */
export interface CanvasPoint {
  x: number;
  y: number;
}

/**
 * 世界坐标点（画布虚拟坐标系中的坐标）
 */
export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * 元素局部坐标点（相对于元素自身的坐标，考虑 pivot）
 */
export interface LocalPoint {
  x: number;
  y: number;
}

export class CoordinateTransformer {
  private viewportProvider: IViewportProvider;
  private canvasDOMProvider: ICanvasDOMProvider;

  /**
   * 构造函数
   * @param viewportProvider 视口提供者（可选，默认使用 ViewportProvider）
   * @param canvasDOMProvider 画布 DOM 提供者（可选，默认使用 CanvasDOMProvider）
   */
  constructor(viewportProvider?: IViewportProvider, canvasDOMProvider?: ICanvasDOMProvider) {
    // 如果没有传入提供者，使用默认实现（自动获取数据）
    this.viewportProvider = viewportProvider || new ViewportProvider();
    this.canvasDOMProvider = canvasDOMProvider || new CanvasDOMProvider();
  }

  /**
   * 屏幕坐标 → 画布坐标
   *
   * 转换公式：
   * canvasX = screenX - canvasRect.left
   * canvasY = screenY - canvasRect.top
   *
   * @param screenX 屏幕 X 坐标
   * @param screenY 屏幕 Y 坐标
   * @returns 画布坐标点
   */
  public screenToCanvas(screenX: number, screenY: number): CanvasPoint {
    const canvasRect = this.canvasDOMProvider.getCanvasRect();
    return {
      x: screenX - canvasRect.left,
      y: screenY - canvasRect.top,
    };
  }

  /**
   * 画布坐标 → 世界坐标
   * @param canvasX 画布 X 坐标
   * @param canvasY 画布 Y 坐标
   * @returns 世界坐标点
   */
  public canvasToWorld(canvasX: number, canvasY: number): WorldPoint {
    const zoom = this.viewportProvider.getZoom();
    const offset = this.viewportProvider.getOffset();
    console.log('CoordinateTransformer: canvasToWorld', { canvasX, canvasY, zoom, offset });
    return {
      x: (canvasX + offset.x) / zoom,
      y: (canvasY + offset.y) / zoom,
    };
  }

  /**
   * 屏幕坐标 → 世界坐标
   *
   * 组合转换：screenToCanvas + canvasToWorld
   *
   * @param screenX 屏幕 X 坐标
   * @param screenY 屏幕 Y 坐标
   * @returns 世界坐标点
   */
  public screenToWorld(screenX: number, screenY: number): WorldPoint {
    // const canvasPoint = this.screenToCanvas(screenX, screenY);
    return this.canvasToWorld(screenX, screenY);
  }

  /**
   * 世界坐标 → 元素局部坐标
   *
   * 转换步骤：
   * 1. 将世界坐标转换为相对于元素位置的坐标
   * 2. 考虑 pivot 点（将 pivot 作为原点）
   * 3. 应用逆旋转
   * 4. 应用逆缩放
   *
   * 变换矩阵（逆变换）：
   * - 平移到 pivot 点（相对于元素左上角）
   * - 逆旋转（-rotation）
   * - 逆缩放（1/scaleX, 1/scaleY）
   * - 平移回元素位置
   *
   * @param worldX 世界 X 坐标
   * @param worldY 世界 Y 坐标
   * @param elementProvider 元素提供者
   * @returns 元素局部坐标点
   */
  public worldToLocal(
    worldX: number,
    worldY: number,
    elementProvider: IElementProvider,
  ): LocalPoint {
    const position = elementProvider.getPosition();
    const size = elementProvider.getSize();
    const rotation = elementProvider.getRotation();
    const scale = elementProvider.getScale();
    const pivot = elementProvider.getPivot();

    // 1. 将世界坐标转换为相对于元素左上角的坐标
    let localX = worldX - position.x;
    let localY = worldY - position.y;

    // 2. 计算 pivot 点在元素坐标系中的绝对位置
    const pivotX = pivot.pivotX * size.width;
    const pivotY = pivot.pivotY * size.height;

    // 3. 将坐标原点移动到 pivot 点
    localX -= pivotX;
    localY -= pivotY;

    // 4. 应用逆旋转
    const rotationRad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    const rotatedX = localX * cos - localY * sin;
    const rotatedY = localX * sin + localY * cos;

    // 5. 应用逆缩放
    const finalX = rotatedX / scale.scaleX;
    const finalY = rotatedY / scale.scaleY;

    // 6. 将坐标原点移回 pivot 点（相对于元素左上角）
    return {
      x: finalX + pivotX,
      y: finalY + pivotY,
    };
  }

  /**
   * 元素局部坐标 → 世界坐标
   *
   * 转换步骤（worldToLocal 的逆变换）：
   * 1. 将局部坐标转换为相对于 pivot 的坐标
   * 2. 应用缩放
   * 3. 应用旋转
   * 4. 平移到世界坐标
   *
   * 变换矩阵：
   * - 平移到 pivot 点（相对于元素左上角）
   * - 缩放（scaleX, scaleY）
   * - 旋转（rotation）
   * - 平移到元素位置
   *
   * @param localX 元素局部 X 坐标
   * @param localY 元素局部 Y 坐标
   * @param elementProvider 元素提供者
   * @returns 世界坐标点
   */
  public localToWorld(
    localX: number,
    localY: number,
    elementProvider: IElementProvider,
  ): WorldPoint {
    const position = elementProvider.getPosition();
    const size = elementProvider.getSize();
    const rotation = elementProvider.getRotation();
    const scale = elementProvider.getScale();
    const pivot = elementProvider.getPivot();

    // 1. 计算 pivot 点在元素坐标系中的绝对位置
    const pivotX = pivot.pivotX * size.width;
    const pivotY = pivot.pivotY * size.height;

    // 2. 将坐标原点移动到 pivot 点
    let worldX = localX - pivotX;
    let worldY = localY - pivotY;

    // 3. 应用缩放
    worldX *= scale.scaleX;
    worldY *= scale.scaleY;

    // 4. 应用旋转（注意：rotation 是度，需要转换为弧度）
    const rotationRad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    const rotatedX = worldX * cos - worldY * sin;
    const rotatedY = worldX * sin + worldY * cos;

    // 5. 将坐标原点移回 pivot 点，并平移到元素位置
    worldX = rotatedX + pivotX + position.x;
    worldY = rotatedY + pivotY + position.y;

    return {
      x: worldX,
      y: worldY,
    };
  }
}
