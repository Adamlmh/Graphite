import React, { useState, useMemo } from 'react';
import { Slider, Popover, Button, Tooltip } from 'antd';
import {
  SunOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  FireOutlined,
  FilterOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import type { Element, ImageElement } from '../../../../../types/index';
import styles from './ImageProperties.module.less';
import { useElementCategory } from '../../../../../hooks/useElementCategory';
import { useCanvasStore } from '../../../../../stores/canvas-store';
import { historyService } from '../../../../../services/instances';
import { AttributeChangeCommand } from '../../../../../services/command/HistoryCommand';

type ImagePropertiesProps = {
  element?: Element;
  elements?: Element[];
  onChange?: (elementId: string, newStyle: Element['style']) => void;
  onGroupStyleChange?: (
    elementId: string,
    newStyle: Element['style'],
    applyToChildren: boolean,
  ) => void;
};

const FILTER_TYPES = ['default', 'grayscale', 'sepia', 'blur'] as const;
type FilterType = (typeof FILTER_TYPES)[number];

const FILTER_LABEL: Record<FilterType, string> = {
  default: '默认',
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
  const isCoalescingRef = React.useRef(false);

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
  const updateAdjustment = async (key: string, newValue: number) => {
    if (!isCoalescingRef.current) {
      historyService.beginAttributeCoalescing();
      isCoalescingRef.current = true;
    }
    const newAdjustments = {
      ...imageAdjustments,
      [key]: newValue,
    };
    setImageAdjustments(newAdjustments);

    // 使用历史服务记录并更新元素的 adjustments 属性
    for (const element of imageElements) {
      const cmd = new AttributeChangeCommand(
        element.id,
        'adjustments',
        element.adjustments ?? {},
        newAdjustments as ImageElement['adjustments'],
        { updateElement },
      );
      await historyService.executeCommand(cmd);
    }
  };

  const handleFilterSelect = async (type?: FilterType) => {
    let newAdjustments: Record<string, number>;

    if (type === 'default') {
      // 恢复默认状态，清空所有调整参数
      newAdjustments = {
        brightness: 100,
        contrast: 100,
        saturation: 100,
        hue: 0,
        blur: 0,
      };
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

    // 使用历史服务记录并更新元素的 adjustments 属性
    for (const element of imageElements) {
      const cmd = new AttributeChangeCommand(
        element.id,
        'adjustments',
        element.adjustments ?? {},
        newAdjustments as ImageElement['adjustments'],
        { updateElement },
      );
      await historyService.executeCommand(cmd);
    }
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
        onAfterChange={() => {
          historyService.endAttributeCoalescing();
          isCoalescingRef.current = false;
        }}
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
        onAfterChange={() => {
          historyService.endAttributeCoalescing();
          isCoalescingRef.current = false;
        }}
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
        onAfterChange={() => {
          historyService.endAttributeCoalescing();
          isCoalescingRef.current = false;
        }}
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
        onAfterChange={() => {
          historyService.endAttributeCoalescing();
          isCoalescingRef.current = false;
        }}
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
        onAfterChange={() => {
          historyService.endAttributeCoalescing();
          isCoalescingRef.current = false;
        }}
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
          <Button className={styles.toolButton} icon={<EyeInvisibleOutlined />} />
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
