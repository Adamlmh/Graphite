import React, { useMemo, useState } from 'react';
import { Slider, Button, Tooltip, Popover } from 'antd';
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
import {
  useElementCategory,
  useCommonStyle,
  useElementStyleUpdater,
} from '../../../../../hooks/useElementCategory';

// 这里用 props 接收Zustand的 selectedElements
type TextPropertiesProps = {
  element?: Element;
  elements?: Element[];
  onChange?: (elementId: string, newStyle: Element['style']) => void;
  onGroupStyleChange?: (
    elementId: string,
    newStyle: Element['style'],
    applyToChildren: boolean,
  ) => void;
};

type TextElement = Extract<Element, { type: 'text' }>;
type TextStyleState = Partial<Element['style']> & {
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: string;
};
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
  onChange,
  onGroupStyleChange,
}) => {
  const effectiveElements = useMemo(() => {
    if (elements?.length) {
      return elements;
    }
    if (element) {
      return [element];
    }
    return EMPTY_ELEMENTS;
  }, [element, elements]);

  const { shouldShowTextPanel } = useElementCategory(effectiveElements);

  const textElements = useMemo(
    () => effectiveElements.filter((item): item is TextElement => item.type === 'text'),
    [effectiveElements],
  );

  const commonStyle = useCommonStyle(textElements);
  const mergedCommonStyle = useMemo(
    () => ({ ...(commonStyle ?? {}) }) as TextStyleState,
    [commonStyle],
  );
  const [textStyle, setTextStyle] = useState<TextStyleState>(mergedCommonStyle);
  const applyToChildren = true;

  React.useEffect(() => {
    setTextStyle(mergedCommonStyle);
  }, [mergedCommonStyle]);

  const emitStylePatch = useElementStyleUpdater(textElements, textElements.length, {
    onChange,
    onGroupStyleChange,
    applyToChildren,
  });

  if (!shouldShowTextPanel) {
    return null;
  }

  if (!textElements.length) {
    return null;
  }

  const updateStyle = (patch: Partial<TextStyleState>) => {
    setTextStyle((prev) => ({ ...prev, ...patch }));
    emitStylePatch(patch as Partial<Element['style']>);
  };

  const fontSize = typeof textStyle.fontSize === 'number' ? textStyle.fontSize : 16;
  const color = typeof textStyle.color === 'string' ? textStyle.color : '#222222';
  const backgroundColor =
    typeof textStyle.backgroundColor === 'string' ? textStyle.backgroundColor : '#ffffff';
  const fontWeight = textStyle.fontWeight === 'bold' ? 'bold' : 'normal';
  const fontStyle = textStyle.fontStyle === 'italic' ? 'italic' : 'normal';
  const decoration = textStyle.textDecoration ?? 'none';

  const handleToggleBold = () => {
    updateStyle({ fontWeight: fontWeight === 'bold' ? 'normal' : 'bold' });
  };

  const handleToggleItalic = () => {
    updateStyle({ fontStyle: fontStyle === 'italic' ? 'normal' : 'italic' });
  };

  const handleToggleDecoration = (target: 'underline' | 'line-through') => {
    updateStyle({ textDecoration: computeDecoration(decoration, target) });
  };

  const fontSizeSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={10}
        max={72}
        value={fontSize}
        onChange={(size) => updateStyle({ fontSize: size })}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{fontSize}px</span>
    </div>
  );

  return (
    <div className={styles.toolbar}>
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
          onChange={(_, hex) => updateStyle({ color: hex })}
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
          onChange={(_, hex) => updateStyle({ backgroundColor: hex })}
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
