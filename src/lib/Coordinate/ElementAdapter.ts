import type { Element, ElementType } from '../../types';
import type {
  IElementProvider,
  IViewportProvider,
  ICanvasDOMProvider,
  LocalPoint,
} from './CoordinateTransformer';

/**
 * Element 适配器 - 将项目中的 Element 对象适配为 IElementProvider 接口
 * 用于与 GeometryService 和 CoordinateTransformer 集成
 */
export class ElementAdapter implements IElementProvider {
  constructor(private element: Element) {}

  getPosition(): { x: number; y: number } {
    return {
      x: this.element.x,
      y: this.element.y,
    };
  }

  getSize(): { width: number; height: number } {
    return {
      width: this.element.width,
      height: this.element.height,
    };
  }

  getRotation(): number {
    return this.element.rotation;
  }

  getScale(): { scaleX: number; scaleY: number } {
    return {
      scaleX: this.element.transform.scaleX,
      scaleY: this.element.transform.scaleY,
    };
  }

  getPivot(): { pivotX: number; pivotY: number } {
    return {
      pivotX: this.element.transform.pivotX,
      pivotY: this.element.transform.pivotY,
    };
  }

  getType(): ElementType {
    return this.element.type;
  }

  getLocalPoints?(): LocalPoint[] {
    // 为三角形等多边形提供顶点坐标
    if (this.element.type === 'triangle') {
      const { width, height } = this.getSize();
      return [
        { x: width / 2, y: 0 }, // 顶部
        { x: width, y: height }, // 右下
        { x: 0, y: height }, // 左下
      ];
    }
    return [];
  }
}

/**
 * 视口适配器 - 提供视口缩放和偏移信息
 */
export class ViewportAdapter implements IViewportProvider {
  constructor(
    private getViewportState: () => {
      zoom: number;
      offset: { x: number; y: number };
    },
  ) {}

  getZoom(): number {
    return this.getViewportState().zoom;
  }

  getOffset(): { x: number; y: number } {
    return this.getViewportState().offset;
  }
}

/**
 * Canvas DOM 适配器 - 提供画布 DOM 元素的位置信息
 */
export class CanvasDOMAdapter implements ICanvasDOMProvider {
  constructor(private canvasElement: HTMLElement | (() => HTMLElement | null)) {}

  getCanvasRect(): DOMRect | { left: number; top: number; width: number; height: number } {
    const element =
      typeof this.canvasElement === 'function' ? this.canvasElement() : this.canvasElement;

    if (!element) {
      // 返回默认值，避免错误
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    return element.getBoundingClientRect();
  }
}
