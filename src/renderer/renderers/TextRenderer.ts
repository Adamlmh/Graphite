/* eslint-disable @typescript-eslint/no-explicit-any */
// renderer/renderers/TextRenderer.ts
import * as PIXI from 'pixi.js';
import { CanvasTextMetrics } from 'pixi.js';
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
  render(element: Element, resources: RenderResources): PIXI.Container {
    console.log(`TextRenderer: resources received`, resources);
    const textElement = element as TextElement;
    const { x, y, width, height, opacity, content, textStyle, transform, rotation } = textElement;

    // 创建容器
    const container = new PIXI.Container();

    // 设置元素类型标识
    (container as any).elementType = 'text';
    (container as any).elementId = element.id;

    // 设置容器变换
    container.x = x + transform.pivotX * width;
    container.y = y + transform.pivotY * height;
    container.alpha = opacity;
    container.scale.set(transform.scaleX, transform.scaleY);
    container.pivot.set(transform.pivotX * width, transform.pivotY * height);
    container.rotation = rotation * (Math.PI / 180);

    // 1. 创建背景层
    const background = new PIXI.Graphics();
    container.addChild(background);

    // 2. 创建文本层
    const pixiText = new PIXI.Text(content, this.createTextStyle(textStyle));
    container.addChild(pixiText);

    // 3. 创建装饰层（下划线/删除线）
    const decorations = new PIXI.Graphics();
    container.addChild(decorations);

    // 挂载引用以便后续更新
    (container as any).textNode = pixiText;
    (container as any).backgroundNode = background;
    (container as any).decorationNode = decorations;

    // 应用布局和绘制
    this.applyTextLayout(pixiText, textElement);
    this.drawBackground(background, textElement);
    this.drawDecorations(decorations, pixiText, textElement);

    // 缓存状态
    (container as any).lastX = x;
    (container as any).lastY = y;
    (container as any).lastWidth = width;
    (container as any).lastHeight = height;
    (container as any).lastTextStyle = textStyle;
    (container as any).lastTransform = transform;

    console.log(`TextRenderer: 创建文本元素 ${element.id}`, { x, y, content });

    return container;
  }

  /**
   * 更新文本元素
   */
  update(container: PIXI.Container, changes: Partial<Element>): void {
    const textChanges = changes as Partial<TextElement>;
    const textNode = (container as any).textNode as PIXI.Text;
    const backgroundNode = (container as any).backgroundNode as PIXI.Graphics;
    const decorationNode = (container as any).decorationNode as PIXI.Graphics;

    // 获取缓存值
    const lastTransform = (container as any).lastTransform;
    const lastWidth = (container as any).lastWidth;
    const lastHeight = (container as any).lastHeight;
    const lastTextStyle = (container as any).lastTextStyle;
    const lastX = (container as any).lastX;
    const lastY = (container as any).lastY;

    // 计算有效值
    const transform = textChanges.transform ?? lastTransform;
    const width = textChanges.width ?? lastWidth;
    const height = textChanges.height ?? lastHeight;
    const textStyle = textChanges.textStyle
      ? { ...lastTextStyle, ...textChanges.textStyle }
      : lastTextStyle;
    const newX = textChanges.x ?? lastX;
    const newY = textChanges.y ?? lastY;

    // 更新容器变换
    if (
      textChanges.x !== undefined ||
      textChanges.y !== undefined ||
      textChanges.width !== undefined ||
      textChanges.height !== undefined ||
      textChanges.transform !== undefined
    ) {
      container.x = newX + transform.pivotX * width;
      container.y = newY + transform.pivotY * height;
      container.scale.set(transform.scaleX, transform.scaleY);
      container.pivot.set(transform.pivotX * width, transform.pivotY * height);

      // 更新缓存
      (container as any).lastX = newX;
      (container as any).lastY = newY;
      (container as any).lastWidth = width;
      (container as any).lastHeight = height;
      (container as any).lastTransform = transform;
    }

    if (textChanges.opacity !== undefined) {
      container.alpha = textChanges.opacity;
    }

    if (textChanges.rotation !== undefined) {
      container.rotation = textChanges.rotation * (Math.PI / 180);
    }

    // 更新文本内容
    let contentChanged = false;
    if (textChanges.content !== undefined) {
      textNode.text = textChanges.content;
      contentChanged = true;
    }

    // 更新样式
    let styleChanged = false;
    if (textChanges.textStyle !== undefined) {
      (container as any).lastTextStyle = textStyle;
      textNode.style = this.createTextStyle(textStyle);
      styleChanged = true;
    }

    // 如果内容、样式或尺寸变化，需要重新布局和重绘
    if (
      contentChanged ||
      styleChanged ||
      textChanges.width !== undefined ||
      textChanges.height !== undefined
    ) {
      const syntheticElement = {
        width,
        height,
        textStyle,
        content: textNode.text,
      } as TextElement;

      this.applyTextLayout(textNode, syntheticElement);
      this.drawBackground(backgroundNode, syntheticElement);

      // textNode.updateText(true); // 移除，使用 measureText 计算
      this.drawDecorations(decorationNode, textNode, syntheticElement);
    }

    console.log(`TextRenderer: 更新文本元素`, changes);
  }

  /**
   * 创建PIXI文本样式
   */
  private createTextStyle(textStyle: TextElement['textStyle']): PIXI.TextStyle {
    const { fontFamily, fontSize, fontWeight, fontStyle, textAlign, lineHeight, color } = textStyle;

    return new PIXI.TextStyle({
      fontFamily,
      fontSize,
      fontWeight: fontWeight === 'bold' ? 'bold' : 'normal',
      fontStyle: fontStyle === 'italic' ? 'italic' : 'normal',
      fill: this.parseColor(color),
      align: textAlign,
      lineHeight: fontSize * lineHeight,
      wordWrap: true,
    });
  }

  /**
   * 应用文本布局
   */
  private applyTextLayout(text: PIXI.Text, textElement: TextElement): void {
    const { width, textStyle } = textElement;

    text.style.wordWrap = true;
    text.style.wordWrapWidth = width;

    // 重置位置
    text.x = 0;
    text.y = 0;

    switch (textStyle.textAlign) {
      case 'center':
        text.anchor.set(0.5, 0);
        text.x = width / 2;
        break;
      case 'right':
        text.anchor.set(1, 0);
        text.x = width;
        break;
      default: // left
        text.anchor.set(0, 0);
        text.x = 0;
        break;
    }
  }

  private drawBackground(graphics: PIXI.Graphics, textElement: TextElement): void {
    const { width, height, textStyle } = textElement;
    graphics.clear();

    if (textStyle.backgroundColor) {
      const color = this.parseColor(textStyle.backgroundColor);
      graphics.beginFill(color);
      graphics.drawRect(0, 0, width, height);
      graphics.endFill();
    }
  }

  private drawDecorations(
    graphics: PIXI.Graphics,
    text: PIXI.Text,
    textElement: TextElement,
  ): void {
    graphics.clear();
    const { textStyle } = textElement;
    const { textDecoration, color } = textStyle;

    if (!textDecoration || textDecoration === 'none') return;

    const metrics = CanvasTextMetrics.measureText(
      text.text,
      text.style,
      undefined,
      text.style.wordWrap,
    );
    const lineColor = this.parseColor(color);
    const lineWidth = Math.max(1, textStyle.fontSize / 15); // 线条粗细

    const isUnderline = textDecoration.includes('underline');
    const isLineThrough = textDecoration.includes('line-through');

    // 使用 rect + fill 替代 lineStyle，兼容性更好且更清晰
    for (let i = 0; i < metrics.lines.length; i++) {
      const lineWidthPx = metrics.lineWidths[i];
      const lineHeight = metrics.lineHeight;

      const lineTop = i * lineHeight;
      const baseline = lineTop + lineHeight * 0.85; // 下划线位置
      const middle = lineTop + lineHeight * 0.55; // 删除线位置

      let lineX = 0;
      // 根据对齐方式计算线条起始 X 坐标
      if (textStyle.textAlign === 'center') {
        lineX = (textElement.width - lineWidthPx) / 2;
      } else if (textStyle.textAlign === 'right') {
        lineX = textElement.width - lineWidthPx;
      } else {
        lineX = 0;
      }

      if (isUnderline) {
        graphics.rect(lineX, baseline, lineWidthPx, lineWidth);
      }

      if (isLineThrough) {
        graphics.rect(lineX, middle, lineWidthPx, lineWidth);
      }
    }

    graphics.fill(lineColor);
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
