import React, { useMemo, useState } from 'react';
import { ColorPicker, Slider, Popover, Button, Tooltip } from 'antd';
import { BgColorsOutlined, BorderOutlined, RadiusSettingOutlined } from '@ant-design/icons';
import type { Element, RectElement } from '../../../../../types/index';
import { useElementCategory } from '../../../../../hooks/useElementCategory';
import { useCanvasStore } from '../../../../../stores/canvas-store';
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

const ShapePropertiesInner: React.FC<ShapePropertiesProps> = ({ element, elements }) => {
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
  const { shouldShowShapePanel } = useElementCategory(effectiveElements);

  // 获取 canvas store 的更新函数
  const updateElement = useCanvasStore((state) => state.updateElement);

  // 判断是否所有元素都是矩形类型（用于显示圆角控制）
  const isAllRectangles = useMemo(() => {
    return effectiveElements.every((el) => el.type === 'rect');
  }, [effectiveElements]);

  // 计算公共样式值
  const commonStyle = useMemo(() => {
    if (effectiveElements.length === 0) return {};

    const firstStyle = effectiveElements[0]?.style || {};
    if (effectiveElements.length === 1) {
      return { ...firstStyle };
    }

    // 多个元素时，找出公共的样式属性
    const styleKeys = Object.keys(firstStyle) as (keyof typeof firstStyle)[];
    const common: Record<string, string | number | undefined> = {};

    styleKeys.forEach((key) => {
      const firstValue = firstStyle[key];
      const isCommon = effectiveElements.every((element) => {
        const style = element?.style || {};
        return style[key] === firstValue;
      });

      if (isCommon) {
        common[key] = firstValue;
      }
    });

    return common as Partial<Element['style']>;
  }, [effectiveElements]);

  // 状态管理 - 使用 commonStyle 的序列化版本作为依赖
  const styleKey = useMemo(() => JSON.stringify(commonStyle), [commonStyle]);
  const [shapeStyle, setShapeStyle] = useState<Partial<Element['style']>>(commonStyle);

  // 当元素变化时,重置样式状态
  const elementIds = useMemo(
    () => effectiveElements.map((el) => el.id).join(','),
    [effectiveElements],
  );
  React.useEffect(() => {
    setShapeStyle({});
  }, [elementIds]);

  // 当元素变化时，更新样式状态
  React.useEffect(() => {
    setShapeStyle(commonStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]); // 使用 styleKey 而不是 commonStyle 避免无限循环

  // 计算边框和圆角的动态最大值
  const maxValues = useMemo(() => {
    if (effectiveElements.length === 0) {
      return { maxStrokeWidth: 20, maxBorderRadius: 50 };
    }

    // 获取所有元素的最小尺寸
    const minDimensions = effectiveElements.map((el) => {
      const width = el.width || 0;
      const height = el.height || 0;
      return Math.min(width, height);
    });

    const smallestDimension = Math.min(...minDimensions);

    // 边框最大值
    const maxStrokeWidth = Math.max(20, Math.floor(smallestDimension));

    // 圆角最大值
    const maxBorderRadius = Math.max(50, Math.floor(smallestDimension / 2));

    return { maxStrokeWidth, maxBorderRadius };
  }, [effectiveElements]);

  // 如果不是图形元素，不显示面板
  if (!shouldShowShapePanel) {
    return null;
  }

  if (!effectiveElements.length) {
    return null;
  }

  // 应用样式补丁到所有元素
  const updateStyle = (patch: Partial<Element['style']>) => {
    setShapeStyle((prev) => {
      const base = prev ?? commonStyle ?? {};
      return { ...base, ...patch };
    });

    console.log('[ShapeProperties] Applying patch:', patch);

    // 批量更新所有元素
    effectiveElements.forEach((el) => {
      const updates: Partial<Element> = {
        style: {
          ...el.style,
          ...patch,
        },
      };

      updateElement(el.id, updates);
    });
  };

  const currentStyle = {
    fill: shapeStyle?.fill,
    fillOpacity: shapeStyle?.fillOpacity,
    stroke: shapeStyle?.stroke,
    strokeWidth: shapeStyle?.strokeWidth,
    strokeOpacity: shapeStyle?.strokeOpacity,
    borderRadius: (shapeStyle as RectElement['style'])?.borderRadius,
  };

  const sliderStrokeWidth =
    typeof currentStyle.strokeWidth === 'number' ? currentStyle.strokeWidth : 0;

  const strokeWidthSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={0}
        max={maxValues.maxStrokeWidth}
        step={1}
        value={sliderStrokeWidth}
        onChange={(width) => updateStyle({ strokeWidth: width })}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{sliderStrokeWidth} px</span>
    </div>
  );

  // 圆角滑块（仅矩形显示）
  const sliderBorderRadius =
    typeof currentStyle.borderRadius === 'number' ? currentStyle.borderRadius : 0;

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

      {/* 圆角控制 - 仅矩形元素显示 */}
      {isAllRectangles && (
        <>
          <div className={styles.divider} />
          <div className={styles.borderRadiusControl}>
            <Tooltip title="圆角">
              <RadiusSettingOutlined className={styles.controlIcon} />
            </Tooltip>
            <Slider
              min={0}
              max={maxValues.maxBorderRadius}
              step={1}
              value={sliderBorderRadius}
              onChange={(radius) => updateStyle({ borderRadius: radius })}
              className={styles.inlineSlider}
              tooltip={{ open: false }}
            />
            <span className={styles.sliderValue}>{sliderBorderRadius} px</span>
          </div>
        </>
      )}
    </div>
  );
};

// 使用 key prop 来重置组件状态
const ShapeProperties: React.FC<ShapePropertiesProps> = (props) => {
  const key = props.elements?.map((e) => e.id).join(',') || props.element?.id;
  return <ShapePropertiesInner key={key} {...props} />;
};

export default ShapeProperties;
