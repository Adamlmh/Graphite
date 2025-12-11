import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, Tooltip, ColorPicker, Slider, Popover, Select } from 'antd';
import { historyService } from '../../../../services/instances';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  FontSizeOutlined,
  BgColorsOutlined,
} from '@ant-design/icons';
import type { Editor } from '@tiptap/react';
import { debounce } from '../../../../utils';
import { eventBus } from '../../../../lib/eventBus';
import styles from '../Propertities/TextProperties/TextProperties.module.less';

export interface InlineTextToolbarProps {
  editor: Editor;
  visible: boolean;
  position: { x: number; y: number };
  updateTrigger?: number; // 用于强制刷新组件的触发器
  lastSelection?: { from: number; to: number } | null; // 最近一次有效选区，用于保持选区
}

// 常用字体列表
const FONT_FAMILIES = [
  { label: '默认字体', value: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif' },
  { label: '宋体', value: 'SimSun, STSong, serif' },
  { label: '黑体', value: 'SimHei, STHeiti, sans-serif' },
  { label: '微软雅黑', value: 'Microsoft YaHei, sans-serif' },
  { label: '楷体', value: 'KaiTi, STKaiti, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
];

/**
 * 行内文本工具栏
 * 当用户选中文本片段时显示，提供局部文本样式编辑功能
 *
 * 数据流转逻辑：
 * 1. Tiptap Editor 是选择状态和样式的"单一数据源" (Single Source of Truth)。
 * 2. 当编辑器选区变化或内容更新时，父组件 (RichTextEditor) 会更新 updateTrigger。
 * 3. 本组件通过 useMemo 依赖 updateTrigger，重新从 editor.isActive() / editor.getAttributes() 获取当前选区的样式。
 * 4. 用户点击按钮 -> 调用 editor.chain()...run() 修改编辑器内部状态。
 * 5. 编辑器内部状态变化 -> 触发 onUpdate/onSelectionUpdate -> 更新 updateTrigger -> 重新渲染本组件按钮高亮状态。
 * 6. 同时 RichTextEditor 的 onUpdate 会将最终的富文本数据同步到 Zustand Store。
 */
const InlineTextToolbar: React.FC<InlineTextToolbarProps> = ({
  editor,
  visible,
  position,
  updateTrigger = 0,
  lastSelection,
}) => {
  // 获取当前选区的文本样式状态
  // 依赖 updateTrigger 确保在选区变化时更新
  const textStyles = useMemo(() => {
    if (!editor || !visible) {
      return {
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrike: false,
        textColor: '#000000',
        backgroundColor: undefined,
        fontSize: 16,
        fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
      };
    }
    const attrs = editor.getAttributes('textStyle');
    // console.log('[InlineTextToolbar] Current text styles:', {
    //   bold: editor.isActive('bold'),
    //   italic: editor.isActive('italic'),
    //   underline: editor.isActive('underline'),
    //   strike: editor.isActive('strike'),
    //   attrs,
    // });

    const styles = {
      isBold: editor.isActive('bold'),
      isItalic: editor.isActive('italic'),
      isUnderline: editor.isActive('underline'),
      isStrike: editor.isActive('strike'),
      textColor: attrs.color || '#000000',
      backgroundColor: attrs.backgroundColor,
      fontSize: parseInt(attrs.fontSize || '16', 10),
      fontFamily: attrs.fontFamily || 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
    };

    console.log('[InlineTextToolbar] 🎨 刷新工具栏样式状态:', {
      updateTrigger,
      attrs,
      computedStyles: styles,
      lastSelection,
    });

    return styles;
  }, [editor, visible, updateTrigger, lastSelection]);

  // === 选区辅助：在工具栏交互时恢复最近的有效选区，避免选区丢失导致工具栏闪退 ===
  const runWithRestore = useCallback(
    (
      executor: (chain: ReturnType<typeof editor.chain>) => ReturnType<typeof editor.chain>,
      options?: { focus?: boolean; restore?: boolean },
    ) => {
      if (!editor) return;

      // 1. 获取链式对象
      let chain = editor.chain();

      // 2. 尝试恢复焦点（可通过 options 控制，避免频繁 focus 导致选区抖动）
      if (options?.focus ?? true) {
        chain = chain.focus();
      }

      // 3. 如果有传入 lastSelection 且当前编辑器没有选区（或选区已丢失），尝试恢复选区
      // 注意：这只是为了应对 ColorPicker 关闭后可能丢失选区的情况
      if (
        options?.restore !== false &&
        lastSelection &&
        (editor.state.selection.empty ||
          !editor.isFocused ||
          editor.state.selection.from !== lastSelection.from ||
          editor.state.selection.to !== lastSelection.to)
      ) {
        try {
          chain = chain.setTextSelection(lastSelection);
        } catch (e) {
          console.warn('Failed to restore selection', e);
        }
      }

      // 4. 执行命令
      executor(chain).run();
    },
    [editor, lastSelection],
  );

  // === 样式操作处理函数 ===
  const handleToggleBold = (e?: React.MouseEvent) => {
    e?.preventDefault(); // 双重保险
    editor.chain().focus().toggleBold().run();
  };

  const handleToggleItalic = (e?: React.MouseEvent) => {
    e?.preventDefault();
    editor.chain().focus().toggleItalic().run();
  };

  const handleToggleUnderline = (e?: React.MouseEvent) => {
    e?.preventDefault();
    editor.chain().focus().toggleUnderline().run();
  };

  const handleToggleStrike = (e?: React.MouseEvent) => {
    e?.preventDefault();
    editor.chain().focus().toggleStrike().run();
  };

  // 🎯 性能优化: 使用useCallback保存防抖函数
  // === 复杂操作：使用 runWithRestore ===
  // 颜色选择器必然会导致物理失焦，所以使用 runWithRestore 尝试拉回焦点
  // 对于 ColorPicker 的连续滑动，我们不希望每次都 focus/restore（会导致闪动/回弹），
  // 所以调整为默认不做 focus/restore，只有必要时在外部手动调用恢复。
  const isCoalescingRef = useRef(false);

  const handleTextColorChangeInternal = useCallback(
    (color: string) => {
      if (!editor) return;

      if (!isCoalescingRef.current) {
        historyService.beginAttributeCoalescing();
        isCoalescingRef.current = true;
      }
      // 使用 runWithRestore 保持选区恢复策略可控（不 focus / 不 restore）
      runWithRestore((chain) => chain.setColor(color), { focus: false, restore: false });
    },
    [runWithRestore, editor],
  );

  const handleBackgroundColorChangeInternal = useCallback(
    (backgroundColor: string) => {
      if (!editor) return;

      if (!isCoalescingRef.current) {
        historyService.beginAttributeCoalescing();
        isCoalescingRef.current = true;
      }
      runWithRestore((chain) => chain.setBackgroundColor(backgroundColor), {
        focus: false,
        restore: false,
      });
    },
    [runWithRestore, editor],
  );

  // 局部调节滑块需要对 UI 响应快速，所以将防抖调小并通过本地 state 提升流畅度
  // 使用更稳健的防抖 (60ms) 来减少频繁的 editor.update 导致的工具栏抖动
  const debouncedTextColorChangeRef = useRef(
    debounce((color: string, handler: (color: string) => void) => handler(color), 60),
  );

  const debouncedBackgroundColorChangeRef = useRef(
    debounce((color: string, handler: (color: string) => void) => handler(color), 60),
  );

  // 局部 state，避免 ColorPicker 在滑动时被父组件属性回写导致回弹
  const [textColorLocal, setTextColorLocal] = useState<string>('#000000');
  const [backgroundColorLocal, setBackgroundColorLocal] = useState<string>('#ffffff');
  // 颜色面板是否打开
  const [isTextColorPickerOpen, setIsTextColorPickerOpen] = useState(false);
  const [isBackgroundColorPickerOpen, setIsBackgroundColorPickerOpen] = useState(false);

  // 同步本地状态，当外部属性刷新（updateTrigger）时更新本地显示颜色
  // 仅在颜色面板未打开的情况下同步本地颜色 (避免滑动时被外部 updateTrigger 覆盖导致回弹)
  useEffect(() => {
    if (isTextColorPickerOpen) return undefined;
    const src = textStyles.textColor || '#000000';
    if (textColorLocal !== src) {
      const timer = setTimeout(() => setTextColorLocal(src), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [updateTrigger, textStyles.textColor, textColorLocal, isTextColorPickerOpen]);

  useEffect(() => {
    if (isBackgroundColorPickerOpen) return undefined;
    const src = textStyles.backgroundColor || '#ffffff';
    if (backgroundColorLocal !== src) {
      const timer = setTimeout(() => setBackgroundColorLocal(src), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [
    updateTrigger,
    textStyles.backgroundColor,
    backgroundColorLocal,
    isBackgroundColorPickerOpen,
  ]);

  const handleTextColorChange = (color: string) => {
    setTextColorLocal(color);
    debouncedTextColorChangeRef.current(color, handleTextColorChangeInternal);
  };

  const handleBackgroundColorChange = (backgroundColor: string) => {
    setBackgroundColorLocal(backgroundColor);
    debouncedBackgroundColorChangeRef.current(backgroundColor, handleBackgroundColorChangeInternal);
  };

  // 在 ColorPicker 打开/关闭时记录状态，避免滑动过程中被 props 覆盖
  const handleTextColorPickerOpenChange = (open: boolean) => {
    setIsTextColorPickerOpen(open);
    if (!open) {
      // 关闭时恢复选区并保证 focus
      runWithRestore((chain) => chain, { focus: true, restore: true });
    }
    // 通知编辑器我们正在与工具栏交互，避免工具栏在交互过程中抖动/闪退
    eventBus.emit('text-editor:toolbar-interaction', { interacting: open });
  };

  const handleBackgroundColorPickerOpenChange = (open: boolean) => {
    setIsBackgroundColorPickerOpen(open);
    if (!open) {
      runWithRestore((chain) => chain, { focus: true, restore: true });
    }
    eventBus.emit('text-editor:toolbar-interaction', { interacting: open });
  };

  // 字号由于是 Slider，我们在 onMouseDown 做了特殊处理，这里直接 run 即可
  const handleFontSizeChange = useCallback(
    (fontSize: number) => {
      editor.chain().focus().setFontSize(`${fontSize}px`).run();
    },
    [editor],
  );

  const handleFontFamilyChange = useCallback(
    (fontFamily: string) => {
      runWithRestore((chain) => chain.setFontFamily(fontFamily));
    },
    [runWithRestore],
  );

  if (!visible) {
    return null;
  }

  // 公用的防失焦处理函数
  const preventFocusLoss = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const toolbarNode = (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
      }}
      className="inline-text-toolbar-container"
      data-toolbar="inline-text"
      onMouseDown={preventFocusLoss} // 最外层防御
    >
      <div className={styles.toolbar}>
        {/* 字体选择 */}
        <Select
          value={textStyles.fontFamily}
          onChange={handleFontFamilyChange}
          style={{ width: 140 }}
          size="small"
          options={FONT_FAMILIES}
          className={styles.fontSelect}
          popupMatchSelectWidth={false}
          placement="bottomLeft"
          getPopupContainer={() =>
            document.querySelector('[data-toolbar="inline-text"]') || document.body
          }
          onMouseDown={preventFocusLoss}
          dropdownRender={(menu) => <div onMouseDown={(e) => e.preventDefault()}>{menu}</div>}
          dropdownStyle={{ zIndex: 10001 }}
        />

        {/* 字体大小调节 */}
        <Popover
          content={
            <div
              className={styles.sliderPopover}
              onMouseDown={(e) => {
                // 防止 Popover 内容触发编辑器失焦
                e.preventDefault();
              }}
            >
              <Slider
                min={10}
                max={500}
                value={textStyles.fontSize}
                onChange={(val) => {
                  if (!isCoalescingRef.current) {
                    historyService.beginAttributeCoalescing();
                    isCoalescingRef.current = true;
                  }
                  handleFontSizeChange(val);
                }}
                onAfterChange={() => {
                  historyService.endAttributeCoalescing();
                  isCoalescingRef.current = false;
                }}
                className={styles.popoverSlider}
                tooltip={{ open: false }}
              />
              <span className={styles.sliderValue}>{textStyles.fontSize}px</span>
            </div>
          }
          trigger="hover"
          onOpenChange={(open) =>
            eventBus.emit('text-editor:toolbar-interaction', { interacting: open })
          }
          placement="bottom"
          mouseEnterDelay={0.1}
          mouseLeaveDelay={0.2}
          getPopupContainer={() =>
            document.querySelector('[data-toolbar="inline-text"]') || document.body
          }
          overlayStyle={{ zIndex: 10001 }}
        >
          <Tooltip title="字号" placement="bottom" mouseEnterDelay={0.3}>
            <Button
              className={styles.toolButton}
              icon={<FontSizeOutlined />}
              onMouseDown={preventFocusLoss}
            />
          </Tooltip>
        </Popover>

        <div className={styles.divider} />

        {/* 文本颜色选择 */}
        <Tooltip title="文本颜色">
          <ColorPicker
            value={textColorLocal}
            onChange={(color, hex) => {
              console.log('[InlineTextToolbar] Text color changed:', { color, hex });
              handleTextColorChange(hex);
            }}
            // 将 ColorPicker popup 渲染到工具栏容器，避免被 editor DOM 的 z-index/transform 覆盖
            getPopupContainer={() =>
              document.querySelector('[data-toolbar="inline-text"]') || document.body
            }
            onOpenChange={handleTextColorPickerOpenChange}
            onChangeComplete={() => {
              historyService.endAttributeCoalescing();
              isCoalescingRef.current = false;
            }}
            className={styles.colorPicker}
            panelRender={(panel) => (
              <div
                className="inline-text-colorpicker-panel"
                style={{ zIndex: 10050 }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {panel}
              </div>
            )}
            showText
            format="hex"
            /* 提升 ColorPicker 层级，避免被编辑器 DOM 覆盖 */
          >
            <Button
              className={styles.colorButton}
              style={{
                background: textStyles.textColor || '#000000',
                border: `2px solid ${textStyles.textColor || '#000000'}`,
              }}
              onMouseDown={preventFocusLoss}
            >
              <span
                className={styles.colorButtonText}
                style={{
                  color:
                    textStyles.textColor === '#ffffff' || textStyles.textColor === '#fff'
                      ? '#000000'
                      : '#ffffff',
                }}
              >
                A
              </span>
            </Button>
          </ColorPicker>
        </Tooltip>

        {/* 背景颜色选择 */}
        <Tooltip title="背景色">
          <ColorPicker
            value={backgroundColorLocal}
            onChange={(color, hex) => {
              console.log('[InlineTextToolbar] Background color changed:', { color, hex });
              handleBackgroundColorChange(hex);
            }}
            getPopupContainer={() =>
              document.querySelector('[data-toolbar="inline-text"]') || document.body
            }
            onOpenChange={handleBackgroundColorPickerOpenChange}
            onChangeComplete={() => {
              historyService.endAttributeCoalescing();
              isCoalescingRef.current = false;
            }}
            className={styles.colorPicker}
            panelRender={(panel) => (
              <div
                className="inline-text-colorpicker-panel"
                style={{ zIndex: 10050 }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {panel}
              </div>
            )}
            showText
            format="hex"
          >
            <Button
              className={styles.colorButton}
              style={{
                background: textStyles.backgroundColor || '#ffffff',
                border: `2px solid ${textStyles.backgroundColor || '#e0e0e0'}`,
              }}
              onMouseDown={preventFocusLoss}
            >
              <BgColorsOutlined
                className={styles.colorButtonIcon}
                style={{
                  color:
                    textStyles.backgroundColor === '#ffffff' ||
                    textStyles.backgroundColor === '#fff' ||
                    !textStyles.backgroundColor
                      ? '#666666'
                      : '#ffffff',
                }}
              />
            </Button>
          </ColorPicker>
        </Tooltip>

        <div className={styles.divider} />

        <Tooltip title="加粗">
          <Button
            className={`${styles.toolButton} ${textStyles.isBold ? styles.active : ''}`}
            icon={<BoldOutlined />}
            onClick={handleToggleBold}
            aria-label="bold"
            onMouseDown={preventFocusLoss}
          />
        </Tooltip>

        <Tooltip title="斜体">
          <Button
            className={`${styles.toolButton} ${textStyles.isItalic ? styles.active : ''}`}
            icon={<ItalicOutlined />}
            onClick={handleToggleItalic}
            aria-label="italic"
            onMouseDown={preventFocusLoss}
          />
        </Tooltip>

        <Tooltip title="下划线">
          <Button
            className={`${styles.toolButton} ${textStyles.isUnderline ? styles.active : ''}`}
            icon={<UnderlineOutlined />}
            onClick={handleToggleUnderline}
            aria-label="underline"
            onMouseDown={preventFocusLoss}
          />
        </Tooltip>

        <Tooltip title="删除线">
          <Button
            className={`${styles.toolButton} ${textStyles.isStrike ? styles.active : ''}`}
            icon={<StrikethroughOutlined />}
            onClick={handleToggleStrike}
            aria-label="strike"
            onMouseDown={preventFocusLoss}
          />
        </Tooltip>
      </div>
    </div>
  );

  return createPortal(toolbarNode, document.body);
};

export default InlineTextToolbar;
