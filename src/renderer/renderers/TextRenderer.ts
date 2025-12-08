/* eslint-disable @typescript-eslint/no-explicit-any */
// renderer/renderers/TextRenderer.ts
import * as PIXI from 'pixi.js';
import { CanvasTextMetrics } from 'pixi.js';
import type { Element, TextElement, RichTextSpan, TextStyle } from '../../types/index';
import type { IElementRenderer, RenderResources } from '../../types/render.types';
import { ResourceManager } from '../resources/ResourceManager';

// === textDecoration helpers (aligned with tiptapConverter) ===
const normalizeTextDecoration = (
  decoration?: TextStyle['textDecoration'],
): TextStyle['textDecoration'] => {
  if (!decoration || decoration === 'none') return 'none';
  const parts = decoration.split(/\s+/).filter(Boolean);
  const hasUnderline = parts.includes('underline');
  const hasStrike = parts.includes('line-through');
  if (hasUnderline && hasStrike) return 'underline line-through';
  if (hasUnderline) return 'underline';
  if (hasStrike) return 'line-through';
  return 'none';
};

const getDecorationFlags = (
  decoration?: TextStyle['textDecoration'],
): { underline: boolean; strike: boolean } => {
  const normalized = normalizeTextDecoration(decoration);
  return {
    underline: normalized.includes('underline'),
    strike: normalized.includes('line-through'),
  };
};

const buildDecorationFromFlags = (
  underline: boolean,
  strike: boolean,
): TextStyle['textDecoration'] => {
  if (underline && strike) return 'underline line-through';
  if (underline) return 'underline';
  if (strike) return 'line-through';
  return 'none';
};

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
    const { x, y, width, height, opacity, content, textStyle, transform, rotation, richText } =
      textElement;

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
    this.drawBackground(background, textElement);

    // 2. 创建文本层
    // 检查是否包含富文本
    if (richText && richText.length > 0) {
      this.renderRichText(container, textElement);
    } else {
      const pixiText = new PIXI.Text(content, this.createTextStyle(textStyle));

      // 提高清晰度：设置文本分辨率
      pixiText.resolution = window.devicePixelRatio || 2;

      container.addChild(pixiText);

      // 3. 创建装饰层（下划线/删除线）
      const decorations = new PIXI.Graphics();
      container.addChild(decorations);

      // 挂载引用以便后续更新
      (container as any).textNode = pixiText;
      (container as any).decorationNode = decorations;
      (container as any).isRichText = false;

      // 应用布局和绘制
      this.applyTextLayout(pixiText, textElement);
      this.drawDecorations(decorations, pixiText, textElement);
    }

    // 挂载背景引用
    (container as any).backgroundNode = background;

    // 缓存状态
    (container as any).lastX = x;
    (container as any).lastY = y;
    (container as any).lastWidth = width;
    (container as any).lastHeight = height;
    (container as any).lastTextStyle = textStyle;
    (container as any).lastTransform = transform;
    (container as any).lastRichText = richText;
    (container as any).lastContent = content;

    console.log(`TextRenderer: 创建文本元素 ${element.id}`, { x, y, content, richText });

    return container;
  }

  /**
   * 更新文本元素
   */
  update(container: PIXI.Container, changes: Partial<Element>): void {
    const textChanges = changes as Partial<TextElement>;
    const backgroundNode = (container as any).backgroundNode as PIXI.Graphics;

    // 获取缓存值
    const lastTransform = (container as any).lastTransform;
    const lastWidth = (container as any).lastWidth;
    const lastHeight = (container as any).lastHeight;
    const lastTextStyle = (container as any).lastTextStyle;
    const lastX = (container as any).lastX;
    const lastY = (container as any).lastY;
    const lastRichText = (container as any).lastRichText;
    const lastContent = (container as any).lastContent;

    // 计算有效值
    const transform = textChanges.transform ?? lastTransform;
    const width = textChanges.width ?? lastWidth;
    const height = textChanges.height ?? lastHeight;
    const textStyle = textChanges.textStyle
      ? { ...lastTextStyle, ...textChanges.textStyle }
      : lastTextStyle;
    const newX = textChanges.x ?? lastX;
    const newY = textChanges.y ?? lastY;
    const richText = textChanges.richText ?? lastRichText;
    const content = textChanges.content ?? lastContent;

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

    // 检查是否需要重新渲染文本
    const isRichText = (container as any).isRichText;
    const hasRichText = richText && richText.length > 0;

    // 如果富文本状态改变，或者在富文本模式下内容/样式/宽度改变，或者从富文本切回普通文本
    const shouldRebuildText =
      isRichText !== hasRichText || // 模式切换
      (hasRichText &&
        (textChanges.content !== undefined ||
          textChanges.richText !== undefined ||
          textChanges.textStyle !== undefined ||
          textChanges.width !== undefined));

    if (shouldRebuildText) {
      // 销毁旧节点
      const textNode = (container as any).textNode;
      const decorationNode = (container as any).decorationNode;
      if (textNode) textNode.destroy();
      if (decorationNode) decorationNode.destroy();

      // 重建文本
      const syntheticElement = {
        width,
        height,
        textStyle,
        content,
        richText,
      } as TextElement;

      if (hasRichText) {
        this.renderRichText(container, syntheticElement);
      } else {
        const pixiText = new PIXI.Text(content, this.createTextStyle(textStyle));
        // 提高清晰度：设置文本分辨率
        pixiText.resolution = window.devicePixelRatio || 2;
        container.addChild(pixiText);
        const decorations = new PIXI.Graphics();
        container.addChild(decorations);

        (container as any).textNode = pixiText;
        (container as any).decorationNode = decorations;
        (container as any).isRichText = false;

        this.applyTextLayout(pixiText, syntheticElement);
        this.drawDecorations(decorations, pixiText, syntheticElement);
      }

      // 更新缓存
      (container as any).lastContent = content;
      (container as any).lastRichText = richText;
      (container as any).lastTextStyle = textStyle;
      (container as any).lastWidth = width;
      (container as any).lastHeight = height;
    } else if (!hasRichText) {
      // 普通文本的优化更新逻辑
      const textNode = (container as any).textNode as PIXI.Text;
      const decorationNode = (container as any).decorationNode as PIXI.Graphics;

      let contentChanged = false;
      if (textChanges.content !== undefined) {
        textNode.text = textChanges.content;
        contentChanged = true;
        (container as any).lastContent = textChanges.content;
      }

      let styleChanged = false;
      if (textChanges.textStyle !== undefined) {
        (container as any).lastTextStyle = textStyle;
        textNode.style = this.createTextStyle(textStyle);
        // 更新样式时也要确保分辨率正确
        textNode.resolution = window.devicePixelRatio || 2;
        styleChanged = true;
      }

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
        this.drawDecorations(decorationNode, textNode, syntheticElement);

        (container as any).lastWidth = width;
        (container as any).lastHeight = height;
      }
    }

    // 更新背景
    if (
      textChanges.width !== undefined ||
      textChanges.height !== undefined ||
      textChanges.textStyle?.backgroundColor !== undefined
    ) {
      const syntheticElement = {
        width,
        height,
        textStyle,
      } as TextElement;
      this.drawBackground(backgroundNode, syntheticElement);
    }

    console.log(`TextRenderer: 更新文本元素`, changes);
  }

  /**
   * 渲染富文本
   */
  private renderRichText(container: PIXI.Container, textElement: TextElement): void {
    const { content, richText, textStyle, width } = textElement;
    const richTextContainer = new PIXI.Container();

    const segments = this.parseRichText(content, richText || [], textStyle);
    const lines = this.layoutRichText(segments, width, textStyle);

    lines.forEach((line) => {
      line.items.forEach((item: any) => {
        // 1. 绘制背景色
        this.drawRichTextBackground(richTextContainer, item);

        // 2. 绘制文字
        const text = new PIXI.Text(item.text, item.style);
        // 提高清晰度：为每个富文本片段设置分辨率
        text.resolution = window.devicePixelRatio || 2;
        text.x = item.x;
        text.y = item.y;
        richTextContainer.addChild(text);

        // 3. 绘制装饰线
        this.drawRichTextDecoration(richTextContainer, item);
      });
    });

    container.addChild(richTextContainer);
    (container as any).textNode = richTextContainer;
    (container as any).isRichText = true;
  }

  /**
   * 解析富文本片段
   * 支持局部文本的字体、颜色、大小等样式
   */
  private parseRichText(
    content: string,
    richText: RichTextSpan[],
    baseStyle: TextStyle,
  ): { text: string; style: PIXI.TextStyle; originalStyle: Partial<TextStyle> }[] {
    const segments: { text: string; style: PIXI.TextStyle; originalStyle: Partial<TextStyle> }[] =
      [];
    let lastIndex = 0;
    const sortedSpans = [...richText].sort((a, b) => a.start - b.start);

    sortedSpans.forEach((span) => {
      // 添加未被样式覆盖的部分（使用基础样式）
      if (span.start > lastIndex) {
        segments.push({
          text: content.slice(lastIndex, span.start),
          style: this.createTextStyle(baseStyle),
          originalStyle: baseStyle,
        });
      }
      // 合并基础样式和局部样式，确保字体等属性正确传递，并对 textDecoration 做并集
      const baseDecorationFlags = getDecorationFlags(baseStyle.textDecoration);
      const localDecorationNormalized =
        span.style.textDecoration !== undefined
          ? normalizeTextDecoration(span.style.textDecoration)
          : undefined;
      const localDecorationFlags =
        localDecorationNormalized !== undefined
          ? getDecorationFlags(localDecorationNormalized)
          : undefined;

      const finalUnderline = (() => {
        if (localDecorationNormalized === 'none') return false;
        if (localDecorationFlags)
          return localDecorationFlags.underline || baseDecorationFlags.underline;
        return baseDecorationFlags.underline;
      })();

      const finalStrike = (() => {
        if (localDecorationNormalized === 'none') return false;
        if (localDecorationFlags) return localDecorationFlags.strike || baseDecorationFlags.strike;
        return baseDecorationFlags.strike;
      })();

      const mergedStyle: TextStyle = {
        ...baseStyle,
        ...span.style,
        textDecoration: normalizeTextDecoration(
          buildDecorationFromFlags(finalUnderline, finalStrike),
        ),
        fontFamily: span.style.fontFamily || baseStyle.fontFamily,
      };
      segments.push({
        text: content.slice(span.start, span.end),
        style: this.createTextStyle(mergedStyle),
        originalStyle: mergedStyle,
      });
      lastIndex = span.end;
    });

    // 添加剩余的文本
    if (lastIndex < content.length) {
      segments.push({
        text: content.slice(lastIndex),
        style: this.createTextStyle(baseStyle),
        originalStyle: baseStyle,
      });
    }
    return segments;
  }

  /**
   * 富文本布局计算
   */
  private layoutRichText(
    segments: { text: string; style: PIXI.TextStyle; originalStyle: Partial<TextStyle> }[],
    maxWidth: number,
    baseStyle: TextStyle,
  ): { items: any[]; height: number; width: number }[] {
    const lines: { items: any[]; height: number; width: number }[] = [];
    let currentLineItems: any[] = [];
    let currentLineWidth = 0;
    let maxLineHeight = 0;

    segments.forEach((segment) => {
      // 按空格分割单词，保留空格
      const words = segment.text.split(/(\s+)/).filter((w) => w.length > 0);

      words.forEach((word) => {
        const metrics = CanvasTextMetrics.measureText(word, segment.style);
        const wordWidth = metrics.width;
        // 使用样式定义的行高，如果没有则使用字体大小的1.2倍
        const fontSize = (segment.style.fontSize as number) || 16;
        const lineHeight = (segment.style.lineHeight as number) || fontSize * 1.2;

        // 换行逻辑：如果当前行不为空且加上当前词超过最大宽度
        if (currentLineWidth + wordWidth > maxWidth && currentLineWidth > 0) {
          lines.push({ items: currentLineItems, height: maxLineHeight, width: currentLineWidth });
          currentLineItems = [];
          currentLineWidth = 0;
          maxLineHeight = 0;
        }

        currentLineItems.push({
          text: word,
          style: segment.style,
          originalStyle: segment.originalStyle,
          width: wordWidth,
          height: lineHeight,
          fontSize: fontSize,
        });
        currentLineWidth += wordWidth;
        maxLineHeight = Math.max(maxLineHeight, lineHeight);
      });
    });

    if (currentLineItems.length > 0) {
      lines.push({ items: currentLineItems, height: maxLineHeight, width: currentLineWidth });
    }

    // 计算最终位置
    let currentY = 0;
    const finalLines: any[] = [];

    lines.forEach((line) => {
      let currentX = 0;
      // 处理对齐
      if (baseStyle.textAlign === 'center') {
        currentX = (maxWidth - line.width) / 2;
      } else if (baseStyle.textAlign === 'right') {
        currentX = maxWidth - line.width;
      }

      const lineItems: any[] = [];

      line.items.forEach((item: any) => {
        lineItems.push({
          ...item,
          x: currentX,
          // 垂直居中对齐
          y: currentY + (line.height - item.height) / 2,
        });
        currentX += item.width;
      });

      finalLines.push({ items: lineItems });
      currentY += line.height;
    });

    return finalLines;
  }

  /**
   * 绘制富文本背景色
   */
  private drawRichTextBackground(container: PIXI.Container, item: any) {
    const { originalStyle, x, y, width, height } = item;
    const { backgroundColor } = originalStyle;

    if (!backgroundColor) return;

    const graphics = new PIXI.Graphics();
    const color = this.parseColor(backgroundColor);

    graphics.rect(x, y, width, height);
    graphics.fill(color);

    container.addChild(graphics);
  }

  /**
   * 绘制富文本装饰线
   */
  private drawRichTextDecoration(container: PIXI.Container, item: any) {
    const { originalStyle, x, y, width, height } = item;
    const { textDecoration, color, fontSize } = originalStyle;

    if (!textDecoration || textDecoration === 'none') return;

    const graphics = new PIXI.Graphics();
    const lineColor = this.parseColor(color || '#000000');
    const lineWidth = Math.max(1, (fontSize || 16) / 15);

    const isUnderline = textDecoration.includes('underline');
    const isLineThrough = textDecoration.includes('line-through');

    // 简单绘制，不考虑多行（因为item已经是单词级别）
    const baseline = y + height * 0.85;
    const middle = y + height * 0.55;

    if (isUnderline) {
      graphics.rect(x, baseline, width, lineWidth);
    }

    if (isLineThrough) {
      graphics.rect(x, middle, width, lineWidth);
    }

    graphics.fill(lineColor);
    container.addChild(graphics);
  }

  /**
   * 创建 PIXI 文本样式
   * 优化了清晰度和字体支持
   */
  private createTextStyle(textStyle: Partial<TextStyle>): PIXI.TextStyle {
    const { fontFamily, fontSize, fontWeight, fontStyle, textAlign, lineHeight, color } = textStyle;

    // 确保字体系列正确传递，支持后备字体
    const safeFontFamily = fontFamily || 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif';
    const safeFontSize = fontSize || 16;

    return new PIXI.TextStyle({
      fontFamily: safeFontFamily,
      fontSize: safeFontSize,
      fontWeight: fontWeight === 'bold' ? 'bold' : 'normal',
      fontStyle: fontStyle === 'italic' ? 'italic' : 'normal',
      fill: this.parseColor(color || '#000000'),
      align: textAlign || 'left',
      lineHeight: safeFontSize * (lineHeight || 1.2),
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
      graphics.rect(0, 0, width, height);
      graphics.fill(color);
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
