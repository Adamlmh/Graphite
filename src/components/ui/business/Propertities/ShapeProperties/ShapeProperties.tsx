import React, { useMemo, useState } from 'react';
import { ColorPicker, Slider } from 'antd';
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
  onChange?: (elementId: string, newStyle: Element['style']) => void;
  onGroupStyleChange?: (
    elementId: string,
    newStyle: Element['style'],
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

  // 状态管理
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
  }, [commonStyle]);

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
  const strokeWidthLabel =
    typeof currentStyle.strokeWidth === 'number' ? `${currentStyle.strokeWidth}px` : '--';

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <span className={styles.label}>背景色：</span>
        <div className={styles.control}>
          <ColorPicker
            value={currentStyle.fill}
            onChange={(_, hex) => updateStyle({ fill: hex })}
          />
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>边框宽度：</span>
        <div className={styles.control}>
          <Slider
            min={0}
            max={20}
            step={1}
            value={sliderStrokeWidth}
            onChange={(width) => updateStyle({ strokeWidth: width })}
            className={styles.slider}
          />
          <span className={styles.value}>{strokeWidthLabel}</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>边框颜色：</span>
        <div className={styles.control}>
          <ColorPicker
            value={currentStyle.stroke}
            onChange={(_, hex) => updateStyle({ stroke: hex })}
          />
        </div>
      </div>
    </div>
  );
};

// 使用 key prop 来重置组件状态
const ShapeProperties: React.FC<ShapePropertiesProps> = (props) => {
  const key = props.elements?.map((e) => e.id).join(',') || props.element?.id;
  return <ShapePropertiesInner key={key} {...props} />;
};

export default ShapeProperties;
