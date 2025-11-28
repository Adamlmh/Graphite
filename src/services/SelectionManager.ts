import type { Element, Point } from '../types';
import { CoordinateTransformer } from '../lib/Coordinate/CoordinateTransformer';
import { GeometryService } from '../lib/Coordinate/GeometryService';
import {
  ElementAdapter,
  ViewportAdapter,
  CanvasDOMAdapter,
} from '../lib/Coordinate/ElementAdapter';

/**
 * 选择管理器 - 处理画布点击事件和元素选择逻辑
 */
export class SelectionManager {
  private coordinateTransformer: CoordinateTransformer;
  private geometryService: GeometryService;
  private viewportAdapter: ViewportAdapter;
  private canvasDOMAdapter: CanvasDOMAdapter;

  constructor(
    getViewportState: () => { zoom: number; offset: { x: number; y: number } },
    getCanvasElement: () => HTMLElement | null,
  ) {
    // 创建适配器
    this.viewportAdapter = new ViewportAdapter(getViewportState);
    this.canvasDOMAdapter = new CanvasDOMAdapter(getCanvasElement);

    // 创建坐标转换器和几何服务
    this.coordinateTransformer = new CoordinateTransformer(
      this.viewportAdapter,
      this.canvasDOMAdapter,
    );
    this.geometryService = new GeometryService(this.coordinateTransformer);
  }

  /**
   * 处理画布点击事件，返回被点击的元素
   * @param screenPoint 屏幕坐标点击位置
   * @param elements 所有元素列表（按 zIndex 排序，最高层级在前）
   * @returns 被点击的元素，如果没有点击到任何元素则返回 null
   */
  public handleClick(screenPoint: Point, elements: Element[]): Element | null {
    try {
      console.log('SelectionManager: 处理点击事件', { screenPoint, elementCount: elements.length });

      // 此处无需将屏幕坐标转换为世界坐标，因为传进来的就是直接相对于画布的世界坐标
      const worldPoint = { x: screenPoint.x, y: screenPoint.y };
      console.log('SelectionManager: 坐标转换', { screenPoint, worldPoint });

      // 按 zIndex 从高到低排序，优先检测上层元素
      const sortedElements = [...elements].sort((a, b) => b.zIndex - a.zIndex);
      console.log(
        'SelectionManager: 排序后的元素',
        sortedElements.map((e) => ({ id: e.id, x: e.x, y: e.y, width: e.width, height: e.height })),
      );

      // 遍历所有元素，找到第一个被点击的元素
      for (const element of sortedElements) {
        // 跳过隐藏的元素
        if (element.visibility === 'hidden') {
          continue;
        }

        const elementAdapter = new ElementAdapter(element);
        const isHit = this.geometryService.isPointInElement(worldPoint, elementAdapter);
        console.log('SelectionManager: 检测元素', {
          elementId: element.id,
          elementBounds: {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
          },
          isHit,
        });

        if (isHit) {
          console.log('SelectionManager: 找到被点击的元素', element.id);
          return element;
        }
      }

      console.log('SelectionManager: 没有点击到任何元素');
      return null; // 没有点击到任何元素
    } catch (error) {
      console.error('SelectionManager: 处理点击事件时发生错误:', error);
      return null;
    }
  }

  /**
   * 检测元素是否在矩形选择区域内
   * @param selectionRect 选择矩形（世界坐标）
   * @param elements 要检测的元素列表
   * @returns 在选择区域内的元素列表
   */
  public getElementsInRect(
    selectionRect: { x: number; y: number; width: number; height: number },
    elements: Element[],
  ): Element[] {
    const selectedElements: Element[] = [];

    try {
      for (const element of elements) {
        if (element.visibility === 'hidden') {
          continue;
        }

        const elementAdapter = new ElementAdapter(element);
        const elementBounds = this.geometryService.getElementBoundsWorld(elementAdapter);

        // 检测元素边界框是否与选择矩形相交
        if (this.isRectIntersect(selectionRect, elementBounds)) {
          selectedElements.push(element);
        }
      }
    } catch (error) {
      console.error('SelectionManager: 处理矩形选择时发生错误:', error);
    }

    return selectedElements;
  }

  /**
   * 检测两个矩形是否相交
   */
  private isRectIntersect(
    rect1: { x: number; y: number; width: number; height: number },
    rect2: { x: number; y: number; width: number; height: number },
  ): boolean {
    return !(
      rect1.x + rect1.width < rect2.x ||
      rect2.x + rect2.width < rect1.x ||
      rect1.y + rect1.height < rect2.y ||
      rect2.y + rect2.height < rect1.y
    );
  }

  /**
   * 获取坐标转换器实例（供外部使用）
   */
  public getCoordinateTransformer(): CoordinateTransformer {
    return this.coordinateTransformer;
  }

  /**
   * 获取几何服务实例（供外部使用）
   */
  public getGeometryService(): GeometryService {
    return this.geometryService;
  }
}
