/* eslint-disable @typescript-eslint/no-explicit-any */
// renderer/renderers/RectangleRenderer.ts
import * as PIXI from 'pixi.js';
import type { Element, RectElement } from '../../types/index';
import type { IElementRenderer, RenderResources } from '../../types/render.types';
import { ResourceManager } from '../resources/ResourceManager';
/**
 * 矩形渲染器 - 负责矩形元素的图形渲染
 * 职责：将矩形元素数据转换为PIXI图形对象，支持圆角矩形
 * 对应需求：基础渲染（矩形、圆角矩形）
 */
export class RectangleRenderer implements IElementRenderer {
  private resourceManager: ResourceManager;

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * 渲染矩形元素
   * 对应需求：背景色、边框宽度、边框颜色
   */
  render(element: Element, resources: RenderResources): PIXI.Graphics {
    console.log(`RectangleRenderer: resources received`, resources);
    const rectElement = element as RectElement;
    const { x, y, width, height, style, opacity, transform, rotation } = rectElement;

    // 创建PIXI图形对象
    const graphics = new PIXI.Graphics();

    // 设置元素类型标识（用于后续查询）
    (graphics as any).elementType = 'rect';
    (graphics as any).elementId = element.id;

    // 应用样式和绘制
    this.drawRectangle(graphics, 0, 0, width, height, style);

    // 设置位置和变换
    graphics.x = x + transform.pivotX * width;
    graphics.y = y + transform.pivotY * height;
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

    console.log(`RectangleRenderer: 创建矩形元素 ${element.id}`, { x, y, width, height });

    return graphics;
  }

  /**
   * 更新矩形元素
   */
  update(graphics: PIXI.Graphics, changes: Partial<Element>): void {
    const rectChanges = changes as Partial<RectElement>;

    // 获取当前的 transform（优先使用 changes 中的，否则使用缓存的）
    const transform = rectChanges.transform ?? (graphics as any).lastTransform;
    const width = rectChanges.width ?? (graphics as any).lastWidth;
    const height = rectChanges.height ?? (graphics as any).lastHeight;

    // 更新位置（使用正确的 transform.pivotX 和 pivotY）
    if (rectChanges.x !== undefined && transform) {
      graphics.x = rectChanges.x + transform.pivotX * width;
    }
    if (rectChanges.y !== undefined && transform) {
      graphics.y = rectChanges.y + transform.pivotY * height;
    }

    // 更新透明度
    if (rectChanges.opacity !== undefined) graphics.alpha = rectChanges.opacity;

    // 更新旋转
    if (rectChanges.rotation !== undefined) {
      graphics.rotation = rectChanges.rotation * (Math.PI / 180);
    }

    // 更新变换
    if (rectChanges.transform !== undefined) {
      const newTransform = rectChanges.transform;
      const oldTransform = (graphics as any).lastTransform;
      graphics.scale.set(newTransform.scaleX, newTransform.scaleY);

      // 如果有尺寸变化，需要重新计算变换中心
      const width = rectChanges.width ?? (graphics as any).lastWidth;
      const height = rectChanges.height ?? (graphics as any).lastHeight;
      if (width !== undefined && height !== undefined) {
        graphics.pivot.set(newTransform.pivotX * width, newTransform.pivotY * height);

        // 如果 pivot 改变了，需要重新计算位置以保持元素在世界坐标系中的位置不变
        if (
          oldTransform &&
          (newTransform.pivotX !== oldTransform.pivotX ||
            newTransform.pivotY !== oldTransform.pivotY)
        ) {
          // 只有在 x 和 y 没有明确更新时才自动调整位置
          if (rectChanges.x === undefined && rectChanges.y === undefined) {
            const oldPivotOffsetX = oldTransform.pivotX * width;
            const newPivotOffsetX = newTransform.pivotX * width;
            const oldPivotOffsetY = oldTransform.pivotY * height;
            const newPivotOffsetY = newTransform.pivotY * height;
            graphics.x = graphics.x - oldPivotOffsetX + newPivotOffsetX;
            graphics.y = graphics.y - oldPivotOffsetY + newPivotOffsetY;
          }
        }
      }
      // 更新缓存
      (graphics as any).lastTransform = newTransform;
    }

    // 更新尺寸或样式需要重新绘制
    if (rectChanges.width !== undefined || rectChanges.height !== undefined || rectChanges.style) {
      const width = rectChanges.width ?? (graphics as any).lastWidth;
      const height = rectChanges.height ?? (graphics as any).lastHeight;

      const lastStyle = (graphics as any).lastStyle || {};
      const style = rectChanges.style ? { ...lastStyle, ...rectChanges.style } : lastStyle;

      // console.log('RectangleRenderer: 重新绘制', {
      //   width,
      //   height,
      //   oldStyle: lastStyle,
      //   styleChanges: rectChanges.style,
      //   mergedStyle: style,
      // });

      graphics.clear();
      this.drawRectangle(graphics, 0, 0, width, height, style);

      // 缓存当前尺寸和样式
      (graphics as any).lastWidth = width;
      (graphics as any).lastHeight = height;
      (graphics as any).lastStyle = style;

      // 如果有变换，需要重新设置变换中心
      const transform = rectChanges.transform ?? (graphics as any).lastTransform;
      if (transform) {
        graphics.pivot.set(transform.pivotX * width, transform.pivotY * height);
        // 更新缓存
        (graphics as any).lastTransform = transform;
      }
    }

    // console.log(`RectangleRenderer: 更新矩形元素`, changes);
  }

  /**
   * 绘制矩形（支持圆角）
   */
  private drawRectangle(
    graphics: PIXI.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    style: RectElement['style'],
  ): void {
    const { fill, fillOpacity, stroke, strokeWidth, strokeOpacity, borderRadius = 0 } = style;

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

    // 绘制矩形（支持圆角）
    if (borderRadius > 0) {
      this.drawRoundedRect(graphics, x, y, width, height, borderRadius);
    } else {
      graphics.drawRect(x, y, width, height);
    }

    // 结束填充
    if (fill && fillOpacity > 0) {
      graphics.endFill();
    }
  }

  /**
   * 绘制圆角矩形
   */
  private drawRoundedRect(
    graphics: PIXI.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    // 限制圆角半径不超过矩形尺寸的一半
    const maxRadius = Math.min(width, height) / 2;
    const actualRadius = Math.min(radius, maxRadius);

    graphics.drawRoundedRect(x, y, width, height, actualRadius);
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
