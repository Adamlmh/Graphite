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

/**
 * 从纯文本和富文本片段构建 Tiptap JSON 内容
 *
 * @param text - 纯文本内容
 * @param richTextSpans - 样式片段数组
 * @returns Tiptap JSON 结构或纯文本字符串`
 */
export const buildTiptapContent = (text: string, richTextSpans?: RichTextSpan[]) => {
  if (!richTextSpans || richTextSpans.length === 0) {
    // 没有样式，直接返回纯文本
    return text;
  }

  console.log('[TiptapConverter] Building content from richText:', { text, richTextSpans });

  // 按起始位置排序
  const sortedSpans = [...richTextSpans].sort((a, b) => a.start - b.start);

  const content: ContentNode[] = [];
  let lastIndex = 0;

  sortedSpans.forEach((span) => {
    // 添加 span 前的普通文本
    if (span.start > lastIndex) {
      content.push({
        type: 'text',
        text: text.slice(lastIndex, span.start),
      });
    }

    // 构建 marks
    const marks: Array<{ type: string; attrs?: Record<string, string> }> = [];
    const { style } = span;

    if (style.fontWeight === 'bold') {
      marks.push({ type: 'bold' });
    }
    if (style.fontStyle === 'italic') {
      marks.push({ type: 'italic' });
    }
    if (style.textDecoration?.includes('underline')) {
      marks.push({ type: 'underline' });
    }
    if (style.textDecoration?.includes('line-through')) {
      marks.push({ type: 'strike' });
    }

    // 构建 textStyle attrs
    const textStyleAttrs: Record<string, string> = {};
    if (style.color) {
      textStyleAttrs.color = style.color;
    }
    if (style.backgroundColor) {
      textStyleAttrs.backgroundColor = style.backgroundColor;
    }
    if (style.fontSize) {
      textStyleAttrs.fontSize = `${style.fontSize}px`;
    }
    if (style.fontFamily) {
      textStyleAttrs.fontFamily = style.fontFamily;
    }

    if (Object.keys(textStyleAttrs).length > 0) {
      marks.push({ type: 'textStyle', attrs: textStyleAttrs });
    }

    // 添加带样式的文本
    content.push({
      type: 'text',
      text: text.slice(span.start, span.end),
      marks: marks.length > 0 ? marks : undefined,
    });

    lastIndex = span.end;
  });

  // 添加剩余文本
  if (lastIndex < text.length) {
    content.push({
      type: 'text',
      text: text.slice(lastIndex),
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
 * @returns 包含纯文本和样式片段数组的对象
 */
export const parseTiptapContent = (
  json: TiptapJSON,
): { content: string; richText: RichTextSpan[] } => {
  const spans: RichTextSpan[] = [];
  let plainText = '';
  let currentIndex = 0;

  const traverse = (node: TiptapNode) => {
    if (node.type === 'text' && node.text) {
      // 处理文本节点
      const textLength = node.text.length;
      plainText += node.text;

      // 遍历 marks 提取样式
      if (node.marks && node.marks.length > 0) {
        const style: Partial<TextStyleType> = {};

        node.marks.forEach((mark) => {
          if (mark.type === 'bold') {
            style.fontWeight = 'bold';
          }
          if (mark.type === 'italic') {
            style.fontStyle = 'italic';
          }
          if (mark.type === 'underline') {
            style.textDecoration = style.textDecoration
              ? (`${style.textDecoration} underline` as TextStyleType['textDecoration'])
              : 'underline';
          }
          if (mark.type === 'strike') {
            style.textDecoration = style.textDecoration
              ? (`${style.textDecoration} line-through` as TextStyleType['textDecoration'])
              : 'line-through';
          }
          if (mark.type === 'textStyle' && mark.attrs) {
            if (mark.attrs.color) {
              style.color = mark.attrs.color;
            }
            if (mark.attrs.backgroundColor) {
              style.backgroundColor = mark.attrs.backgroundColor;
            }
            if (mark.attrs.fontSize) {
              style.fontSize = parseInt(mark.attrs.fontSize);
            }
            if (mark.attrs.fontFamily) {
              style.fontFamily = mark.attrs.fontFamily;
            }
          }
        });

        if (Object.keys(style).length > 0) {
          spans.push({
            start: currentIndex,
            end: currentIndex + textLength,
            style,
          });
        }
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
      // Add newline between blocks (paragraphs)
      if (json.content && index < json.content.length - 1) {
        plainText += '\n';
        currentIndex += 1;
      }
    });
  }

  console.log('[TiptapConverter] Parsed content:', { plainText, richText: spans });

  return { content: plainText, richText: spans };
};
