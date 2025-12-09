import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { eventBus } from '../../../../lib/eventBus';
import { useElementCategory } from '../../../../hooks/useElementCategory';
import { calculatePanelPosition, throttle } from '../../../../utils';
import FloatingPanel from '../../layout/FloatingPanel/FloatingPanel';
import ShapeProperties from '../Propertities/ShapeProperties/ShapeProperties';
import TextProperties from '../Propertities/TextProperties/TextProperties';
import ImageProperties from '../Propertities/ImageProperties/ImageProperties';
import type { Element } from '../../../../types';
import styles from './PropertiesPanel.module.less';

export interface PropertiesPanelProps {
  position?: { top?: number; left?: number; right?: number; bottom?: number };
  className?: string;
  enableDynamicPositioning?: boolean; // 是否启用动态定位
}

/**
 * 属性面板容器组件
 * 根据选择的元素类型动态渲染对应的属性面板
 */
const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  position: staticPosition,
  className,
  enableDynamicPositioning = true, // 默认启用动态定位
}) => {
  // 获取选中的元素ID数组
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const updateElement = useCanvasStore((state) => state.updateElement);

  // 订阅 elements 变化以触发重新渲染
  const elements = useCanvasStore((state) => state.elements);

  // 订阅 viewport 变化（滚动/缩放时需要重新计算位置）
  const viewport = useCanvasStore((state) => state.viewport);

  // 缓存选中的元素，当选中ID或元素对象变化时重新计算
  const selectedElements = useMemo(() => {
    return selectedElementIds
      .map((id) => elements[id])
      .filter((element): element is Element => element !== undefined);
  }, [selectedElementIds, elements]);

  // 使用 useElementCategory 判断显示哪个面板
  const { shouldShowShapePanel, shouldShowTextPanel, shouldShowImagePanel, elementCount } =
    useElementCategory(selectedElements);

  // 计算动态位置（依赖 viewport.offset 确保滚动时重新计算）
  const dynamicPosition = useMemo(() => {
    if (!enableDynamicPositioning || selectedElements.length === 0) {
      return null;
    }

    // 面板尺寸
    const panelWidth = 280;
    const panelHeight = 60;

    const position = calculatePanelPosition(selectedElements, {
      width: panelWidth,
      height: panelHeight,
    });

    // 如果返回 null，说明元素不在视口内
    return position;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedElements,
    enableDynamicPositioning,
    viewport.offset.x,
    viewport.offset.y,
    viewport.zoom,
  ]);

  // 最终使用的位置
  // 注意：如果启用动态定位且 dynamicPosition 为 null（元素不在视口内），则不显示面板
  const finalPosition = enableDynamicPositioning
    ? dynamicPosition
    : staticPosition || { right: 0, top: 80 };

  // 样式更新回调
  const handleStyleChange = (elementId: string, newStyle: Element['style']) => {
    console.log('PropertiesPanel: 更新元素样式', { elementId, newStyle });
    updateElement(elementId, { style: newStyle });
  };

  // 监听文本编辑状态
  const [isTextEditing, setIsTextEditing] = useState(false);
  // 监听文本局部选择状态
  const [isTextSelectionActive, setIsTextSelectionActive] = useState(false);
  // 监听元素操作状态（move/resize/rotate）
  const [isOperating, setIsOperating] = useState(false);
  // 监听画布拖动状态（viewport pan）
  const [isViewportPanning, setIsViewportPanning] = useState(false);
  // 使用 ref 存储节流函数，避免每次渲染都创建新函数
  const throttledOperationEndRef = useRef<(() => void) | null>(null);

  // 创建节流的操作结束处理函数
  const handleOperationEnd = useCallback(() => {
    setIsOperating(false);
  }, []);

  // 在组件挂载时创建节流函数
  useEffect(() => {
    // 使用 100ms 的节流时间，避免频繁更新
    throttledOperationEndRef.current = throttle(handleOperationEnd, 100);
  }, [handleOperationEnd]);

  useEffect(() => {
    const handleTextEditorOpen = () => {
      setIsTextEditing(true);
    };

    const handleTextEditorClose = () => {
      setIsTextEditing(false);
      setIsTextSelectionActive(false); // 关闭编辑器时重置选择状态
    };

    const handleSelectionChange = (payload: unknown) => {
      const { hasSelection } = payload as { hasSelection: boolean };
      setIsTextSelectionActive(hasSelection);
    };

    const handleOperationStart = () => {
      setIsOperating(true);
    };

    const handleOperationEndEvent = () => {
      // 使用节流函数处理操作结束事件
      if (throttledOperationEndRef.current) {
        throttledOperationEndRef.current();
      }
    };

    const handleViewportPanStart = () => {
      setIsViewportPanning(true);
    };

    const handleViewportPanEnd = () => {
      setIsViewportPanning(false);
    };

    eventBus.on('text-editor:open', handleTextEditorOpen);
    eventBus.on('text-editor:close', handleTextEditorClose);
    eventBus.on('text-editor:selection-change', handleSelectionChange);
    eventBus.on('element:operation-start', handleOperationStart);
    eventBus.on('element:operation-end', handleOperationEndEvent);
    eventBus.on('viewport:pan-start', handleViewportPanStart);
    eventBus.on('viewport:pan-end', handleViewportPanEnd);

    return () => {
      eventBus.off('text-editor:open', handleTextEditorOpen);
      eventBus.off('text-editor:close', handleTextEditorClose);
      eventBus.off('text-editor:selection-change', handleSelectionChange);
      eventBus.off('element:operation-start', handleOperationStart);
      eventBus.off('element:operation-end', handleOperationEndEvent);
      eventBus.off('viewport:pan-start', handleViewportPanStart);
      eventBus.off('viewport:pan-end', handleViewportPanEnd);
    };
  }, []);

  // 如果没有选中元素，不显示属性面板
  if (elementCount === 0) {
    return null;
  }

  // 如果正在进行元素操作（move/resize/rotate），隐藏属性面板
  if (isOperating) {
    return null;
  }

  // 如果正在拖动画布（viewport pan），隐藏属性面板
  if (isViewportPanning) {
    return null;
  }

  // 如果局部文本选择激活（显示了InlineToolbar），隐藏全局属性面板
  if (isTextSelectionActive) {
    return null;
  }

  // 如果启用动态定位但元素不在视口内，不显示面板
  if (enableDynamicPositioning && !finalPosition) {
    return null;
  }

  if (!shouldShowShapePanel && !shouldShowTextPanel && !shouldShowImagePanel) {
    return null;
  }
  const panelClassName = [styles['properties-panel'], className].filter(Boolean).join(' ');

  return (
    <FloatingPanel
      id="properties-panel-container"
      visible={true}
      className={panelClassName}
      position={finalPosition!}
    >
      {shouldShowShapePanel && (
        <ShapeProperties elements={selectedElements} onChange={handleStyleChange} />
      )}

      {shouldShowTextPanel && <TextProperties elements={selectedElements} />}

      {shouldShowImagePanel && (
        <ImageProperties elements={selectedElements} onChange={handleStyleChange} />
      )}
    </FloatingPanel>
  );
};

export default PropertiesPanel;
