import type { IElementProvider } from '../CoordinateTransformer';
import type { ElementType, Element } from '../../../types';
import { useCanvasStore } from '../../../stores/canvas-store';

/**
 * 元素提供者实现
 * 根据元素 ID 自动从 canvas-store 中获取元素数据
 * 无需外部传入元素对象，直接通过 ID 查询
 */
export class ElementProvider implements IElementProvider {
  private elementId: string;

  constructor(elementId: string) {
    this.elementId = elementId;
  }

  /**
   * 获取元素对象（内部方法）
   */
  private getElement(): Element | null {
    const element = useCanvasStore.getState().elements[this.elementId];
    return element || null;
  }

  /**
   * 获取元素的世界坐标位置（左上角）
   */
  getPosition(): { x: number; y: number } {
    const element = this.getElement();
    if (!element) {
      return { x: 0, y: 0 };
    }
    return { x: element.x, y: element.y };
  }

  /**
   * 获取元素的尺寸
   */
  getSize(): { width: number; height: number } {
    const element = this.getElement();
    if (!element) {
      return { width: 0, height: 0 };
    }
    return { width: element.width, height: element.height };
  }

  /**
   * 获取元素的旋转角度（度，0-360）
   */
  getRotation(): number {
    const element = this.getElement();
    return element?.rotation || 0;
  }

  /**
   * 获取元素的缩放比例
   */
  getScale(): { scaleX: number; scaleY: number } {
    const element = this.getElement();
    if (!element) {
      return { scaleX: 1, scaleY: 1 };
    }
    return {
      scaleX: element.transform.scaleX,
      scaleY: element.transform.scaleY,
    };
  }

  /**
   * 获取元素的变换中心点（相对坐标，0-1）
   */
  getPivot(): { pivotX: number; pivotY: number } {
    const element = this.getElement();
    if (!element) {
      return { pivotX: 0.5, pivotY: 0.5 };
    }
    return {
      pivotX: element.transform.pivotX,
      pivotY: element.transform.pivotY,
    };
  }

  /**
   * 获取元素类型（rect/circle/triangle/text/...）
   */
  getType(): ElementType {
    const element = this.getElement();
    return element?.type || 'rect';
  }

  /**
   * 更新元素 ID（用于动态切换）
   */
  updateElementId(elementId: string): void {
    this.elementId = elementId;
  }
}
