import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { TextElement } from '../../../../types';
import './RichTextEditor.less';

export interface RichTextEditorProps {
  element: TextElement;
  position: { x: number; y: number }; // 屏幕坐标
  onUpdate: (content: string) => void;
  onBlur: () => void;
  onStyleChange?: (style: Partial<TextElement['textStyle']>) => void; // 预留接口：用于局部文本样式
}

/**
 * 富文本编辑器组件
 * 基于 Tiptap 实现，作为 DOM Overlay 层显示在画布上方
 */
const RichTextEditor: React.FC<RichTextEditorProps> = ({
  element,
  position,
  onUpdate,
  onBlur,
  onStyleChange,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const { content, textStyle, width, height } = element;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // 禁用标题
        codeBlock: false, // 禁用代码块
        horizontalRule: false, // 禁用分割线
        blockquote: false, // 禁用引用块
      }),
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class: 'rich-text-editor-content',
        style: `
          font-family: ${textStyle.fontFamily};
          font-size: ${textStyle.fontSize}px;
          font-weight: ${textStyle.fontWeight};
          font-style: ${textStyle.fontStyle};
          color: ${textStyle.color};
          text-align: ${textStyle.textAlign};
          line-height: ${textStyle.lineHeight};
        `,
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      onUpdate(text); // MVP: 只传递纯文本，后续可以存储 HTML 用于富文本
    },
    onBlur: () => {
      onBlur();
    },
    autofocus: 'end',
  });

  // 监听样式变化，更新编辑器样式
  useEffect(() => {
    if (editor && editorRef.current) {
      const contentEl = editorRef.current.querySelector('.ProseMirror') as HTMLElement;
      if (contentEl) {
        // 应用所有文本样式
        contentEl.style.fontFamily = textStyle.fontFamily;
        contentEl.style.fontSize = `${textStyle.fontSize}px`;
        contentEl.style.fontWeight = textStyle.fontWeight;
        contentEl.style.fontStyle = textStyle.fontStyle;
        contentEl.style.color = textStyle.color;
        contentEl.style.textAlign = textStyle.textAlign;
        contentEl.style.lineHeight = `${textStyle.lineHeight}`;

        // 应用背景色
        if (textStyle.backgroundColor) {
          contentEl.style.backgroundColor = textStyle.backgroundColor;
        }

        // 应用文本装饰
        contentEl.style.textDecoration = textStyle.textDecoration || 'none';
      }
    }
  }, [editor, textStyle]);

  // 监听内容变化，同步到编辑器
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      // 避免光标位置丢失，只在内容真的不同时才更新
      const currentContent = editor.getText();
      if (currentContent !== (content || '')) {
        editor.commands.setContent(content || '');
      }
    }
  }, [editor, content]);

  // 自动聚焦 - 使用 setTimeout 确保编辑器已完全挂载
  useEffect(() => {
    if (editor) {
      // 延迟聚焦，确保 DOM 已经完全渲染
      const timer = setTimeout(() => {
        try {
          // 检查编辑器是否已挂载且可用
          if (editor.view && editor.view.dom) {
            editor.commands.focus('end');
          }
        } catch (error) {
          console.warn('Failed to focus editor:', error);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [editor]);

  // 清理
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div
      ref={editorRef}
      className="rich-text-editor-overlay"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${width}px`,
        minHeight: `${height}px`,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
