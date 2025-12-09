import React, { useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, Tooltip, ColorPicker, Slider, Popover, Select } from 'antd';
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
  const runWithSelection = useCallback(
    (executor: (chain: ReturnType<typeof editor.chain>) => ReturnType<typeof editor.chain>) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;

      // 如果当前是空选区且有上次有效选区，先恢复选区
      const needsRestore = from === to && lastSelection && lastSelection.from !== lastSelection.to;
      let chain = editor.chain();
      if (needsRestore) {
        chain = chain.setTextSelection(lastSelection);
      }

      executor(chain.focus()).run();
    },
    [editor, lastSelection],
  );

  // === 样式操作处理函数 ===
  // 应用/取消加粗样式
  const handleToggleBold = () => {
    console.log('[InlineTextToolbar] Executing toggleBold');
    runWithSelection((chain) => chain.toggleBold());
    console.log('[InlineTextToolbar] toggleBold executed, active:', editor?.isActive('bold'));
  };

  // 应用/取消斜体样式
  const handleToggleItalic = () => {
    console.log('[InlineTextToolbar] Executing toggleItalic');
    runWithSelection((chain) => chain.toggleItalic());
    console.log('[InlineTextToolbar] toggleItalic executed, active:', editor?.isActive('italic'));
  };

  // 应用/取消下划线样式
  const handleToggleUnderline = () => {
    console.log('[InlineTextToolbar] Executing toggleUnderline');
    runWithSelection((chain) => chain.toggleUnderline());
    console.log(
      '[InlineTextToolbar] toggleUnderline executed, active:',
      editor?.isActive('underline'),
    );
  };

  // 应用/取消删除线样式
  const handleToggleStrike = () => {
    console.log('[InlineTextToolbar] Executing toggleStrike');
    runWithSelection((chain) => chain.toggleStrike());
    console.log('[InlineTextToolbar] toggleStrike executed, active:', editor?.isActive('strike'));
  };

  // 🎯 性能优化: 使用useCallback保存防抖函数
  const handleTextColorChangeInternal = useCallback(
    (color: string) => {
      console.log('[InlineTextToolbar] Applying text color:', color);
      runWithSelection((chain) => chain.setColor(color));
    },
    [runWithSelection],
  );

  const handleBackgroundColorChangeInternal = useCallback(
    (backgroundColor: string) => {
      console.log('[InlineTextToolbar] Applying background color:', backgroundColor);
      runWithSelection((chain) => chain.setBackgroundColor(backgroundColor));
    },
    [runWithSelection],
  );

  // 使用useRef保存防抖函数，避免每次render重新创建
  const debouncedTextColorChangeRef = useRef(
    debounce((color: string, handler: (color: string) => void) => {
      handler(color);
    }, 100),
  );

  const debouncedBackgroundColorChangeRef = useRef(
    debounce((color: string, handler: (color: string) => void) => {
      handler(color);
    }, 100),
  );

  // 修改文本颜色 - 使用useCallback优化
  const handleTextColorChange = useCallback(
    (color: string) => {
      console.log('[InlineTextToolbar] Text color changing to:', color);
      debouncedTextColorChangeRef.current(color, handleTextColorChangeInternal);
    },
    [handleTextColorChangeInternal],
  );

  // 修改背景颜色 - 使用useCallback优化
  const handleBackgroundColorChange = useCallback(
    (backgroundColor: string) => {
      console.log('[InlineTextToolbar] Background color changing to:', backgroundColor);
      debouncedBackgroundColorChangeRef.current(
        backgroundColor,
        handleBackgroundColorChangeInternal,
      );
    },
    [handleBackgroundColorChangeInternal],
  );

  // 修改字号 - 使用useCallback优化
  const handleFontSizeChange = useCallback(
    (fontSize: number) => {
      console.log('[InlineTextToolbar] Changing font size to:', fontSize);
      runWithSelection((chain) => chain.setFontSize(`${fontSize}px`));
    },
    [runWithSelection],
  );

  // 修改字体 - 使用useCallback优化
  const handleFontFamilyChange = useCallback(
    (fontFamily: string) => {
      console.log('[InlineTextToolbar] Changing font family to:', fontFamily);
      runWithSelection((chain) => chain.setFontFamily(fontFamily));
    },
    [runWithSelection],
  );

  if (!visible) {
    return null;
  }

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
      onMouseDown={(e) => {
        e.preventDefault();
      }}
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
          getPopupContainer={() => document.body}
          dropdownStyle={{ zIndex: 10001 }}
          onDropdownVisibleChange={(open) => {
            console.log('[InlineTextToolbar] Font select dropdown visible:', open);
          }}
        />

        {/* 字体大小调节 */}
        <Popover
          content={
            <div
              className={styles.sliderPopover}
              onMouseDown={(e) => {
                // 防止 Popover 内容触发编辑器失焦
                e.stopPropagation();
              }}
            >
              <Slider
                min={10}
                max={72}
                value={textStyles.fontSize}
                onChange={handleFontSizeChange}
                className={styles.popoverSlider}
                tooltip={{ open: false }}
              />
              <span className={styles.sliderValue}>{textStyles.fontSize}px</span>
            </div>
          }
          trigger="hover"
          placement="bottom"
          mouseEnterDelay={0.1}
          mouseLeaveDelay={0.2}
          getPopupContainer={() => document.body}
          overlayStyle={{ zIndex: 10001 }}
          onOpenChange={(visible) => {
            console.log('[InlineTextToolbar] Font size popover visible:', visible);
          }}
        >
          <Tooltip title="字号" placement="bottom" mouseEnterDelay={0.3}>
            <Button className={styles.toolButton} icon={<FontSizeOutlined />} />
          </Tooltip>
        </Popover>

        <div className={styles.divider} />

        {/* 文本颜色选择 */}
        <Tooltip title="文本颜色">
          <ColorPicker
            value={textStyles.textColor}
            onChange={(color, hex) => {
              console.log('[InlineTextToolbar] Text color changed:', { color, hex });
              handleTextColorChange(hex);
            }}
            className={styles.colorPicker}
            getPopupContainer={() => document.body}
            panelRender={(panel) => <div style={{ zIndex: 10001 }}>{panel}</div>}
            showText
            format="hex"
          >
            <Button
              className={styles.colorButton}
              style={{
                background: textStyles.textColor || '#000000',
                border: `2px solid ${textStyles.textColor || '#000000'}`,
              }}
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
            value={textStyles.backgroundColor || '#ffffff'}
            onChange={(color, hex) => {
              console.log('[InlineTextToolbar] Background color changed:', { color, hex });
              handleBackgroundColorChange(hex);
            }}
            className={styles.colorPicker}
            getPopupContainer={() => document.body}
            panelRender={(panel) => <div style={{ zIndex: 10001 }}>{panel}</div>}
            showText
            format="hex"
          >
            <Button
              className={styles.colorButton}
              style={{
                background: textStyles.backgroundColor || '#ffffff',
                border: `2px solid ${textStyles.backgroundColor || '#e0e0e0'}`,
              }}
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
          />
        </Tooltip>

        <Tooltip title="斜体">
          <Button
            className={`${styles.toolButton} ${textStyles.isItalic ? styles.active : ''}`}
            icon={<ItalicOutlined />}
            onClick={handleToggleItalic}
          />
        </Tooltip>

        <Tooltip title="下划线">
          <Button
            className={`${styles.toolButton} ${textStyles.isUnderline ? styles.active : ''}`}
            icon={<UnderlineOutlined />}
            onClick={handleToggleUnderline}
          />
        </Tooltip>

        <Tooltip title="删除线">
          <Button
            className={`${styles.toolButton} ${textStyles.isStrike ? styles.active : ''}`}
            icon={<StrikethroughOutlined />}
            onClick={handleToggleStrike}
          />
        </Tooltip>
      </div>
    </div>
  );

  return createPortal(toolbarNode, document.body);
};

export default InlineTextToolbar;
