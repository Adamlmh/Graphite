import React, { useState, useMemo } from 'react';
import { Slider, Popover, Button, Tooltip } from 'antd';
import {
  SunOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  FireOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import type { Element, ImageElement } from '../../../../../types/index';
import styles from './ImageProperties.module.less';
import { useElementCategory } from '../../../../../hooks/useElementCategory';
import { useCanvasStore } from '../../../../../stores/canvas-store';

type ImagePropertiesProps = {
  element?: Element;
  elements?: Element[];
  onChange?: (elementId: string, updates: Partial<Element>) => void;
  onGroupStyleChange?: (
    elementId: string,
    newStyle: Element['style'],
    applyToChildren: boolean,
  ) => void;
};

const FILTER_TYPES = ['grayscale', 'sepia', 'blur'] as const;
type FilterType = (typeof FILTER_TYPES)[number];

const FILTER_LABEL: Record<FilterType, string> = {
  grayscale: '黑白',
  sepia: '复古',
  blur: '模糊',
};

const EMPTY_ELEMENTS: Element[] = [];

const ImagePropertiesInner: React.FC<ImagePropertiesProps> = ({ element, elements }) => {
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

  const { shouldShowImagePanel } = useElementCategory(effectiveElements);

  // 过滤出图片元素
  const imageElements = useMemo(
    () => effectiveElements.filter((item): item is ImageElement => item.type === 'image'),
    [effectiveElements],
  );

  // 获取 canvas store 的更新函数
  const updateElement = useCanvasStore((state) => state.updateElement);

  // 获取图片调整参数的公共值
  const commonAdjustments = useMemo(() => {
    if (imageElements.length === 0) return {};

    const firstAdjustments = imageElements[0]?.adjustments || {};
    if (imageElements.length === 1) {
      return { ...firstAdjustments };
    }

    // 多个元素时，找出公共的调整参数
    const adjustmentKeys = Object.keys(firstAdjustments) as (keyof typeof firstAdjustments)[];
    const commonAdj: Record<string, number> = {};

    adjustmentKeys.forEach((key) => {
      const firstValue = firstAdjustments[key];
      const isCommon = imageElements.every((element) => {
        const adjustments = element?.adjustments || {};
        return adjustments[key] === firstValue;
      });

      if (isCommon && typeof firstValue === 'number') {
        commonAdj[key] = firstValue;
      }
    });

    return commonAdj;
  }, [imageElements]);

  // 状态管理
  const adjustmentsKey = useMemo(() => JSON.stringify(commonAdjustments), [commonAdjustments]);
  const [imageAdjustments, setImageAdjustments] =
    useState<Record<string, number>>(commonAdjustments);

  // 当元素变化时，更新调整参数状态
  React.useEffect(() => {
    setImageAdjustments(commonAdjustments);
  }, [commonAdjustments, adjustmentsKey]);

  // 只在图像元素时显示该面板
  if (!shouldShowImagePanel) {
    return null;
  }

  if (!imageElements.length) {
    return null;
  }

  // 更新单个调整参数
  const updateAdjustment = (key: string, newValue: number) => {
    const newAdjustments = {
      ...imageAdjustments,
      [key]: newValue,
    };
    setImageAdjustments(newAdjustments);

    // 使用 canvas store 更新元素的 adjustments 属性
    imageElements.forEach((element) => {
      updateElement(element.id, { adjustments: newAdjustments as ImageElement['adjustments'] });
    });
  };

  const handleFilterSelect = (type?: FilterType) => {
    let newAdjustments: Record<string, number>;

    if (!type) {
      // 清空调整，确保无滤镜状态完全移除滤镜
      newAdjustments = {};
    } else if (type === 'grayscale') {
      newAdjustments = { ...imageAdjustments, saturation: 0 };
    } else if (type === 'sepia') {
      newAdjustments = { ...imageAdjustments, saturation: 80, hue: 20 };
    } else if (type === 'blur') {
      newAdjustments = { ...imageAdjustments, blur: 5 };
    } else {
      return;
    }

    setImageAdjustments(newAdjustments);

    // 直接使用 canvas store 更新元素的 adjustments 属性
    imageElements.forEach((element) => {
      updateElement(element.id, { adjustments: newAdjustments as ImageElement['adjustments'] });
    });
  };

  // 从本地状态读取当前值
  const adjustments = imageAdjustments;
  const brightnessValue = typeof adjustments.brightness === 'number' ? adjustments.brightness : 100;
  const contrastValue = typeof adjustments.contrast === 'number' ? adjustments.contrast : 100;
  const saturationValue = typeof adjustments.saturation === 'number' ? adjustments.saturation : 100;
  const hueValue = typeof adjustments.hue === 'number' ? adjustments.hue : 0;
  const blurValue = typeof adjustments.blur === 'number' ? adjustments.blur : 0;

  const filterContent = (
    <div className={styles.filterPanel}>
      <div className={styles.filterTitle}>滤镜效果</div>
      <div className={styles.filterList}>
        {FILTER_TYPES.map((type) => (
          <Button
            key={type}
            size="small"
            className={styles.filterPreset}
            onClick={() => handleFilterSelect(type)}
          >
            {FILTER_LABEL[type]}
          </Button>
        ))}
      </div>
    </div>
  );

  const brightnessSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={0}
        max={200}
        value={brightnessValue}
        onChange={(value) => updateAdjustment('brightness', value)}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{brightnessValue}%</span>
    </div>
  );

  const contrastSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={0}
        max={200}
        value={contrastValue}
        onChange={(value) => updateAdjustment('contrast', value)}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{contrastValue}%</span>
    </div>
  );

  const saturationSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={0}
        max={200}
        value={saturationValue}
        onChange={(value) => updateAdjustment('saturation', value)}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{saturationValue}%</span>
    </div>
  );

  const hueSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={-180}
        max={180}
        value={hueValue}
        onChange={(value) => updateAdjustment('hue', value)}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{hueValue}°</span>
    </div>
  );

  const blurSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={0}
        max={20}
        value={blurValue}
        onChange={(value) => updateAdjustment('blur', value)}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{blurValue}px</span>
    </div>
  );

  return (
    <div className={styles.toolbar}>
      <Popover
        content={brightnessSlider}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        mouseLeaveDelay={0.2}
      >
        <Tooltip title="亮度" placement="bottom" mouseEnterDelay={0.3}>
          <Button className={styles.toolButton} icon={<SunOutlined />} />
        </Tooltip>
      </Popover>

      <Popover
        content={contrastSlider}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        mouseLeaveDelay={0.2}
      >
        <Tooltip title="对比度" placement="bottom" mouseEnterDelay={0.3}>
          <Button className={styles.toolButton} icon={<ThunderboltOutlined />} />
        </Tooltip>
      </Popover>

      <Popover
        content={saturationSlider}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        mouseLeaveDelay={0.2}
      >
        <Tooltip title="饱和度" placement="bottom" mouseEnterDelay={0.3}>
          <Button className={styles.toolButton} icon={<BulbOutlined />} />
        </Tooltip>
      </Popover>

      <Popover
        content={hueSlider}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        mouseLeaveDelay={0.2}
      >
        <Tooltip title="色相" placement="bottom" mouseEnterDelay={0.3}>
          <Button className={styles.toolButton} icon={<FireOutlined />} />
        </Tooltip>
      </Popover>

      <Popover
        content={blurSlider}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        mouseLeaveDelay={0.2}
      >
        <Tooltip title="模糊" placement="bottom" mouseEnterDelay={0.3}>
          <Button className={styles.toolButton} icon={<FilterOutlined />} />
        </Tooltip>
      </Popover>

      <div className={styles.divider} />

      <Popover
        content={filterContent}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        mouseLeaveDelay={0.2}
      >
        <Tooltip title="滤镜" placement="bottom" mouseEnterDelay={0.3}>
          <Button className={styles.toolButton} icon={<FilterOutlined />} />
        </Tooltip>
      </Popover>
    </div>
  );
};

// 使用 key prop 来重置组件状态
const ImageProperties: React.FC<ImagePropertiesProps> = (props) => {
  const key = props.elements?.map((e) => e.id).join(',') || props.element?.id;
  return <ImagePropertiesInner key={key} {...props} />;
};

export default ImageProperties;
