import React, { useMemo, useState } from 'react';
import { ColorPicker, Slider, Popover, Button, Tooltip } from 'antd';
import { BgColorsOutlined, BorderOutlined } from '@ant-design/icons';
import type { Element } from '../../../../../types/index';
import {
  useElementCategory,
  useCommonStyle,
  useElementStyleUpdater,
} from '../../../../../hooks/useElementCategory';
import styles from './ShapeProperties.module.less';

type ShapePropertiesProps = {
  element?: Element;
  elements?: Element[];
  onChange?: (elementId: string, updates: Partial<Element>) => void;
  onGroupStyleChange?: (
    elementId: string,
    updates: Partial<Element>,
    applyToChildren: boolean,
  ) => void;
};

const EMPTY_ELEMENTS: Element[] = [];

const ShapePropertiesInner: React.FC<ShapePropertiesProps> = ({
  element,
  elements,
  onChange,
  onGroupStyleChange,
}) => {
  // 统一处理单个和多个元素的情况
  const effectiveElements = useMemo(() => {
    if (elements?.length) {
      return elements;
    }
    if (element) {
      return [element];
    }
    return EMPTY_ELEMENTS;
  }, [element, elements]);

  // 使用 Hook 获取元素分类信息
  const { shouldShowShapePanel, elementCount } = useElementCategory(effectiveElements);

  // 使用 Hook 获取公共样式
  const commonStyle = useCommonStyle(effectiveElements);

  // 状态管理 - 使用 commonStyle 的序列化版本作为依赖
  const styleKey = useMemo(() => JSON.stringify(commonStyle), [commonStyle]);
  const [shapeStyle, setShapeStyle] = useState<Partial<Element['style']> | undefined>(commonStyle);
  const [applyToChildren] = useState(true);

  const emitStylePatch = useElementStyleUpdater(effectiveElements, elementCount, {
    onChange,
    onGroupStyleChange,
    applyToChildren,
  });

  // 当元素变化时，更新样式状态
  React.useEffect(() => {
    setShapeStyle(commonStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]); // 使用 styleKey 而不是 commonStyle 避免无限循环

  // 如果不是图形元素，不显示面板
  if (!shouldShowShapePanel) {
    return null;
  }

  const updateStyle = (patch: Partial<Element['style']>) => {
    setShapeStyle((prev) => {
      const base = prev ?? commonStyle ?? {};
      return { ...base, ...patch } as Element['style'];
    });

    emitStylePatch(patch);
  };

  const currentStyle = {
    fill: shapeStyle?.fill,
    fillOpacity: shapeStyle?.fillOpacity,
    stroke: shapeStyle?.stroke,
    strokeWidth: shapeStyle?.strokeWidth,
    strokeOpacity: shapeStyle?.strokeOpacity,
  };

  const sliderStrokeWidth =
    typeof currentStyle.strokeWidth === 'number' ? currentStyle.strokeWidth : 0;

  const strokeWidthSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={0}
        max={20}
        step={1}
        value={sliderStrokeWidth}
        onChange={(width) => updateStyle({ strokeWidth: width })}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{sliderStrokeWidth}px</span>
    </div>
  );

  return (
    <div className={styles.toolbar}>
      <Tooltip title="填充色">
        <ColorPicker
          value={currentStyle.fill}
          onChange={(_, hex) => updateStyle({ fill: hex })}
          className={styles.colorPicker}
        >
          <Button
            className={styles.colorButton}
            style={{
              background: currentStyle.fill || '#ffffff',
            }}
          >
            <BgColorsOutlined className={styles.colorButtonIcon} />
          </Button>
        </ColorPicker>
      </Tooltip>

      <div className={styles.divider} />

      <Popover
        content={strokeWidthSlider}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        mouseLeaveDelay={0.2}
      >
        <Tooltip title="边框大小" placement="bottom" mouseEnterDelay={0.3}>
          <Button className={styles.toolButton} icon={<BorderOutlined />} />
        </Tooltip>
      </Popover>

      <Tooltip title="边框颜色">
        <ColorPicker
          value={currentStyle.stroke}
          onChange={(_, hex) => updateStyle({ stroke: hex })}
          className={styles.colorPicker}
        >
          <Button
            className={styles.strokeColorButton}
            style={{
              borderColor: currentStyle.stroke || '#000000',
              borderWidth: '10px',
            }}
          />
        </ColorPicker>
      </Tooltip>
    </div>
  );
};

// 使用 key prop 来重置组件状态
const ShapeProperties: React.FC<ShapePropertiesProps> = (props) => {
  const key = props.elements?.map((e) => e.id).join(',') || props.element?.id;
  return <ShapePropertiesInner key={key} {...props} />;
};

export default ShapeProperties;
