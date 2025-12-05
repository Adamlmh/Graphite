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
import type { TextStyle } from '../../../../types';
import styles from '../Propertities/TextProperties/TextProperties.module.less';

export interface InlineTextToolbarProps {
  editor: Editor;
  visible: boolean;
  position: { x: number; y: number };
  onStyleChange?: (style: Partial<TextStyle>) => void;
}

/**
 * 行内文本工具栏
 * 当用户选中文本片段时显示，提供局部文本样式编辑功能
 */
const InlineTextToolbar: React.FC<InlineTextToolbarProps> = ({
  editor,
  visible,
  position,
  onStyleChange,
}) => {
  // 获取当前选区的文本样式状态
  const textStyles = useMemo(() => {
    if (!editor || !visible) {
      return {
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrike: false,
        textColor: '#000000',
        backgroundColor: undefined,
      };
    }

    return {
      isBold: editor.isActive('bold'),
      isItalic: editor.isActive('italic'),
      isUnderline: editor.isActive('underline'),
      isStrike: editor.isActive('strike'),
      textColor: editor.getAttributes('textStyle').color || '#000000',
      backgroundColor: editor.getAttributes('textStyle').backgroundColor,
      fontSize: editor.getAttributes('textStyle').fontSize || 16,
    };
  }, [editor, visible]);

  // 应用加粗样式
  const handleToggleBold = () => {
    if (!editor) return;
    editor.chain().focus().toggleBold().run();
    onStyleChange?.({ fontWeight: textStyles.isBold ? 'normal' : 'bold' });
  };

  // 应用斜体样式
  const handleToggleItalic = () => {
    if (!editor) return;
    editor.chain().focus().toggleItalic().run();
    onStyleChange?.({ fontStyle: textStyles.isItalic ? 'normal' : 'italic' });
  };

  // 应用下划线样式
  const handleToggleUnderline = () => {
    if (!editor) return;
    editor.chain().focus().toggleUnderline().run();
    // 简化处理，使用tiptap的布尔状态
    onStyleChange?.({
      textDecoration: textStyles.isUnderline ? 'none' : 'underline',
    });
  };

  // 应用删除线样式
  const handleToggleStrike = () => {
    if (!editor) return;
    editor.chain().focus().toggleStrike().run();
    // 简化处理，使用tiptap的布尔状态
    onStyleChange?.({
      textDecoration: textStyles.isStrike ? 'none' : 'line-through',
    });
  };

  // 应用文本颜色
  const handleTextColorChange = (color: string) => {
    if (!editor) return;
    // 使用更简单的updateAttributes方式
    editor.chain().focus().updateAttributes('textStyle', { color }).run();
    onStyleChange?.({ color });
  };

  // 应用背景颜色
  const handleBackgroundColorChange = (backgroundColor: string) => {
    if (!editor) return;
    // 使用更简单的updateAttributes方式
    editor.chain().focus().updateAttributes('textStyle', { backgroundColor }).run();
    onStyleChange?.({ backgroundColor });
  };

  // 应用字体大小
  const handleFontSizeChange = (fontSize: number) => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .updateAttributes('textStyle', { fontSize: `${fontSize}px` })
      .run();
    onStyleChange?.({ fontSize });
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
      }}
      className="inline-text-toolbar"
      onMouseDown={(e) => {
        // 阻止失焦事件
        e.preventDefault();
      }}
    >
      <div className={styles.toolbar}>
        {/* 字体大小 */}
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

        {/* 文本颜色 */}
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

        {/* 背景颜色 */}
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

        {/* 加粗 */}
        <Tooltip title="加粗">
          <Button
            className={`${styles.toolButton} ${textStyles.isBold ? styles.active : ''}`}
            icon={<BoldOutlined />}
            onClick={handleToggleBold}
          />
        </Tooltip>

        {/* 斜体 */}
        <Tooltip title="斜体">
          <Button
            className={`${styles.toolButton} ${textStyles.isItalic ? styles.active : ''}`}
            icon={<ItalicOutlined />}
            onClick={handleToggleItalic}
          />
        </Tooltip>

        {/* 下划线 */}
        <Tooltip title="下划线">
          <Button
            className={`${styles.toolButton} ${textStyles.isUnderline ? styles.active : ''}`}
            icon={<UnderlineOutlined />}
            onClick={handleToggleUnderline}
          />
        </Tooltip>

        {/* 删除线 */}
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
