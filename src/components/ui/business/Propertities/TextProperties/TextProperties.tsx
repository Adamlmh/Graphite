import React, { useMemo, useState } from 'react';
import { Slider, Button, Tooltip } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
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

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <span className={styles.label}>字号：</span>
        <div className={styles.control}>
          <Slider
            min={10}
            max={72}
            value={fontSize}
            onChange={(size) => updateStyle({ fontSize: size })}
            className={styles.slider}
          />
          <span className={styles.value}>{fontSize}px</span>
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>颜色：</span>
        <div className={styles.control}>
          <ColorPicker value={color} onChange={(_, hex) => updateStyle({ color: hex })} />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>背景色：</span>
        <div className={styles.control}>
          <ColorPicker
            value={backgroundColor}
            onChange={(_, hex) => updateStyle({ backgroundColor: hex })}
          />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>样式：</span>
        <div className={styles.biusGroup}>
          <Tooltip title="加粗">
            <Button
              type={fontWeight === 'bold' ? 'primary' : 'default'}
              icon={<BoldOutlined />}
              onClick={handleToggleBold}
              className={styles.biusBtn}
            />
          </Tooltip>
          <Tooltip title="斜体">
            <Button
              type={fontStyle === 'italic' ? 'primary' : 'default'}
              icon={<ItalicOutlined />}
              onClick={handleToggleItalic}
              className={styles.biusBtn}
            />
          </Tooltip>
          <Tooltip title="下划线">
            <Button
              type={decoration.includes('underline') ? 'primary' : 'default'}
              icon={<UnderlineOutlined />}
              onClick={() => handleToggleDecoration('underline')}
              className={styles.biusBtn}
            />
          </Tooltip>
          <Tooltip title="删除线">
            <Button
              type={decoration.includes('line-through') ? 'primary' : 'default'}
              icon={<StrikethroughOutlined />}
              onClick={() => handleToggleDecoration('line-through')}
              className={styles.biusBtn}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

const TextProperties: React.FC<TextPropertiesProps> = (props) => {
  const key =
    props.elements?.map((item) => item.id).join(',') || props.element?.id || 'text-properties-idle';
  return <TextPropertiesInner key={key} {...props} />;
};

export default TextProperties;
