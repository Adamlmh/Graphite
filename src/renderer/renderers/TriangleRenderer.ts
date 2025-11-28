/* eslint-disable @typescript-eslint/no-explicit-any */
// renderer/renderers/TriangleRenderer.ts
import * as PIXI from 'pixi.js';
import type { Element, TriangleElement } from '../../types/index';
import type { IElementRenderer, RenderResources } from '../../types/render.types';
import { ResourceManager } from '../resources/ResourceManager';

/**
 * 三角形渲染器 - 负责三角形元素的图形渲染
 * 职责：将三角形元素数据转换为PIXI图形对象
 */
export class TriangleRenderer implements IElementRenderer {
  private resourceManager: ResourceManager;

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * 渲染三角形元素
   */
  render(element: Element, resources: RenderResources): PIXI.Graphics {
    console.log(`TriangleRenderer: resources received`, resources);
    const triangleElement = element as TriangleElement;
    const { x, y, width, height, style, opacity, transform, rotation } = triangleElement;

    // 创建PIXI图形对象
    const graphics = new PIXI.Graphics();

    // 设置元素类型标识（用于后续查询）
    (graphics as any).elementType = 'triangle';
    (graphics as any).elementId = element.id;

    // 应用样式和绘制
    this.drawTriangle(graphics, 0, 0, width, height, style);

    // 设置位置和变换
    graphics.x = x;
    graphics.y = y;
    graphics.alpha = opacity;

    // 设置缩放
    graphics.scale.set(transform.scaleX, transform.scaleY);

    // 设置变换中心
    graphics.pivot.set(transform.pivotX * width, transform.pivotY * height);

    // 设置旋转
    graphics.rotation = rotation * (Math.PI / 180);

    // 缓存当前尺寸、样式和变换
    (graphics as any).lastWidth = width;
    (graphics as any).lastHeight = height;
    (graphics as any).lastStyle = style;
    (graphics as any).lastTransform = transform;

    console.log(`TriangleRenderer: 创建三角形元素 ${element.id}`, { x, y, width, height });

    return graphics;
  }

  /**
   * 更新三角形元素
   */
  update(graphics: PIXI.Graphics, changes: Partial<Element>): void {
    const triangleChanges = changes as Partial<TriangleElement>;

    // 更新位置
    if (triangleChanges.x !== undefined) graphics.x = triangleChanges.x;
    if (triangleChanges.y !== undefined) graphics.y = triangleChanges.y;

    // 更新透明度
    if (triangleChanges.opacity !== undefined) graphics.alpha = triangleChanges.opacity;

    // 更新旋转
    if (triangleChanges.rotation !== undefined) {
      graphics.rotation = triangleChanges.rotation * (Math.PI / 180);
    }

    // 更新变换
    if (triangleChanges.transform !== undefined) {
      const transform = triangleChanges.transform;
      graphics.scale.set(transform.scaleX, transform.scaleY);

      // 如果有尺寸变化，需要重新计算变换中心
      const width = triangleChanges.width ?? (graphics as any).lastWidth;
      const height = triangleChanges.height ?? (graphics as any).lastHeight;
      if (width !== undefined && height !== undefined) {
        graphics.pivot.set(transform.pivotX * width, transform.pivotY * height);
      }
    }

    // 更新尺寸或样式需要重新绘制
    if (
      triangleChanges.width !== undefined ||
      triangleChanges.height !== undefined ||
      triangleChanges.style
    ) {
      const width = triangleChanges.width ?? (graphics as any).lastWidth;
      const height = triangleChanges.height ?? (graphics as any).lastHeight;
      const style = triangleChanges.style ?? (graphics as any).lastStyle;

      graphics.clear();
      this.drawTriangle(graphics, 0, 0, width, height, style);

      // 缓存当前尺寸和样式
      (graphics as any).lastWidth = width;
      (graphics as any).lastHeight = height;
      (graphics as any).lastStyle = style;

      // 如果有变换，需要重新设置变换中心
      const transform = triangleChanges.transform ?? (graphics as any).lastTransform;
      if (transform) {
        graphics.pivot.set(transform.pivotX * width, transform.pivotY * height);
      }
    }

    console.log(`TriangleRenderer: 更新三角形元素`, changes);
  }

  /**
   * 绘制三角形
   */
  private drawTriangle(
    graphics: PIXI.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    style: TriangleElement['style'],
  ): void {
    const { fill, fillOpacity, stroke, strokeWidth, strokeOpacity } = style;

    // 定义三角形的三个顶点（顶部为顶点）
    const points = [
      x + width / 2,
      y, // 顶部顶点
      x,
      y + height, // 左下角
      x + width,
      y + height, // 右下角
    ];

    // 设置描边样式（必须在beginFill之前）
    if (stroke && strokeWidth > 0 && strokeOpacity > 0) {
      graphics.lineStyle(strokeWidth, this.parseColor(stroke), strokeOpacity);
    } else {
      graphics.lineStyle(0); // 无描边
    }

    // 设置填充样式
    if (fill && fillOpacity > 0) {
      graphics.beginFill(this.parseColor(fill), fillOpacity);
    }

    // 绘制三角形
    graphics.drawPolygon(points);

    // 结束填充
    if (fill && fillOpacity > 0) {
      graphics.endFill();
    }
  }

  /**
   * 解析颜色值（十六进制/RGB -> PIXI颜色）
   */
  private parseColor(color: string): number {
    if (color.startsWith('#')) {
      return parseInt(color.replace('#', '0x'));
    } else if (color.startsWith('rgb')) {
      // 简单处理RGB颜色
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        return (r << 16) + (g << 8) + b;
      }
    }
    return 0x000000; // 默认黑色
  }
}
