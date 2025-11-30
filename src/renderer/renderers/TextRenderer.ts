/* eslint-disable @typescript-eslint/no-explicit-any */
// renderer/renderers/TextRenderer.ts
import * as PIXI from 'pixi.js';
import type { Element, TextElement } from '../../types/index';
import type { IElementRenderer, RenderResources } from '../../types/render.types';
import { ResourceManager } from '../resources/ResourceManager';

/**
 * 文本渲染器 - 负责文本元素的图形渲染
 * 职责：将文本元素数据转换为PIXI文本对象
 */
export class TextRenderer implements IElementRenderer {
  private resourceManager: ResourceManager;

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * 渲染文本元素
   */
  render(element: Element, resources: RenderResources): PIXI.Text {
    console.log(`TextRenderer: resources received`, resources);
    const textElement = element as TextElement;
    const { x, y, width, height, opacity, content, textStyle, transform, rotation } = textElement;

    // 创建PIXI文本对象
    const pixiText = new PIXI.Text(content, this.createTextStyle(textStyle));

    // 设置元素类型标识（用于后续查询）
    (pixiText as any).elementType = 'text';
    (pixiText as any).elementId = element.id;

    // 设置位置和变换
    pixiText.x = x + transform.pivotX * width;
    pixiText.y = y + transform.pivotY * height;
    pixiText.alpha = opacity;

    // 设置缩放
    pixiText.scale.set(transform.scaleX, transform.scaleY);

    // 设置变换中心
    pixiText.pivot.set(transform.pivotX * width, transform.pivotY * height);

    // 设置旋转
    pixiText.rotation = rotation * (Math.PI / 180);

    // 设置文本对齐和布局
    this.applyTextLayout(pixiText, textElement);

    // 缓存当前尺寸、样式和变换
    (pixiText as any).lastWidth = width;
    (pixiText as any).lastHeight = height;
    (pixiText as any).lastTextStyle = textStyle;
    (pixiText as any).lastTransform = transform;

    console.log(`TextRenderer: 创建文本元素 ${element.id}`, { x, y, content });

    return pixiText;
  }

  /**
   * 更新文本元素
   */
  update(text: PIXI.Text, changes: Partial<Element>): void {
    const textChanges = changes as Partial<TextElement>;

    // 获取当前的 transform（优先使用 changes 中的，否则使用缓存的）
    const transform = textChanges.transform ?? (text as any).lastTransform;
    const width = textChanges.width ?? (text as any).lastWidth;
    const height = textChanges.height ?? (text as any).lastHeight;

    // 更新位置（使用正确的 transform.pivotX 和 pivotY）
    if (textChanges.x !== undefined && transform) {
      text.x = textChanges.x + transform.pivotX * width;
    }
    if (textChanges.y !== undefined && transform) {
      text.y = textChanges.y + transform.pivotY * height;
    }

    // 更新透明度
    if (textChanges.opacity !== undefined) text.alpha = textChanges.opacity;

    // 更新旋转
    if (textChanges.rotation !== undefined) {
      text.rotation = textChanges.rotation * (Math.PI / 180);
    }

    // 更新变换
    if (textChanges.transform !== undefined) {
      const transform = textChanges.transform;
      text.scale.set(transform.scaleX, transform.scaleY);

      // 如果有尺寸变化，需要重新计算变换中心
      const width = textChanges.width ?? (text as any).lastWidth;
      const height = textChanges.height ?? (text as any).lastHeight;
      if (width !== undefined && height !== undefined) {
        text.pivot.set(transform.pivotX * width, transform.pivotY * height);
      }
    }

    // 更新内容
    if (textChanges.content !== undefined) {
      text.text = textChanges.content;
    }

    // 更新文本样式
    if (textChanges.textStyle !== undefined) {
      text.style = this.createTextStyle(textChanges.textStyle);
    }

    // 更新布局
    if (
      textChanges.width !== undefined ||
      textChanges.height !== undefined ||
      textChanges.textStyle
    ) {
      const textElement = changes as TextElement;
      this.applyTextLayout(text, textElement);
    }

    console.log(`TextRenderer: 更新文本元素`, changes);
  }

  /**
   * 创建PIXI文本样式
   */
  private createTextStyle(textStyle: TextElement['textStyle']): PIXI.TextStyle {
    const {
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      textDecoration,
      textAlign,
      lineHeight,
      color,
      backgroundColor,
    } = textStyle;

    const style = new PIXI.TextStyle({
      fontFamily,
      fontSize,
      fontWeight: fontWeight === 'bold' ? 'bold' : 'normal',
      fontStyle: fontStyle === 'italic' ? 'italic' : 'normal',
      fill: this.parseColor(color),
      align: textAlign,
      lineHeight: fontSize * lineHeight,
    });

    // 处理文本装饰（下划线和删除线）
    if (textDecoration.includes('underline')) {
      // PIXI.TextStyle 不直接支持下划线，需要手动处理或使用其他方式
      // 这里暂时忽略，未来可以通过自定义绘制实现
    }
    if (textDecoration.includes('line-through')) {
      // 类似处理
    }

    // 设置背景色（如果有）
    if (backgroundColor) {
      // PIXI.Text 不直接支持背景色，需要包装在容器中
      // 这里暂时忽略，未来可以通过Graphics背景实现
    }

    return style;
  }

  /**
   * 应用文本布局
   */
  private applyTextLayout(text: PIXI.Text, textElement: TextElement): void {
    const { width, height, textStyle } = textElement;

    // 设置文本最大宽度（用于自动换行）
    text.style.wordWrap = true;
    text.style.wordWrapWidth = width;

    // 根据对齐方式调整位置
    switch (textStyle.textAlign) {
      case 'center':
        text.anchor.set(0.5, 0);
        text.x += width / 2;
        break;
      case 'right':
        text.anchor.set(1, 0);
        text.x += width;
        break;
      default: // left
        text.anchor.set(0, 0);
        break;
    }

    // 垂直居中（如果需要）
    // 这里可以根据需求添加垂直对齐逻辑
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
