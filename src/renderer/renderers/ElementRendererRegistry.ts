// renderer/renderers/ElementRendererRegistry.ts
import type { Element, ElementType } from '../../types/index';
import { type IElementRenderer } from '../../types/render.types';
import { ResourceManager } from '../resources/ResourceManager';
import { CircleRenderer } from './CircleRenderer';
import { ImageRenderer } from './ImageRenderer';
import { RectangleRenderer } from './RectangleRenderer';
import { TextRenderer } from './TextRenderer';
import { TriangleRenderer } from './TriangleRenderer';

/**
 * 元素渲染器注册表 - 负责管理和分发各种元素类型的渲染器
 * 职责：根据元素类型选择对应的渲染器，提供统一的渲染接口
 */
export class ElementRendererRegistry {
  private renderers: Map<ElementType, IElementRenderer> = new Map();
  private resourceManager: ResourceManager;

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
    this.initializeRenderers();
  }

  /**
   * 初始化所有元素渲染器
   */
  private initializeRenderers(): void {
    // 注册矩形渲染器
    this.registerRenderer('rect', new RectangleRenderer(this.resourceManager));
    // 注册圆形渲染器
    this.registerRenderer('circle', new CircleRenderer(this.resourceManager));
    // 注册三角形渲染器
    this.registerRenderer('triangle', new TriangleRenderer(this.resourceManager));
    // 注册文本渲染器
    this.registerRenderer('text', new TextRenderer(this.resourceManager));
    // 注册图片渲染器
    this.registerRenderer('image', new ImageRenderer(this.resourceManager));

    console.log(
      'ElementRendererRegistry: 初始化完成，支持的渲染器:',
      this.getSupportedElementTypes(),
    );
  }

  /**
   * 注册渲染器
   */
  registerRenderer(elementType: ElementType, renderer: IElementRenderer): void {
    this.renderers.set(elementType, renderer);
  }

  /**
   * 获取元素对应的渲染器
   */
  getRenderer(elementType: ElementType): IElementRenderer {
    const renderer = this.renderers.get(elementType);
    if (!renderer) {
      throw new Error(`找不到元素类型的渲染器: ${elementType}`);
    }
    return renderer;
  }

  /**
   * 检查是否支持某种元素类型
   */
  supportsElementType(elementType: ElementType): boolean {
    return this.renderers.has(elementType);
  }

  /**
   * 获取所有支持的元素类型
   */
  getSupportedElementTypes(): ElementType[] {
    return Array.from(this.renderers.keys());
  }

  /**
   * 验证元素数据是否可以被渲染
   */
  validateElement(element: Element): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查元素类型是否支持
    if (!this.supportsElementType(element.type)) {
      errors.push(`不支持的元素类型: ${element.type}`);
    }

    // 检查必需字段
    if (!element.id) errors.push('元素ID是必需的');
    if (element.width <= 0) errors.push('元素宽度必须为正数');
    if (element.height <= 0) errors.push('元素高度必须为正数');

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
