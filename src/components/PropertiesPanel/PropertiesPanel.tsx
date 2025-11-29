import React, { useMemo } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useElementCategory } from '../../hooks/useElementCategory';
import FloatingPanel from '../ui/layout/FloatingPanel/FloatingPanel';
import ShapeProperties from '../ui/business/Propertities/ShapeProperties/ShapeProperties';
import TextProperties from '../ui/business/Propertities/TextProperties/TextProperties';
import ImageProperties from '../ui/business/Propertities/ImageProperties/ImageProperties';
import type { Element } from '../../types';
import styles from './PropertiesPanel.module.less';

export interface PropertiesPanelProps {
  position?: { top?: number; left?: number; right?: number; bottom?: number };
  className?: string;
}

/**
 * 属性面板容器组件
 * 根据选择的元素类型动态渲染对应的属性面板
 */
const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  position = { right: 0, top: 80 },
  className,
}) => {
  // 获取选中的元素ID数组
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const updateElement = useCanvasStore((state) => state.updateElement);

  // 订阅 elements 变化以触发重新渲染
  const elements = useCanvasStore((state) => state.elements);

  // 缓存选中的元素，当选中ID或元素对象变化时重新计算
  const selectedElements = useMemo(() => {
    return selectedElementIds
      .map((id) => elements[id])
      .filter((element): element is Element => element !== undefined);
  }, [selectedElementIds, elements]);

  // 使用 useElementCategory 判断显示哪个面板
  const { shouldShowShapePanel, shouldShowTextPanel, shouldShowImagePanel, elementCount } =
    useElementCategory(selectedElements);

  // 样式更新回调
  const handleStyleChange = (elementId: string, newStyle: Element['style']) => {
    console.log('PropertiesPanel: 更新元素样式', { elementId, newStyle });
    updateElement(elementId, { style: newStyle });
  };

  // 如果没有选中元素，不显示属性面板
  if (elementCount === 0) {
    return null;
  }

  const panelClassName = [styles['properties-panel'], className].filter(Boolean).join(' ');

  return (
    <FloatingPanel visible={true} className={panelClassName} position={position}>
      <div className={styles['properties-panel__header']}>
        <h3>属性面板</h3>
        <span className={styles['properties-panel__count']}>
          {elementCount === 1 ? '1 个元素' : `${elementCount} 个元素`}
        </span>
      </div>

      <div className={styles['properties-panel__content']}>
        {shouldShowShapePanel && (
          <ShapeProperties elements={selectedElements} onChange={handleStyleChange} />
        )}

        {shouldShowTextPanel && (
          <TextProperties elements={selectedElements} onChange={handleStyleChange} />
        )}

        {shouldShowImagePanel && (
          <ImageProperties elements={selectedElements} onChange={handleStyleChange} />
        )}
      </div>
    </FloatingPanel>
  );
};

export default PropertiesPanel;
