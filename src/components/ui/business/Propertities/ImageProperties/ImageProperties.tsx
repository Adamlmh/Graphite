import React, { useState } from 'react';
import { Slider, Popover, Button, Tooltip } from 'antd';
import {
  ColumnWidthOutlined,
  SunOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  FireOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import type { Element } from '../../../../../types/index';
import styles from './ImageProperties.module.less';
import { useElementCategory, useCommonStyle } from '../../../../../hooks/useElementCategory';
import { useCanvasStore } from '../../../../../stores/canvas-store';

type ImagePropertiesProps = {
  element?: Element;
  elements?: Element[];
  selectedElements?: Element[];
  onChange?: (elementId: string, newStyle: Element['style']) => void;
  onGroupStyleChange?: (
    elementId: string,
    newStyle: Element['style'],
    applyToChildren: boolean,
  ) => void;
};

const FILTER_TYPES = ['grayscale', 'sepia', 'blur'] as const;
type FilterType = (typeof FILTER_TYPES)[number];

type ImageFilterState = {
  type: FilterType;
  value: number;
};

type ImageAdjustments = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  blur?: number;
};

type ImageElementPatch = {
  adjustments?: ImageAdjustments;
  transform?: Element['transform'];
  width?: number;
  height?: number;
};

const FILTER_LABEL: Record<FilterType, string> = {
  grayscale: '黑白',
  sepia: '复古',
  blur: '模糊',
};

const EMPTY_ELEMENTS: Element[] = [];

const ImagePropertiesInner: React.FC<ImagePropertiesProps> = ({
  element,
  elements,
  selectedElements = EMPTY_ELEMENTS,
  onChange,
  onGroupStyleChange,
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

  const { shouldShowImagePanel, elementCount } = useElementCategory(effectiveElements);
  const commonStyle = useCommonStyle(effectiveElements);

  // 使用 commonStyle 的序列化版本作为依赖，避免无限循环
  const styleKey = React.useMemo(() => JSON.stringify(commonStyle), [commonStyle]);
  const [imagePatch, setImagePatch] = useState<ImageElementPatch | undefined>({});

  const store = useCanvasStore();

  React.useEffect(() => {
    setImagePatch({});
  }, [styleKey]);

  // 只在图像元素时显示该面板
  if (!shouldShowImagePanel) {
    return null;
  }

  const adjustments = imagePatch?.adjustments ?? {};

  const applyPatch = (patch: ImageElementPatch) => {
    setImagePatch((prev) => ({ ...(prev ?? {}), ...patch }));

    if (!effectiveElements.length) return;

    if (effectiveElements.length > 1) {
      effectiveElements.forEach((el) => {
        store.updateElement(el.id, patch);
      });
      return;
    }

    const [single] = effectiveElements;
    if (single) {
      store.updateElement(single.id, patch);
    }
  };

  const updateAdjustments = (key: keyof ImageAdjustments, newValue: number) => {
    applyPatch({
      adjustments: {
        ...adjustments,
        [key]: newValue,
      },
    });
  };

  const handleFilterSelect = (type?: FilterType) => {
    if (!type) {
      // 清空调整，确保无滤镜状态完全移除滤镜
      applyPatch({ adjustments: undefined });
      return;
    }
    if (type === 'grayscale') {
      applyPatch({ adjustments: { ...adjustments, saturation: 0 } });
      return;
    }
    if (type === 'sepia') {
      // 近似 sepia：降低饱和度并偏移色相
      applyPatch({ adjustments: { ...adjustments, saturation: 80, hue: 20 } });
      return;
    }
    if (type === 'blur') {
      applyPatch({ adjustments: { ...adjustments, blur: 5 } });
      return;
    }
  };

  const scaleValue = 1; // 简化：统一等比缩放到 transform，可按需扩展
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

  const scaleSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={50}
        max={200}
        value={Math.round(scaleValue * 100)}
        onChange={(percent) => {
          const ratio = percent / 100;
          const [single] = effectiveElements;
          if (!single) return;
          const w = single.width;
          const h = single.height;
          applyPatch({ width: Math.round(w * ratio), height: Math.round(h * ratio) });
        }}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{Math.round(scaleValue * 100)}%</span>
    </div>
  );

  const brightnessSlider = (
    <div className={styles.sliderPopover}>
      <Slider
        min={0}
        max={200}
        value={brightnessValue}
        onChange={(value) => updateAdjustments('brightness', value)}
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
        onChange={(value) => updateAdjustments('contrast', value)}
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
        onChange={(value) => updateAdjustments('saturation', value)}
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
        onChange={(value) => updateAdjustments('hue', value)}
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
        onChange={(value) => updateAdjustments('blur', value)}
        className={styles.popoverSlider}
        tooltip={{ open: false }}
      />
      <span className={styles.sliderValue}>{blurValue}px</span>
    </div>
  );

  return (
    <div className={styles.toolbar}>
      <Popover
        content={scaleSlider}
        trigger="hover"
        placement="top"
        mouseEnterDelay={0.1}
        mouseLeaveDelay={0.2}
      >
        <Tooltip title="大小" placement="bottom" mouseEnterDelay={0.3}>
          <Button className={styles.toolButton} icon={<ColumnWidthOutlined />} />
        </Tooltip>
      </Popover>

      <div className={styles.divider} />

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
