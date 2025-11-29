import React, { useState } from 'react';
import { Slider, Popover, Button } from 'antd';
import type { Element } from '../../../../../types/index';
import styles from './ImageProperties.module.less';
import {
  useElementCategory,
  useCommonStyle,
  useElementStyleUpdater,
} from '../../../../../hooks/useElementCategory';

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
  scale?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
};

type ImageStylePatch = Partial<Element['style']> & {
  adjustments?: ImageAdjustments;
  filter?: ImageFilterState;
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
  const [imageStyle, setImageStyle] = useState<ImageStylePatch | undefined>(
    commonStyle as ImageStylePatch,
  );

  const emitStylePatch = useElementStyleUpdater(effectiveElements, elementCount, {
    onChange,
    onGroupStyleChange,
    applyToChildren: true,
  });

  React.useEffect(() => {
    setImageStyle(commonStyle as ImageStylePatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]);

  // 只在图像元素时显示该面板
  if (!shouldShowImagePanel) {
    return null;
  }

  const adjustments = imageStyle?.adjustments ?? {};
  const filter = imageStyle?.filter;

  const applyPatch = (patch: ImageStylePatch) => {
    setImageStyle((prev) => {
      const base = prev ?? (commonStyle as ImageStylePatch) ?? {};
      return {
        ...base,
        ...patch,
      };
    });

    emitStylePatch(patch as Partial<Element['style']>);
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
    const nextFilter: ImageFilterState | undefined = type
      ? {
          type,
          value: filter?.type === type ? filter.value : 50,
        }
      : undefined;

    applyPatch({ filter: nextFilter });
  };

  const scaleValue = typeof adjustments.scale === 'number' ? adjustments.scale : 1;
  const brightnessValue = typeof adjustments.brightness === 'number' ? adjustments.brightness : 100;
  const contrastValue = typeof adjustments.contrast === 'number' ? adjustments.contrast : 100;
  const saturationValue = typeof adjustments.saturation === 'number' ? adjustments.saturation : 100;
  const temperatureValue =
    typeof adjustments.temperature === 'number' ? adjustments.temperature : 6500;

  const filterContent = (
    <div className={styles.filterPanel}>
      <div className={styles.filterTitle}>滤镜库</div>
      <div className={styles.filterHint}>常用滤镜预设将在这里展示</div>
      <div className={styles.filterList}>
        {FILTER_TYPES.map((type) => (
          <Button
            key={type}
            size="small"
            type={filter?.type === type ? 'primary' : 'default'}
            className={styles.filterPreset}
            onClick={() => handleFilterSelect(type)}
          >
            {FILTER_LABEL[type]}
          </Button>
        ))}
        <Button
          size="small"
          className={styles.filterPreset}
          onClick={() => handleFilterSelect(undefined)}
        >
          无滤镜
        </Button>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <span className={styles.label}>大小：</span>
        <div className={styles.control}>
          <Slider
            min={10}
            max={300}
            value={Math.round(scaleValue * 100)}
            onChange={(percent) => updateAdjustments('scale', percent / 100)}
            className={styles.slider}
          />
          <span className={styles.value}>{Math.round(scaleValue * 100)}%</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>亮度：</span>
        <div className={styles.control}>
          <Slider
            min={0}
            max={200}
            value={brightnessValue}
            onChange={(value) => updateAdjustments('brightness', value)}
            className={styles.slider}
          />
          <span className={styles.value}>{brightnessValue}%</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>对比度：</span>
        <div className={styles.control}>
          <Slider
            min={0}
            max={200}
            value={contrastValue}
            onChange={(value) => updateAdjustments('contrast', value)}
            className={styles.slider}
          />
          <span className={styles.value}>{contrastValue}%</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>饱和度：</span>
        <div className={styles.control}>
          <Slider
            min={0}
            max={200}
            value={saturationValue}
            onChange={(value) => updateAdjustments('saturation', value)}
            className={styles.slider}
          />
          <span className={styles.value}>{saturationValue}%</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>色温：</span>
        <div className={styles.control}>
          <Slider
            min={2000}
            max={9000}
            step={100}
            value={temperatureValue}
            onChange={(value) => updateAdjustments('temperature', value)}
            className={styles.slider}
          />
          <span className={styles.value}>{temperatureValue}K</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>滤镜：</span>
        <div className={styles.control}>
          <Popover content={filterContent} trigger="hover" placement="left">
            <Button className={styles.filterButton}>
              {filter ? `已选择：${FILTER_LABEL[filter.type]}` : '选择滤镜'}
            </Button>
          </Popover>
        </div>
      </div>
    </div>
  );
};

// 使用 key prop 来重置组件状态
const ImageProperties: React.FC<ImagePropertiesProps> = (props) => {
  const key = props.elements?.map((e) => e.id).join(',') || props.element?.id;
  return <ImagePropertiesInner key={key} {...props} />;
};

export default ImageProperties;
