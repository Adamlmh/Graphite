import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Underline } from '@tiptap/extension-underline';
import type { TextElement, RichTextSpan } from '../../../../types';
import InlineTextToolbar from './InlineTextToolbar';
import { FontSize, BackgroundColor } from './extensions';
import { buildTiptapContent, parseTiptapContent } from '../../../../utils/tiptapConverter';
import { calculateToolbarPosition } from '../../../../utils/toolbarPositioning';
import { eventBus } from '../../../../lib/eventBus';
import './RichTextEditor.less';

export interface RichTextEditorProps {
  element: TextElement;
  position: { x: number; y: number }; // 屏幕坐标
  onUpdate: (content: string, richText?: RichTextSpan[]) => void;
  onBlur: (e: React.FocusEvent) => void;
  onStyleChange?: (style: Partial<TextElement['textStyle']>) => void; // 用于局部文本样式处理
}

/**
 * 富文本编辑器组件
 * 基于 Tiptap 实现，作为 DOM Overlay 层显示在画布上方
 */
const RichTextEditor: React.FC<RichTextEditorProps> = ({ element, position, onUpdate, onBlur }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const { content, textStyle, width, height, richText } = element;

  // 选择状态管理
  const [selection, setSelection] = useState<{
    visible: boolean;
    position: { x: number; y: number };
  }>({
    visible: false,
    position: { x: 0, y: 0 },
  });

  // 更新触发器，用于强制刷新 InlineTextToolbar
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // 从 richText 构建初始内容
  const initialContent =
    richText && richText.length > 0 ? buildTiptapContent(content || '', richText) : content || '';

  console.log('[RichTextEditor] Initializing with:', { content, richText, initialContent });

  // 处理选择变化
  const handleSelectionUpdate = useCallback((editor: NonNullable<ReturnType<typeof useEditor>>) => {
    console.log('[RichTextEditor] Selection update triggered'); // 调试信息

    // 延迟执行，确保DOM已更新
    setTimeout(() => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;

      console.log('[RichTextEditor] Selection info:', { from, to, hasSelection }); // 调试信息

      if (hasSelection) {
        // 获取编辑器容器的位置
        const editorContainer = editorRef.current?.querySelector('.ProseMirror');
        if (editorContainer) {
          const containerRect = editorContainer.getBoundingClientRect();

          // 计算工具栏位置
          const toolbarPosition = calculateToolbarPosition(containerRect, {
            width: 280,
            height: 60,
            gap: 8,
            viewportPadding: 16,
          });

          console.log('[RichTextEditor] Toolbar position calculated:', toolbarPosition); // 调试信息

          setSelection({
            visible: true,
            position: toolbarPosition,
          });
          eventBus.emit('text-editor:selection-change', { hasSelection: true });
        }
      } else {
        console.log('[RichTextEditor] Hiding toolbar'); // 调试信息
        setSelection({ visible: false, position: { x: 0, y: 0 } });
        eventBus.emit('text-editor:selection-change', { hasSelection: false });
      }
    }, 50); // 延迟50ms确保DOM更新
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // 禁用标题
        codeBlock: false, // 禁用代码块
        horizontalRule: false, // 禁用分割线
        blockquote: false, // 禁用引用块
      }),
      TextStyle,
      Color,
      Underline,
      FontSize,
      BackgroundColor,
    ],
    content: initialContent,
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
      const json = editor.getJSON();
      const { content: plainText, richText } = parseTiptapContent(json);

      console.log('[RichTextEditor] Syncing to Zustand:', { plainText, richText }); // 调试信息

      onUpdate(plainText, richText);
      setUpdateTrigger((prev) => prev + 1);
    },
    onSelectionUpdate: ({ editor }) => {
      // 处理选择变化
      console.log('[RichTextEditor] Selection Changed');
      handleSelectionUpdate(editor);
      setUpdateTrigger((prev) => prev + 1);
    },
    onBlur: ({ event }) => {
      // 延迟隐藏，给用户时间点击工具栏
      setTimeout(() => {
        setSelection({ visible: false, position: { x: 0, y: 0 } });
        eventBus.emit('text-editor:selection-change', { hasSelection: false });
      }, 150);
      onBlur(event as unknown as React.FocusEvent);
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

      {/* 浮动文本工具栏 */}
      {editor && (
        <InlineTextToolbar
          editor={editor}
          visible={selection.visible}
          position={selection.position}
          updateTrigger={updateTrigger}
        />
      )}
    </div>
  );
};

export default RichTextEditor;
