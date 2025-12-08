import React, { useState } from 'react';
import { Slider, Button, Tooltip, Popover, Select } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  FontSizeOutlined,
  BgColorsOutlined,
} from '@ant-design/icons';
import { ColorPicker } from 'antd';
import type { Element } from '../../../../../types/index';
import styles from './TextProperties.module.less';
import { useElementCategory } from '../../../../../hooks/useElementCategory';
import { useCanvasStore } from '../../../../../stores/canvas-store';
import { cleanupRichTextSpans } from '../../../../../utils/tiptapConverter';

// 这里用 props 接收Zustand的 selectedElements
type TextPropertiesProps = {
  element?: Element;
  elements?: Element[];
  selectedElements?: Element[];
  onChange?: (elementId: string, updates: Partial<Element>) => void;
  onGroupStyleChange?: (
    elementId: string,
    newStyle: Element['style'],
    applyToChildren: boolean,
  ) => void;
};

type TextElementType = Extract<Element, { type: 'text' }>;

type TextStylePatch = {
  textStyle?: Partial<TextElementType['textStyle']>;
  style?: Partial<Element['style']>;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: string;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
};

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

const computeDecoration = (current: string | undefined, target: 'underline' | 'line-through') => {
  if (!current || current === 'none') {
    return target;
  }

  const segments = new Set(current.split(' '));
  if (segments.has(target)) {
    segments.delete(target);
  } else {
    segments.add(target);
  }

  if (!segments.size) {
    return 'none';
  }

  const ordered = ['underline', 'line-through'].filter((key) => segments.has(key));
  return ordered.join(' ');
};

const EMPTY_ELEMENTS: Element[] = [];

const TextPropertiesInner: React.FC<TextPropertiesProps> = ({
  element,
  elements,
  selectedElements = EMPTY_ELEMENTS,
}) => {
  // 统一处理单个和多个元素的情况
  const effectiveElements = React.useMemo(() => {
    if (elements?.length) {
      return elements;
    }
    if (selectedElements?.length) {
      return selectedElements;
    }
    if (element) {
      return [element];
    }
    return EMPTY_ELEMENTS;
  }, [element, elements, selectedElements]);

  const { shouldShowTextPanel } = useElementCategory(effectiveElements);

  const textElements = React.useMemo(
    () => effectiveElements.filter((item): item is TextElementType => item.type === 'text'),
    [effectiveElements],
  );

  // 使用Zustand进行状态管理
  const store = useCanvasStore();
  const [textPatch, setTextPatch] = useState<TextStylePatch>({});

  // 重置补丁状态当元素改变时
  const textElementIds = React.useMemo(
    () => textElements.map((el) => el.id).join(','),
    [textElements],
  );
  React.useEffect(() => {
    setTextPatch({});
  }, [textElementIds]);

  if (!shouldShowTextPanel) {
    return null;
  }

  if (!textElements.length) {
    return null;
  }

  // 应用补丁到所有文本元素
  const applyPatch = (patch: TextStylePatch) => {
    setTextPatch((prev) => ({ ...prev, ...patch }));

    if (!textElements.length) {
      return;
    }

    console.log('[TextProperties] Applying patch:', patch);

    // 批量更新所有文本元素
    textElements.forEach((el) => {
      const updates: Partial<TextElementType> = {};

      // 更新 textStyle
      if (
        patch.textStyle ||
        patch.fontSize ||
        patch.fontWeight ||
        patch.fontStyle ||
        patch.textDecoration ||
        patch.color ||
        patch.backgroundColor ||
        patch.fontFamily
      ) {
        updates.textStyle = {
          ...el.textStyle,
          ...(patch.textStyle || {}),
        };

        // 安全地更新各个属性
        if (patch.fontSize !== undefined) {
          updates.textStyle.fontSize = patch.fontSize;
        }
        if (patch.fontWeight !== undefined) {
          updates.textStyle.fontWeight = patch.fontWeight;
        }
        if (patch.fontStyle !== undefined) {
          updates.textStyle.fontStyle = patch.fontStyle;
        }
        if (patch.textDecoration !== undefined) {
          updates.textStyle.textDecoration =
            patch.textDecoration as TextElementType['textStyle']['textDecoration'];
        }
        if (patch.color !== undefined) {
          updates.textStyle.color = patch.color;
        }
        if (patch.backgroundColor !== undefined) {
          updates.textStyle.backgroundColor = patch.backgroundColor;
        }
        if (patch.fontFamily !== undefined) {
          updates.textStyle.fontFamily = patch.fontFamily;
        }

        // 🎯 关键修复: 清理与新全局样式冲突的局部样式片段
        if (el.richText && el.richText.length > 0) {
          console.log('[TextProperties] Cleaning up richText before:', el.richText);
          updates.richText = cleanupRichTextSpans(el.richText, updates.textStyle);
          console.log('[TextProperties] Cleaned up richText after:', updates.richText);
        }
      }

      // 更新基础样式（如果需要）
      if (patch.style) {
        updates.style = {
          ...el.style,
          ...patch.style,
        };
      }

      if (Object.keys(updates).length > 0) {
        store.updateElement(el.id, updates);
      }
    });
  };

  // 获取当前样式值（从第一个元素或补丁中获取）
  const [firstElement] = textElements;
  const currentTextStyle = firstElement ? firstElement.textStyle : null;

  const fontSize = textPatch.fontSize ?? currentTextStyle?.fontSize ?? 16;
  const color = textPatch.color ?? currentTextStyle?.color ?? '#222222';
  const backgroundColor =
    textPatch.backgroundColor ?? currentTextStyle?.backgroundColor ?? '#ffffff';
  const fontWeight = (textPatch.fontWeight ?? currentTextStyle?.fontWeight ?? 'normal') as
    | 'normal'
    | 'bold';
  const fontStyle = (textPatch.fontStyle ?? currentTextStyle?.fontStyle ?? 'normal') as
    | 'normal'
    | 'italic';
  const decoration = textPatch.textDecoration ?? currentTextStyle?.textDecoration ?? 'none';
  const fontFamily =
    textPatch.fontFamily ??
    currentTextStyle?.fontFamily ??
    'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif';

  // 更新样式的方法
  const updateTextStyle = (patch: Partial<TextStylePatch>) => {
    applyPatch(patch);
  };

  const handleToggleBold = () => {
    updateTextStyle({ fontWeight: fontWeight === 'bold' ? 'normal' : 'bold' });
  };

  const handleToggleItalic = () => {
    updateTextStyle({ fontStyle: fontStyle === 'italic' ? 'normal' : 'italic' });
  };

  const handleToggleDecoration = (target: 'underline' | 'line-through') => {
    updateTextStyle({ textDecoration: computeDecoration(decoration, target) });
  };

  const fontSizeSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={10}
        max={72}
        value={fontSize}
        onChange={(size) => updateTextStyle({ fontSize: size })}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{fontSize}px</span>
    </div>
  );

  return (
    <div className={styles.toolbar}>
      {/* 字体选择 */}
      <Select
        value={fontFamily}
        onChange={(value) => updateTextStyle({ fontFamily: value })}
        style={{ width: 140 }}
        size="small"
        options={FONT_FAMILIES}
        className={styles.fontSelect}
        popupMatchSelectWidth={false}
        placement="bottomLeft"
      />

      <Popover
        content={fontSizeSlider}
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

      <Tooltip title="文本颜色">
        <ColorPicker
          value={color}
          onChange={(_, hex) => updateTextStyle({ color: hex })}
          className={styles.colorPicker}
        >
          <Button
            className={styles.colorButton}
            style={{
              background: color || '#000000',
            }}
          >
            <span className={styles.colorButtonText}>A</span>
          </Button>
        </ColorPicker>
      </Tooltip>

      <Tooltip title="背景色">
        <ColorPicker
          value={backgroundColor}
          onChange={(_, hex) => updateTextStyle({ backgroundColor: hex })}
          className={styles.colorPicker}
        >
          <Button
            className={styles.colorButton}
            style={{
              background: backgroundColor || '#ffffff',
            }}
          >
            <BgColorsOutlined className={styles.colorButtonIcon} />
          </Button>
        </ColorPicker>
      </Tooltip>

      <div className={styles.divider} />

      <Tooltip title="加粗">
        <Button
          className={`${styles.toolButton} ${fontWeight === 'bold' ? styles.active : ''}`}
          icon={<BoldOutlined />}
          onClick={handleToggleBold}
        />
      </Tooltip>

      <Tooltip title="斜体">
        <Button
          className={`${styles.toolButton} ${fontStyle === 'italic' ? styles.active : ''}`}
          icon={<ItalicOutlined />}
          onClick={handleToggleItalic}
        />
      </Tooltip>

      <Tooltip title="下划线">
        <Button
          className={`${styles.toolButton} ${decoration.includes('underline') ? styles.active : ''}`}
          icon={<UnderlineOutlined />}
          onClick={() => handleToggleDecoration('underline')}
        />
      </Tooltip>

      <Tooltip title="删除线">
        <Button
          className={`${styles.toolButton} ${decoration.includes('line-through') ? styles.active : ''}`}
          icon={<StrikethroughOutlined />}
          onClick={() => handleToggleDecoration('line-through')}
        />
      </Tooltip>
    </div>
  );
};

const TextProperties: React.FC<TextPropertiesProps> = (props) => {
  const key =
    props.elements?.map((item) => item.id).join(',') || props.element?.id || 'text-properties-idle';
  return <TextPropertiesInner key={key} {...props} />;
};

export default TextProperties;
