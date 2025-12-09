/**
 * 文本测量工具
 * 用于计算文本实际占用的尺寸
 */

import { CanvasTextMetrics, TextStyle as PIXITextStyle } from 'pixi.js';
import type { TextStyle, RichTextSpan } from '../types';

/**
 * 测量纯文本的实际尺寸
 */
export function measurePlainText(
  text: string,
  textStyle: Partial<TextStyle>,
  maxWidth?: number,
): { width: number; height: number } {
  // 创建PIXI文本样式
  const pixiStyle = new PIXITextStyle({
    fontFamily: textStyle.fontFamily || 'Arial, sans-serif',
    fontSize: textStyle.fontSize || 16,
    fontWeight: textStyle.fontWeight === 'bold' ? 'bold' : 'normal',
    fontStyle: textStyle.fontStyle === 'italic' ? 'italic' : 'normal',
    lineHeight: (textStyle.fontSize || 16) * (textStyle.lineHeight || 1.2),
    wordWrap: maxWidth !== undefined,
    wordWrapWidth: maxWidth,
  });

  // 支持多行：按换行分割并累积行高
  const lines = (text || '').split('\n');
  let maxWidthMeasured = 0;
  let totalHeight = 0;
  const lineHeight = ((pixiStyle.fontSize as number) || 16) * (textStyle.lineHeight || 1.2);
  for (const line of lines) {
    const metrics = CanvasTextMetrics.measureText(line, pixiStyle);
    maxWidthMeasured = Math.max(maxWidthMeasured, metrics.width);
    totalHeight += lineHeight;
  }

  return {
    width: Math.ceil(
      maxWidth !== undefined ? Math.min(maxWidth, maxWidthMeasured) : maxWidthMeasured,
    ),
    height: Math.ceil(totalHeight),
  };
}

/**
 * 测量富文本的实际尺寸
 */
export function measureRichText(
  text: string,
  richText: RichTextSpan[],
  baseStyle: Partial<TextStyle>,
  maxWidth: number,
): { width: number; height: number } {
  if (!richText || richText.length === 0) {
    return measurePlainText(text, baseStyle, maxWidth);
  }

  // 解析富文本片段
  const segments: Array<{
    text: string;
    style: PIXITextStyle;
  }> = [];

  let lastIndex = 0;
  const sortedSpans = [...richText].sort((a, b) => a.start - b.start);

  sortedSpans.forEach((span) => {
    // 添加 span 前的文本（使用基础样式）
    if (span.start > lastIndex) {
      const beforeText = text.slice(lastIndex, span.start);
      segments.push({
        text: beforeText,
        style: createPixiStyle({ ...baseStyle }),
      });
    }

    // 添加带样式的文本（合并基础样式和局部样式）
    const mergedStyle = { ...baseStyle, ...span.style };
    segments.push({
      text: text.slice(span.start, span.end),
      style: createPixiStyle(mergedStyle),
    });

    lastIndex = span.end;
  });

  // 添加剩余文本
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      style: createPixiStyle({ ...baseStyle }),
    });
  }

  // 计算布局
  const lines: Array<{
    width: number;
    height: number;
  }> = [];

  let currentLineWidth = 0;
  let maxLineHeight = 0;

  segments.forEach((segment) => {
    // 按空格分割单词
    const words = segment.text.split(/(\s+)/).filter((w) => w.length > 0);

    words.forEach((word) => {
      const metrics = CanvasTextMetrics.measureText(word, segment.style);
      const wordWidth = metrics.width;
      const fontSize = (segment.style.fontSize as number) || 16;
      const lineHeight = (segment.style.lineHeight as number) || fontSize * 1.2;

      // 换行逻辑
      if (currentLineWidth + wordWidth > maxWidth && currentLineWidth > 0) {
        lines.push({ width: currentLineWidth, height: maxLineHeight });
        currentLineWidth = 0;
        maxLineHeight = 0;
      }

      currentLineWidth += wordWidth;
      maxLineHeight = Math.max(maxLineHeight, lineHeight);
    });
  });

  // 添加最后一行
  if (currentLineWidth > 0 || maxLineHeight > 0) {
    lines.push({ width: currentLineWidth, height: maxLineHeight });
  }

  // 计算总尺寸
  const totalWidth = Math.max(...lines.map((l) => l.width), 0);
  const totalHeight = lines.reduce((sum, l) => sum + l.height, 0);

  return {
    width: Math.ceil(Math.min(totalWidth, maxWidth)),
    height: Math.ceil(totalHeight),
  };
}

/**
 * 创建PIXI文本样式
 */
function createPixiStyle(textStyle: Partial<TextStyle>): PIXITextStyle {
  const fontSize = textStyle.fontSize || 16;
  return new PIXITextStyle({
    fontFamily: textStyle.fontFamily || 'Arial, sans-serif',
    fontSize: fontSize,
    fontWeight: textStyle.fontWeight === 'bold' ? 'bold' : 'normal',
    fontStyle: textStyle.fontStyle === 'italic' ? 'italic' : 'normal',
    fill: textStyle.color || '#000000',
    lineHeight: fontSize * (textStyle.lineHeight || 1.2),
  });
}

/**
 * 计算文本元素的理想尺寸
 * 考虑最小/最大尺寸约束
 */
export function calculateTextElementSize(
  text: string,
  richText: RichTextSpan[] | undefined,
  textStyle: Partial<TextStyle>,
  currentWidth: number,
  options?: {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    padding?: number;
  },
): { width: number; height: number } {
  const minWidth = options?.minWidth || 60;
  const minHeight = options?.minHeight || 24;
  const maxWidth = options?.maxWidth || currentWidth || 800;
  const padding = options?.padding || 8;

  let measured: { width: number; height: number };

  if (richText && richText.length > 0) {
    measured = measureRichText(text, richText, textStyle, maxWidth - padding * 2);
  } else {
    measured = measurePlainText(text, textStyle, maxWidth - padding * 2);
  }

  return {
    width: Math.max(minWidth, measured.width + padding * 2),
    height: Math.max(minHeight, measured.height + padding * 2),
  };
}
