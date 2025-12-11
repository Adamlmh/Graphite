import type { TextStyle as TextStyleType, RichTextSpan } from '../types';

/**
 * Tiptap JSON 节点类型定义
 */
export interface TiptapNode {
  type: string;
  text?: string;
  marks?: Array<{
    type: string;
    attrs?: {
      color?: string;
      backgroundColor?: string;
      fontSize?: string;
      fontFamily?: string;
    };
  }>;
  content?: TiptapNode[];
}

export interface TiptapJSON {
  type: string;
  content?: TiptapNode[];
}

interface ContentNode {
  type: string;
  text: string;
  marks?: Array<{ type: string; attrs?: Record<string, string> }>;
}

const normalizeTextDecoration = (
  decoration?: TextStyleType['textDecoration'],
): TextStyleType['textDecoration'] | undefined => {
  if (!decoration || decoration === 'none') return 'none';
  const parts = decoration.split(/\s+/).filter(Boolean);
  const hasUnderline = parts.includes('underline');
  const hasStrike = parts.includes('line-through');

  if (hasUnderline && hasStrike) return 'underline line-through';
  if (hasUnderline) return 'underline';
  if (hasStrike) return 'line-through';
  return 'none';
};

const buildDecorationFromFlags = (
  underline: boolean,
  strike: boolean,
): TextStyleType['textDecoration'] => {
  if (underline && strike) return 'underline line-through';
  if (underline) return 'underline';
  if (strike) return 'line-through';
  return 'none';
};

const getDecorationFlags = (
  decoration?: TextStyleType['textDecoration'],
): { underline: boolean; strike: boolean } => {
  const normalized = normalizeTextDecoration(decoration) ?? 'none';
  return {
    underline: normalized.includes('underline'),
    strike: normalized.includes('line-through'),
  };
};

const createMarksFromGlobalStyle = (
  globalStyle: Partial<TextStyleType>,
): Array<{ type: string; attrs?: Record<string, string> }> => {
  const marks: Array<{ type: string; attrs?: Record<string, string> }> = [];

  const normalizedDecoration = normalizeTextDecoration(globalStyle.textDecoration);

  if (globalStyle.fontWeight === 'bold') {
    marks.push({ type: 'bold' });
  }
  if (globalStyle.fontStyle === 'italic') {
    marks.push({ type: 'italic' });
  }
  if (normalizedDecoration?.includes('underline')) {
    marks.push({ type: 'underline' });
  }
  if (normalizedDecoration?.includes('line-through')) {
    marks.push({ type: 'strike' });
  }

  const textStyleAttrs: Record<string, string> = {};
  if (globalStyle.color) textStyleAttrs.color = globalStyle.color;
  if (globalStyle.backgroundColor) textStyleAttrs.backgroundColor = globalStyle.backgroundColor;
  if (globalStyle.fontSize) textStyleAttrs.fontSize = `${globalStyle.fontSize}px`;
  if (globalStyle.fontFamily) textStyleAttrs.fontFamily = globalStyle.fontFamily;

  if (Object.keys(textStyleAttrs).length > 0) {
    marks.push({ type: 'textStyle', attrs: textStyleAttrs });
  }

  return marks;
};

const createMarksFromMergedStyle = (
  localStyle: Partial<TextStyleType>,
  globalStyle: Partial<TextStyleType>,
): Array<{ type: string; attrs?: Record<string, string> }> => {
  const marks: Array<{ type: string; attrs?: Record<string, string> }> = [];

  const finalFontWeight = localStyle.fontWeight ?? globalStyle.fontWeight;
  const finalFontStyle = localStyle.fontStyle ?? globalStyle.fontStyle;

  // textDecoration 合并：局部未显式 none 时，与全局做并集；局部为 none 时清空
  const globalDecorationFlags = getDecorationFlags(globalStyle.textDecoration);
  const localDecorationNormalized =
    localStyle.textDecoration !== undefined
      ? normalizeTextDecoration(localStyle.textDecoration)
      : undefined;
  const localDecorationFlags =
    localDecorationNormalized !== undefined
      ? getDecorationFlags(localDecorationNormalized)
      : undefined;

  const finalUnderline = (() => {
    if (localDecorationNormalized === 'none') return false;
    if (localDecorationFlags)
      return localDecorationFlags.underline || globalDecorationFlags.underline;
    return globalDecorationFlags.underline;
  })();

  const finalStrike = (() => {
    if (localDecorationNormalized === 'none') return false;
    if (localDecorationFlags) return localDecorationFlags.strike || globalDecorationFlags.strike;
    return globalDecorationFlags.strike;
  })();

  const finalTextDecoration = normalizeTextDecoration(
    buildDecorationFromFlags(finalUnderline, finalStrike),
  );
  const finalColor = localStyle.color ?? globalStyle.color;
  const finalBackgroundColor = localStyle.backgroundColor ?? globalStyle.backgroundColor;
  const finalFontSize = localStyle.fontSize ?? globalStyle.fontSize;
  const finalFontFamily = localStyle.fontFamily ?? globalStyle.fontFamily;

  if (finalFontWeight === 'bold') marks.push({ type: 'bold' });
  if (finalFontStyle === 'italic') marks.push({ type: 'italic' });
  if (finalTextDecoration?.includes('underline')) marks.push({ type: 'underline' });
  if (finalTextDecoration?.includes('line-through')) marks.push({ type: 'strike' });

  const textStyleAttrs: Record<string, string> = {};
  if (finalColor) textStyleAttrs.color = finalColor;
  if (finalBackgroundColor) textStyleAttrs.backgroundColor = finalBackgroundColor;
  if (finalFontSize) textStyleAttrs.fontSize = `${finalFontSize}px`;
  if (finalFontFamily) textStyleAttrs.fontFamily = finalFontFamily;

  if (Object.keys(textStyleAttrs).length > 0) {
    marks.push({ type: 'textStyle', attrs: textStyleAttrs });
  }

  return marks;
};

/**
 * 从纯文本和富文本片段构建 Tiptap JSON 内容
 *
 * @param text - 纯文本内容
 * @param richTextSpans - 样式片段数组
 * @param globalTextStyle - 全局文本样式(用于对比,避免重复应用)
 * @returns Tiptap JSON 结构或纯文本字符串`
 */
export const buildTiptapContent = (
  text: string,
  richTextSpans?: RichTextSpan[],
  globalTextStyle?: Partial<TextStyleType>,
) => {
  console.log('[TiptapConverter] Building content from richText:', {
    text,
    richTextSpans,
    globalTextStyle,
  });

  // 如果没有局部样式，所有文本应用全局样式
  if (!richTextSpans || richTextSpans.length === 0) {
    const globalMarks = globalTextStyle ? createMarksFromGlobalStyle(globalTextStyle) : [];
    const content: ContentNode[] = [
      {
        type: 'text',
        text: text,
        marks: globalMarks.length > 0 ? globalMarks : undefined,
      },
    ];

    const result = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content,
        },
      ],
    };
    console.log('[TiptapConverter] Built Tiptap content (no local styles):', result);
    return result;
  }

  // 按起始位置排序
  const sortedSpans = [...richTextSpans].sort((a, b) => a.start - b.start);

  const content: ContentNode[] = [];
  let lastIndex = 0;

  sortedSpans.forEach((span) => {
    // 添加 span 前的文本，应用全局样式
    if (span.start > lastIndex) {
      const globalMarks = globalTextStyle ? createMarksFromGlobalStyle(globalTextStyle) : [];
      content.push({
        type: 'text',
        text: text.slice(lastIndex, span.start),
        marks: globalMarks.length > 0 ? globalMarks : undefined,
      });
    }

    // 为局部样式片段创建marks（合并全局和局部样式）
    const marks = globalTextStyle
      ? createMarksFromMergedStyle(span.style, globalTextStyle)
      : createMarksFromMergedStyle(span.style, {});

    // 添加带样式的文本
    content.push({
      type: 'text',
      text: text.slice(span.start, span.end),
      marks: marks.length > 0 ? marks : undefined,
    });

    lastIndex = span.end;
  });

  // 添加剩余文本，应用全局样式
  if (lastIndex < text.length) {
    const globalMarks = globalTextStyle ? createMarksFromGlobalStyle(globalTextStyle) : [];
    content.push({
      type: 'text',
      text: text.slice(lastIndex),
      marks: globalMarks.length > 0 ? globalMarks : undefined,
    });
  }

  const result = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content,
      },
    ],
  };

  console.log('[TiptapConverter] Built Tiptap content:', result);
  return result;
};

/**
 * 从 Tiptap JSON 提取纯文本和富文本片段
 * @param json - Tiptap JSON 结构
 * @param globalTextStyle - 全局文本样式(用于对比,生成相对差异)
 * @returns 包含纯文本和样式片段数组的对象
 */
export const parseTiptapContent = (
  json: TiptapJSON,
  globalTextStyle?: Partial<TextStyleType>,
): { content: string; richText: RichTextSpan[] } => {
  const spans: RichTextSpan[] = [];
  let plainText = '';
  let currentIndex = 0;

  const traverse = (node: TiptapNode) => {
    if (node.type === 'text' && node.text) {
      const textLength = node.text.length;
      plainText += node.text;

      const markState = {
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        color: undefined as string | undefined,
        backgroundColor: undefined as string | undefined,
        fontSize: undefined as number | undefined,
        fontFamily: undefined as string | undefined,
        hasColor: false,
        hasBackground: false,
        hasFontSize: false,
        hasFontFamily: false,
      };

      if (node.marks && node.marks.length > 0) {
        node.marks.forEach((mark) => {
          if (mark.type === 'bold') markState.bold = true;
          if (mark.type === 'italic') markState.italic = true;
          if (mark.type === 'underline') markState.underline = true;
          if (mark.type === 'strike') markState.strike = true;
          if (mark.type === 'textStyle' && mark.attrs) {
            if (mark.attrs.color) {
              markState.color = mark.attrs.color;
              markState.hasColor = true;
            }
            if (mark.attrs.backgroundColor) {
              markState.backgroundColor = mark.attrs.backgroundColor;
              markState.hasBackground = true;
            }
            if (mark.attrs.fontSize) {
              markState.fontSize = parseInt(mark.attrs.fontSize, 10);
              markState.hasFontSize = true;
            }
            if (mark.attrs.fontFamily) {
              markState.fontFamily = mark.attrs.fontFamily;
              markState.hasFontFamily = true;
            }
          }
        });
      }

      const effectiveFontWeight: TextStyleType['fontWeight'] = markState.bold ? 'bold' : 'normal';
      const effectiveFontStyle: TextStyleType['fontStyle'] = markState.italic ? 'italic' : 'normal';
      const effectiveTextDecoration =
        normalizeTextDecoration(buildDecorationFromFlags(markState.underline, markState.strike)) ??
        'none';

      const localDiff: Partial<TextStyleType> = {};
      let hasDifference = false;

      if (globalTextStyle) {
        const globalFontWeight = globalTextStyle.fontWeight ?? 'normal';
        const globalFontStyle = globalTextStyle.fontStyle ?? 'normal';
        const globalTextDecoration =
          normalizeTextDecoration(globalTextStyle.textDecoration) ?? 'none';

        if (effectiveFontWeight !== globalFontWeight) {
          localDiff.fontWeight = effectiveFontWeight;
          hasDifference = true;
        }
        if (effectiveFontStyle !== globalFontStyle) {
          localDiff.fontStyle = effectiveFontStyle;
          hasDifference = true;
        }
        if (effectiveTextDecoration !== globalTextDecoration) {
          localDiff.textDecoration = effectiveTextDecoration;
          hasDifference = true;
        }

        if (markState.hasColor && markState.color !== globalTextStyle.color) {
          localDiff.color = markState.color;
          hasDifference = true;
        }
        if (
          markState.hasBackground &&
          markState.backgroundColor !== globalTextStyle.backgroundColor
        ) {
          localDiff.backgroundColor = markState.backgroundColor;
          hasDifference = true;
        }
        if (markState.hasFontSize && markState.fontSize !== globalTextStyle.fontSize) {
          localDiff.fontSize = markState.fontSize;
          hasDifference = true;
        }
        if (markState.hasFontFamily && markState.fontFamily !== globalTextStyle.fontFamily) {
          localDiff.fontFamily = markState.fontFamily;
          hasDifference = true;
        }
      } else {
        if (markState.bold) {
          localDiff.fontWeight = 'bold';
          hasDifference = true;
        }
        if (markState.italic) {
          localDiff.fontStyle = 'italic';
          hasDifference = true;
        }
        if (effectiveTextDecoration !== 'none') {
          localDiff.textDecoration = effectiveTextDecoration;
          hasDifference = true;
        }
        if (markState.hasColor) {
          localDiff.color = markState.color;
          hasDifference = true;
        }
        if (markState.hasBackground) {
          localDiff.backgroundColor = markState.backgroundColor;
          hasDifference = true;
        }
        if (markState.hasFontSize) {
          localDiff.fontSize = markState.fontSize;
          hasDifference = true;
        }
        if (markState.hasFontFamily) {
          localDiff.fontFamily = markState.fontFamily;
          hasDifference = true;
        }
      }

      if (hasDifference) {
        spans.push({
          start: currentIndex,
          end: currentIndex + textLength,
          style: localDiff,
        });
      }

      currentIndex += textLength;
    } else if (node.content) {
      node.content.forEach(traverse);
    } else if (node.type === 'hardBreak') {
      plainText += '\n';
      currentIndex += 1;
    }
  };

  if (json.content && json.content.length > 0) {
    json.content.forEach((child: TiptapNode, index: number) => {
      traverse(child);
      if (json.content && index < json.content.length - 1) {
        plainText += '\n';
        currentIndex += 1;
      }
    });
  }

  console.log('[TiptapConverter] Parsed content:', { plainText, richText: spans });

  return { content: plainText, richText: spans };
};

/**
 * 清理与全局样式冲突的局部样式片段
 * 当全局样式变化时,移除与新全局样式相同的局部样式,避免冗余
 *
 * @param richTextSpans - 原始富文本片段数组
 * @param globalTextStyle - 新的全局文本样式
 * @returns 清理后的富文本片段数组
 */
export const cleanupRichTextSpans = (
  richTextSpans: RichTextSpan[] | undefined,
  globalTextStyle: Partial<TextStyleType>,
  // options can include whether to override local span colors with global values
  options?: { overrideLocalStyleWithGlobal?: boolean },
): RichTextSpan[] => {
  if (!richTextSpans || richTextSpans.length === 0) {
    return [];
  }

  console.log('[TiptapConverter] Cleaning up richText spans:', { richTextSpans, globalTextStyle });

  const cleanedSpans: RichTextSpan[] = [];
  const normalizedGlobalDecoration =
    normalizeTextDecoration(globalTextStyle.textDecoration) ?? 'none';

  for (const span of richTextSpans) {
    // 如果传入了 overrideLocalStyleWithGlobal 且全局有 color/backgroundColor，则把局部颜色覆盖为全局颜色
    const spanCopy: RichTextSpan = {
      start: span.start,
      end: span.end,
      style: { ...span.style },
    };
    // Apply overrides from global style if requested
    if (options?.overrideLocalStyleWithGlobal) {
      if (globalTextStyle.color !== undefined) {
        spanCopy.style.color = globalTextStyle.color;
      }
      if (globalTextStyle.backgroundColor !== undefined) {
        spanCopy.style.backgroundColor = globalTextStyle.backgroundColor;
      }
    }
    const sourceSpan = options?.overrideLocalStyleWithGlobal ? spanCopy : span;
    const cleanedStyle: Partial<TextStyleType> = {};
    let hasUniqueStyle = false;

    const normalizedLocalDecoration = sourceSpan.style.textDecoration
      ? normalizeTextDecoration(sourceSpan.style.textDecoration)
      : undefined;

    // 只保留与全局样式不同的局部样式
    if (
      sourceSpan.style.fontWeight !== undefined &&
      sourceSpan.style.fontWeight !== globalTextStyle.fontWeight
    ) {
      cleanedStyle.fontWeight = sourceSpan.style.fontWeight;
      hasUniqueStyle = true;
    }
    if (
      sourceSpan.style.fontStyle !== undefined &&
      sourceSpan.style.fontStyle !== globalTextStyle.fontStyle
    ) {
      cleanedStyle.fontStyle = sourceSpan.style.fontStyle;
      hasUniqueStyle = true;
    }
    if (
      normalizedLocalDecoration !== undefined &&
      normalizedLocalDecoration !== normalizedGlobalDecoration
    ) {
      cleanedStyle.textDecoration = normalizedLocalDecoration;
      hasUniqueStyle = true;
    }
    if (sourceSpan.style.color !== undefined && sourceSpan.style.color !== globalTextStyle.color) {
      cleanedStyle.color = sourceSpan.style.color;
      hasUniqueStyle = true;
    }
    if (
      sourceSpan.style.backgroundColor !== undefined &&
      sourceSpan.style.backgroundColor !== globalTextStyle.backgroundColor
    ) {
      cleanedStyle.backgroundColor = sourceSpan.style.backgroundColor;
      hasUniqueStyle = true;
    }
    if (
      sourceSpan.style.fontSize !== undefined &&
      sourceSpan.style.fontSize !== globalTextStyle.fontSize
    ) {
      cleanedStyle.fontSize = sourceSpan.style.fontSize;
      hasUniqueStyle = true;
    }
    if (
      sourceSpan.style.fontFamily !== undefined &&
      sourceSpan.style.fontFamily !== globalTextStyle.fontFamily
    ) {
      cleanedStyle.fontFamily = sourceSpan.style.fontFamily;
      hasUniqueStyle = true;
    }

    // 只有存在独特样式时才保留该片段
    if (hasUniqueStyle) {
      cleanedSpans.push({
        start: span.start,
        end: span.end,
        style: cleanedStyle,
      });
    }
  }

  console.log('[TiptapConverter] Cleaned richText spans:', cleanedSpans);

  return cleanedSpans;
};
