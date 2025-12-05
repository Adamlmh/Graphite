import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Underline } from '@tiptap/extension-underline';
import type { TextElement, TextStyle as TextStyleType } from '../../../../types';
import InlineTextToolbar from './InlineTextToolbar';
import './RichTextEditor.less';

export interface RichTextEditorProps {
  element: TextElement;
  position: { x: number; y: number }; // 屏幕坐标
  onUpdate: (content: string) => void;
  onBlur: () => void;
  onStyleChange?: (style: Partial<TextElement['textStyle']>) => void; // 用于局部文本样式处理
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

  // 选择状态管理
  const [selection, setSelection] = useState<{
    visible: boolean;
    position: { x: number; y: number };
  }>({
    visible: false,
    position: { x: 0, y: 0 },
  });

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
      onUpdate(text); // 传递纯文本内容
    },
    onSelectionUpdate: ({ editor }) => {
      // 处理选择变化
      handleSelectionUpdate(editor);
    },
    onBlur: () => {
      // 延迟隐藏，给用户时间点击工具栏
      setTimeout(() => {
        setSelection({ visible: false, position: { x: 0, y: 0 } });
      }, 150);
      onBlur();
    },
    autofocus: 'end',
  });

  // 使用简化的定位算法，直接基于屏幕坐标计算
  const calculateToolbarPosition = useCallback((containerRect: DOMRect) => {
    const toolbarWidth = 280;
    const toolbarHeight = 60;
    const gap = 8; // 与选中区域的间距
    const viewportPadding = 16; // 距离视口边缘的最小距离

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 可用空间检测
    const spaceAbove = containerRect.top - viewportPadding;
    const spaceBelow = viewportHeight - containerRect.bottom - viewportPadding;
    const spaceLeft = containerRect.left - viewportPadding;
    const spaceRight = viewportWidth - containerRect.right - viewportPadding;

    const position = { x: 0, y: 0 };

    // 1. 优先尝试放在上方
    if (spaceAbove >= toolbarHeight + gap) {
      position.y = containerRect.top - toolbarHeight - gap;
      // 水平居中，但要避免超出视口
      position.x = containerRect.left + containerRect.width / 2 - toolbarWidth / 2;
      position.x = Math.max(
        viewportPadding,
        Math.min(position.x, viewportWidth - viewportPadding - toolbarWidth),
      );
    }
    // 2. 尝试放在下方
    else if (spaceBelow >= toolbarHeight + gap) {
      position.y = containerRect.bottom + gap;
      // 水平居中，但要避免超出视口
      position.x = containerRect.left + containerRect.width / 2 - toolbarWidth / 2;
      position.x = Math.max(
        viewportPadding,
        Math.min(position.x, viewportWidth - viewportPadding - toolbarWidth),
      );
    }
    // 3. 尝试放在左侧
    else if (spaceLeft >= toolbarWidth + gap) {
      position.x = containerRect.left - toolbarWidth - gap;
      // 垂直居中
      position.y = containerRect.top + containerRect.height / 2 - toolbarHeight / 2;
      position.y = Math.max(
        viewportPadding,
        Math.min(position.y, viewportHeight - viewportPadding - toolbarHeight),
      );
    }
    // 4. 尝试放在右侧
    else if (spaceRight >= toolbarWidth + gap) {
      position.x = containerRect.right + gap;
      // 垂直居中
      position.y = containerRect.top + containerRect.height / 2 - toolbarHeight / 2;
      position.y = Math.max(
        viewportPadding,
        Math.min(position.y, viewportHeight - viewportPadding - toolbarHeight),
      );
    }
    // 5. 都放不下，选择最大空间的方向
    else {
      const maxSpace = Math.max(spaceAbove, spaceBelow, spaceLeft, spaceRight);

      if (maxSpace === spaceAbove) {
        // 放在上方，尽可能靠近元素
        position.y = Math.max(viewportPadding, containerRect.top - toolbarHeight - gap);
        position.x = containerRect.left + containerRect.width / 2 - toolbarWidth / 2;
        position.x = Math.max(
          viewportPadding,
          Math.min(position.x, viewportWidth - viewportPadding - toolbarWidth),
        );
      } else if (maxSpace === spaceBelow) {
        // 放在下方
        position.y = Math.min(
          containerRect.bottom + gap,
          viewportHeight - viewportPadding - toolbarHeight,
        );
        position.x = containerRect.left + containerRect.width / 2 - toolbarWidth / 2;
        position.x = Math.max(
          viewportPadding,
          Math.min(position.x, viewportWidth - viewportPadding - toolbarWidth),
        );
      } else {
        // 使用默认位置（上方）
        position.x = containerRect.left + containerRect.width / 2 - toolbarWidth / 2;
        position.y = containerRect.top - toolbarHeight - gap;
      }
    }

    return position;
  }, []);

  // 处理选择变化
  const handleSelectionUpdate = useCallback(
    (editor: NonNullable<ReturnType<typeof useEditor>>) => {
      console.log('Selection update triggered'); // 调试信息

      // 延迟执行，确保DOM已更新
      setTimeout(() => {
        const { from, to } = editor.state.selection;
        const hasSelection = from !== to;

        console.log('Selection info:', { from, to, hasSelection }); // 调试信息

        if (hasSelection) {
          // 获取编辑器容器的位置
          const editorContainer = editorRef.current?.querySelector('.ProseMirror');
          if (editorContainer) {
            const containerRect = editorContainer.getBoundingClientRect();

            // 使用简化的定位算法，直接基于屏幕坐标
            const toolbarPosition = calculateToolbarPosition(containerRect);

            console.log('Toolbar position calculated:', toolbarPosition); // 调试信息

            setSelection({
              visible: true,
              position: toolbarPosition,
            });
          }
        } else {
          console.log('Hiding toolbar'); // 调试信息
          setSelection({ visible: false, position: { x: 0, y: 0 } });
        }
      }, 50); // 延迟50ms确保DOM更新
    },
    [calculateToolbarPosition],
  );

  // 处理局部样式变化
  const handleInlineStyleChange = useCallback(
    (style: Partial<TextStyleType>) => {
      // 通过onStyleChange回调处理局部文本样式
      if (onStyleChange) {
        onStyleChange(style);
      }
    },
    [onStyleChange],
  );

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
          onStyleChange={handleInlineStyleChange}
        />
      )}
    </div>
  );
};

export default RichTextEditor;
