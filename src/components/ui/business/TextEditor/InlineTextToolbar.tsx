import React, { useMemo } from 'react';
import { Button, Tooltip, ColorPicker, Slider, Popover } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  FontSizeOutlined,
  BgColorsOutlined,
} from '@ant-design/icons';
import type { Editor } from '@tiptap/react';
import styles from '../Propertities/TextProperties/TextProperties.module.less';

export interface InlineTextToolbarProps {
  editor: Editor;
  visible: boolean;
  position: { x: number; y: number };
  updateTrigger?: number; // 用于强制刷新组件的触发器
}

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

    return {
      isBold: editor.isActive('bold'),
      isItalic: editor.isActive('italic'),
      isUnderline: editor.isActive('underline'),
      isStrike: editor.isActive('strike'),
      textColor: attrs.color || '#000000',
      backgroundColor: attrs.backgroundColor,
      fontSize: parseInt(attrs.fontSize || '16', 10),
    };
    // updateTrigger 是必需的，用于触发重新计算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, visible, updateTrigger]);

  // === 样式操作处理函数 ===
  // 应用/取消加粗样式
  const handleToggleBold = () => {
    if (!editor) return;
    console.log('[InlineTextToolbar] Executing toggleBold');
    editor.chain().focus().toggleBold().run();
    console.log('[InlineTextToolbar] toggleBold executed, active:', editor.isActive('bold'));
  };

  // 应用/取消斜体样式
  const handleToggleItalic = () => {
    if (!editor) return;
    console.log('[InlineTextToolbar] Executing toggleItalic');
    editor.chain().focus().toggleItalic().run();
    console.log('[InlineTextToolbar] toggleItalic executed, active:', editor.isActive('italic'));
  };

  // 应用/取消下划线样式
  const handleToggleUnderline = () => {
    if (!editor) return;
    console.log('[InlineTextToolbar] Executing toggleUnderline');
    editor.chain().focus().toggleUnderline().run();
    console.log(
      '[InlineTextToolbar] toggleUnderline executed, active:',
      editor.isActive('underline'),
    );
  };

  // 应用/取消删除线样式
  const handleToggleStrike = () => {
    if (!editor) return;
    console.log('[InlineTextToolbar] Executing toggleStrike');
    editor.chain().focus().toggleStrike().run();
    console.log('[InlineTextToolbar] toggleStrike executed, active:', editor.isActive('strike'));
  };

  // 修改文本颜色
  const handleTextColorChange = (color: string) => {
    if (!editor) return;
    console.log('[InlineTextToolbar] Changing text color to:', color);
    editor.chain().focus().setColor(color).run();
  };

  // 修改背景颜色
  const handleBackgroundColorChange = (backgroundColor: string) => {
    if (!editor) return;
    console.log('[InlineTextToolbar] Changing background color to:', backgroundColor);
    editor.chain().focus().setBackgroundColor(backgroundColor).run();
  };

  // 修改字号
  const handleFontSizeChange = (fontSize: number) => {
    if (!editor) return;
    console.log('[InlineTextToolbar] Changing font size to:', fontSize);
    editor.chain().focus().setFontSize(`${fontSize}px`).run();
  };

  if (!visible) {
    return null;
  }

  return (
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
      onMouseDown={(e) => {
        // 阻止失焦事件，保证点击工具栏时选区不丢失
        e.preventDefault();
      }}
    >
      <div className={styles.toolbar}>
        {/* 字体大小调节 */}
        <Popover
          content={
            <div className={styles.sliderPopover}>
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
          placement="top"
          mouseEnterDelay={0.1}
          mouseLeaveDelay={0.2}
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
            onChange={(_, hex) => handleTextColorChange(hex)}
            className={styles.colorPicker}
          >
            <Button
              className={styles.colorButton}
              style={{
                background: textStyles.textColor || '#000000',
              }}
            >
              <span className={styles.colorButtonText}>A</span>
            </Button>
          </ColorPicker>
        </Tooltip>

        {/* 背景颜色选择 */}
        <Tooltip title="背景色">
          <ColorPicker
            value={textStyles.backgroundColor || '#ffffff'}
            onChange={(_, hex) => handleBackgroundColorChange(hex)}
            className={styles.colorPicker}
          >
            <Button
              className={styles.colorButton}
              style={{
                background: textStyles.backgroundColor || '#ffffff',
              }}
            >
              <BgColorsOutlined className={styles.colorButtonIcon} />
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
};

export default InlineTextToolbar;
