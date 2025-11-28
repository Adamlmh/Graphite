/* eslint-disable @typescript-eslint/no-explicit-any */
// renderer/renderers/CircleRenderer.ts
import * as PIXI from 'pixi.js';
import type { CircleElement, Element } from '../../types/index';
import type { IElementRenderer, RenderResources } from '../../types/render.types';
import { ResourceManager } from '../resources/ResourceManager';

/**
 * 圆形渲染器 - 负责圆形元素的图形渲染
 * 职责：将圆形元素数据转换为PIXI图形对象
 */
export class CircleRenderer implements IElementRenderer {
  private resourceManager: ResourceManager;

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * 渲染圆形元素
   */
  render(element: Element, resources: RenderResources): PIXI.Graphics {
    console.log(`CircleRenderer: resources received`, resources);
    const circleElement = element as CircleElement;
    const { x, y, width, height, style, opacity, transform, rotation } = circleElement;

    // 创建PIXI图形对象
    const graphics = new PIXI.Graphics();

    // 设置元素类型标识（用于后续查询）
    (graphics as any).elementType = 'circle';
    (graphics as any).elementId = element.id;

    // 计算圆心和半径（使用宽度和高度的较小值作为直径）
    const radius = Math.min(width, height) / 2;
    const centerX = width / 2;
    const centerY = height / 2;

    // 应用样式和绘制
    this.drawCircle(graphics, centerX, centerY, radius, style);

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

    console.log(`CircleRenderer: 创建圆形元素 ${element.id}`, { x, y, width, height, radius });

    return graphics;
  }

  /**
   * 更新圆形元素
   */
  update(graphics: PIXI.Graphics, changes: Partial<Element>): void {
    const circleChanges = changes as Partial<CircleElement>;

    // 更新位置
    if (circleChanges.x !== undefined) graphics.x = circleChanges.x;
    if (circleChanges.y !== undefined) graphics.y = circleChanges.y;

    // 更新透明度
    if (circleChanges.opacity !== undefined) graphics.alpha = circleChanges.opacity;

    // 更新旋转
    if (circleChanges.rotation !== undefined) {
      graphics.rotation = circleChanges.rotation * (Math.PI / 180);
    }

    // 更新变换
    if (circleChanges.transform !== undefined) {
      const transform = circleChanges.transform;
      graphics.scale.set(transform.scaleX, transform.scaleY);

      // 如果有尺寸变化，需要重新计算变换中心
      const width = circleChanges.width ?? (graphics as any).lastWidth;
      const height = circleChanges.height ?? (graphics as any).lastHeight;
      if (width !== undefined && height !== undefined) {
        graphics.pivot.set(transform.pivotX * width, transform.pivotY * height);
      }
    }

    // 更新尺寸或样式需要重新绘制
    if (
      circleChanges.width !== undefined ||
      circleChanges.height !== undefined ||
      circleChanges.style
    ) {
      const width = circleChanges.width ?? (graphics as any).lastWidth;
      const height = circleChanges.height ?? (graphics as any).lastHeight;
      const style = circleChanges.style ?? (graphics as any).lastStyle;

      const radius = Math.min(width, height) / 2;
      const centerX = width / 2;
      const centerY = height / 2;

      graphics.clear();
      this.drawCircle(graphics, centerX, centerY, radius, style);

      // 缓存当前尺寸和样式
      (graphics as any).lastWidth = width;
      (graphics as any).lastHeight = height;
      (graphics as any).lastStyle = style;

      // 如果有变换，需要重新设置变换中心
      const transform = circleChanges.transform ?? (graphics as any).lastTransform;
      if (transform) {
        graphics.pivot.set(transform.pivotX * width, transform.pivotY * height);
      }
    }

    console.log(`CircleRenderer: 更新圆形元素`, changes);
  }

  /**
   * 绘制圆形
   */
  private drawCircle(
    graphics: PIXI.Graphics,
    centerX: number,
    centerY: number,
    radius: number,
    style: CircleElement['style'],
  ): void {
    const { fill, fillOpacity, stroke, strokeWidth, strokeOpacity } = style;

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

    // 绘制圆形
    graphics.drawCircle(centerX, centerY, radius);

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
