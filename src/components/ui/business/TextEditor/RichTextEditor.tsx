import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Underline } from '@tiptap/extension-underline';
import type { TextElement, RichTextSpan } from '../../../../types';
import InlineTextToolbar from './InlineTextToolbar';
import { FontSize, BackgroundColor, FontFamily } from './extensions';
import { buildTiptapContent, parseTiptapContent } from '../../../../utils/tiptapConverter';
import { calculateToolbarPosition } from '../../../../utils/toolbarPositioning';
import { eventBus } from '../../../../lib/eventBus';
import './RichTextEditor.less';

export interface RichTextEditorProps {
  element: TextElement;
  position: { x: number; y: number }; // 屏幕坐标
  zoom?: number; // 🎯 视口缩放级别，用于统一编辑态和查看态的尺寸
  onUpdate: (content: string, richText?: RichTextSpan[]) => void;
  onBlur: (e: React.FocusEvent) => void;
  onStyleChange?: (style: Partial<TextElement['textStyle']>) => void; // 用于局部文本样式处理
}

/**
 * 富文本编辑器组件
 * 基于 Tiptap 实现，作为 DOM Overlay 层显示在画布上方
 */
const RichTextEditor: React.FC<RichTextEditorProps> = ({
  element,
  position,
  zoom = 1,
  onUpdate,
  onBlur,
}) => {
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

  // 记录最近一次有效的选区，用于在工具栏交互时保持选区
  const [lastSelectionRange, setLastSelectionRange] = useState<{ from: number; to: number } | null>(
    null,
  );

  // 记录上一次工具栏位置，用于在选区暂时为空时保持工具栏不闪退
  const [lastToolbarPosition, setLastToolbarPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  // 更新触发器，用于强制刷新 InlineTextToolbar
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // 从 richText 构建初始内容
  // 注意：始终传入textStyle以确保全局样式被正确应用
  const initialContent = buildTiptapContent(content || '', richText, textStyle);

  console.log('[RichTextEditor] Initializing with:', {
    content,
    richText,
    textStyle,
    initialContent,
  });

  // 处理选择变化
  const handleSelectionUpdate = useCallback(
    (editor: NonNullable<ReturnType<typeof useEditor>>) => {
      console.log('[RichTextEditor] Selection update triggered'); // 调试信息

      // 延迟执行，确保DOM已更新
      setTimeout(() => {
        const { from, to } = editor.state.selection;
        const hasSelection = from !== to;

        console.log('[RichTextEditor] Selection info:', { from, to, hasSelection }); // 调试信息

        if (hasSelection) {
          // 记录最近一次有效选区
          setLastSelectionRange({ from, to });

          // 🎯 关键修复: 使用浏览器原生选区获取选中文本的实际屏幕位置
          // 这样可以正确获取选中文本的边界，而不是整个编辑器容器
          const domSelection = window.getSelection();
          if (domSelection && domSelection.rangeCount > 0) {
            const range = domSelection.getRangeAt(0);
            // 获取选中文本的边界矩形（屏幕坐标，已包含所有 transform 效果）
            const selectionRect = range.getBoundingClientRect();

            console.log('[RichTextEditor] Selection rect:', {
              top: selectionRect.top,
              left: selectionRect.left,
              width: selectionRect.width,
              height: selectionRect.height,
            });

            // 计算工具栏位置 - 基于选中文本的实际位置
            const toolbarPosition = calculateToolbarPosition(selectionRect, {
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
            setLastToolbarPosition(toolbarPosition);
            eventBus.emit('text-editor:selection-change', { hasSelection: true });
          }
        } else {
          // 选区为空，但如果仍然聚焦或正在操作工具栏，并且有最近的选区记录，则保持工具栏可见，防止闪退
          const activeEl = document.activeElement as HTMLElement | null;
          const interactingToolbar =
            activeEl &&
            (activeEl.closest('[data-toolbar="inline-text"]') ||
              activeEl.closest('.ant-select-dropdown') ||
              activeEl.closest('.ant-popover'));

          const hasFocus = editor.view.hasFocus() || !!interactingToolbar;

          if (hasFocus && lastSelectionRange && lastToolbarPosition) {
            console.log('[RichTextEditor] Keeping toolbar visible with last selection');
            setSelection({ visible: true, position: lastToolbarPosition });
            eventBus.emit('text-editor:selection-change', { hasSelection: true });
          } else {
            console.log('[RichTextEditor] Hiding toolbar'); // 调试信息
            setSelection({ visible: false, position: { x: 0, y: 0 } });
            eventBus.emit('text-editor:selection-change', { hasSelection: false });
          }
        }
      }, 50); // 延迟50ms确保DOM更新
    },
    [lastSelectionRange, lastToolbarPosition],
  );

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
      FontFamily,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'rich-text-editor-content',
        style: `
          font-family: ${textStyle.fontFamily};
          font-size: ${textStyle.fontSize}px;
          color: ${textStyle.color};
          text-align: ${textStyle.textAlign};
          line-height: ${textStyle.lineHeight};
        `,
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      // 🎯 关键修复: 传入globalTextStyle，让parseTiptapContent生成相对差异
      const { content: plainText, richText } = parseTiptapContent(json, textStyle);

      // cleanupRichTextSpans不再需要，因为parseTiptapContent已经生成了差异
      console.log('[RichTextEditor] Syncing to Zustand:', {
        plainText,
        richText,
        globalStyle: textStyle,
      });

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
      const nativeEvent = event as unknown as FocusEvent;
      const relatedTarget = nativeEvent.relatedTarget as HTMLElement | null;

      console.log('[RichTextEditor] onBlur triggered, relatedTarget:', relatedTarget);

      // 检查失焦目标是否在工具栏内或是 Ant Design 的弹出层
      const isClickingToolbar =
        relatedTarget &&
        // 检查是否点击了工具栏容器
        (relatedTarget.closest('[data-toolbar="inline-text"]') ||
          // 检查是否点击了 Ant Design 的下拉菜单
          relatedTarget.closest('.ant-select-dropdown') ||
          // 检查是否点击了 ColorPicker 的面板
          relatedTarget.closest('.ant-popover') ||
          // 检查是否点击了 Popover 内容
          relatedTarget.closest('.ant-popover-inner'));

      if (isClickingToolbar) {
        console.log('[RichTextEditor] Clicking toolbar, maintaining selection');
        return; // 不关闭工具栏
      }

      // 延迟隐藏，给用户时间点击工具栏（防止某些情况下 relatedTarget 为 null）
      setTimeout(() => {
        // 双重检查：如果当前焦点在工具栏内，不关闭
        const activeElement = document.activeElement as HTMLElement;
        if (
          activeElement &&
          (activeElement.closest('[data-toolbar="inline-text"]') ||
            activeElement.closest('.ant-select-dropdown') ||
            activeElement.closest('.ant-popover'))
        ) {
          console.log('[RichTextEditor] Active element in toolbar, maintaining selection');
          return;
        }

        console.log('[RichTextEditor] Hiding toolbar');
        setSelection({ visible: false, position: { x: 0, y: 0 } });
        eventBus.emit('text-editor:selection-change', { hasSelection: false });
      }, 300); // 增加延迟时间到 300ms

      onBlur(nativeEvent as unknown as React.FocusEvent);
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
        // 将 BIUS 基线回退到 normal，让 marks 控制加粗/斜体/下划线
        contentEl.style.fontWeight = 'normal';
        contentEl.style.fontStyle = 'normal';
        contentEl.style.color = textStyle.color;
        contentEl.style.textAlign = textStyle.textAlign;
        contentEl.style.lineHeight = `${textStyle.lineHeight}`;
        contentEl.style.textDecoration = 'none';

        // 🎯 不在编辑器DOM上应用背景色，背景色只在PIXI渲染层显示
        // 编辑器始终保持透明背景，确保用户可以看到下方的画布内容
        contentEl.style.backgroundColor = 'transparent';
      }

      // 🎯 关键修复: 当全局样式变化时,重新构建编辑器内容以应用新样式
      const currentJson = editor.getJSON();
      const newContent = buildTiptapContent(content || '', richText, textStyle);

      // 只在内容结构真正不同时才更新,避免不必要的光标跳动
      if (JSON.stringify(currentJson) !== JSON.stringify(newContent)) {
        console.log('[RichTextEditor] Global style changed, rebuilding content');
        editor.commands.setContent(newContent);
        // 触发InlineTextToolbar更新 - 使用setTimeout避免cascading render
        setTimeout(() => setUpdateTrigger((prev) => prev + 1), 0);
      }
    }
  }, [editor, textStyle, content, richText]);

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
        // 🎯 关键修复: 使用 transform: scale(zoom) 统一编辑态和查看态的尺寸
        // 原始尺寸乘以缩放级别，使 DOM 编辑器与 PIXI 渲染的文本大小一致
        width: `${width}px`,
        height: `${height}px`,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left', // 从左上角开始缩放，与坐标系对齐
        zIndex: 9999,
        pointerEvents: 'auto',
        boxSizing: 'border-box',
        overflow: 'visible', // 🎯 允许内容溢出，与 PIXI 渲染一致
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
          lastSelection={lastSelectionRange}
        />
      )}
    </div>
  );
};

export default RichTextEditor;
