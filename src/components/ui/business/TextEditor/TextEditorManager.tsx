import React, { useEffect, useState, useMemo } from 'react';
import { eventBus } from '../../../../lib/eventBus';
import { useCanvasStore } from '../../../../stores/canvas-store';
import type { TextElement, RichTextSpan } from '../../../../types';
import { getRenderEngine } from '../../../../lib/renderEngineManager';
import { CoordinateTransformer } from '../../../../lib/Coordinate/index';
import { calculateTextElementSize } from '../../../../utils/textMeasurement';
import RichTextEditor from './RichTextEditor';

interface EditorState {
  element: TextElement;
}

/**
 * 文本编辑器管理器
 * 负责监听编辑事件，显示/隐藏编辑器
 */
const TextEditorManager: React.FC = () => {
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const updateElement = useCanvasStore((state) => state.updateElement);
  const elements = useCanvasStore((state) => state.elements); // 监听元素变化
  const viewport = useCanvasStore((state) => state.viewport); // 🎯 监听视口变化
  const coordinateTransformer = useMemo(() => new CoordinateTransformer(), []);

  useEffect(() => {
    // 监听打开编辑器事件
    const handleOpen = (payload: unknown) => {
      const data = payload as { element: TextElement; position: { x: number; y: number } };
      // 只存储元素信息，位置动态计算
      setEditorState({ element: data.element });

      // 隐藏PIXI文本元素，避免双重文本显示
      const renderEngine = getRenderEngine();
      if (renderEngine) {
        renderEngine.setElementVisibility(data.element.id, false);
        renderEngine.setEditingElement(data.element.id);
      }

      // 发射进入编辑模式事件，用于隐藏选中框
      eventBus.emit('text-editor:edit-mode-enter', { elementId: data.element.id });
    };

    // 监听关闭编辑器事件
    const handleClose = () => {
      if (editorState) {
        // 发射退出编辑模式事件，用于恢复选中框显示
        eventBus.emit('text-editor:edit-mode-exit', { elementId: editorState.element.id });
      }
      setEditorState(null);
    };

    eventBus.on('text-editor:open', handleOpen);
    eventBus.on('text-editor:close', handleClose);

    return () => {
      eventBus.off('text-editor:open', handleOpen);
      eventBus.off('text-editor:close', handleClose);
    };
  }, []);

  // 组件卸载时的清理逻辑
  useEffect(() => {
    return () => {
      // 组件卸载时，如果还在编辑状态，确保触发关闭事件
      if (editorState) {
        eventBus.emit('text-editor:close');
      }
    };
  }, [editorState]);

  // 获取最新的元素数据，同步外部属性变化
  const currentElement = useMemo(() => {
    if (!editorState) {
      return null;
    }
    // 从 store 中获取最新的元素数据
    return elements[editorState.element.id] as TextElement | undefined;
  }, [editorState, elements]);

  // 根据视口变化动态计算编辑器位置
  const editorPosition = useMemo(() => {
    if (!currentElement) {
      return null;
    }
    // 使用 CoordinateTransformer 将世界坐标转换为屏幕坐标
    return coordinateTransformer.worldToScreen(currentElement.x, currentElement.y);
  }, [currentElement, coordinateTransformer, viewport]); // 🎯 添加 viewport 依赖确保视口变化时重新计算

  // 🎯 获取当前视口缩放级别，用于统一编辑态和查看态的尺寸
  const currentZoom = viewport.zoom;

  // 处理内容更新
  const handleUpdate = (content: string, richText?: RichTextSpan[]) => {
    if (!editorState) {
      return;
    }

    console.log('[TextEditorManager] Updating content:', { content, richText });

    // 🎯 关键修复: 根据新内容计算文本实际尺寸
    const currentElement = elements[editorState.element.id] as TextElement;
    if (!currentElement) {
      return;
    }

    const newSize = calculateTextElementSize(
      content,
      richText,
      currentElement.textStyle,
      currentElement.width,
      {
        minWidth: 60,
        minHeight: 24,
        padding: 8,
      },
    );

    // 更新内容、富文本和尺寸
    updateElement(editorState.element.id, {
      content,
      richText,
      width: newSize.width,
      height: newSize.height,
      updatedAt: Date.now(),
    });
  };

  // 处理失焦，退出编辑态
  const handleBlur = (e: React.FocusEvent) => {
    // 检查点击目标是否在属性面板内
    const propertiesPanel = document.getElementById('properties-panel-container');
    if (propertiesPanel && e.relatedTarget && propertiesPanel.contains(e.relatedTarget as Node)) {
      return; // 如果点击的是属性面板，不关闭编辑器
    }

    // 恢复PIXI文本元素的显示
    if (editorState) {
      const renderEngine = getRenderEngine();
      if (renderEngine) {
        renderEngine.setElementVisibility(editorState.element.id, true);
        renderEngine.setEditingElement(null);
      }
      // 发射退出编辑模式事件
      eventBus.emit('text-editor:edit-mode-exit', { elementId: editorState.element.id });
    }
    eventBus.emit('text-editor:close');
    setEditorState(null);
  };

  // 处理样式变化（预留接口，用于局部文本样式）
  const handleStyleChange = (style: Partial<TextElement['textStyle']>) => {
    if (!editorState) return;
    const prev = elements[editorState.element.id] as TextElement;
    if (!prev) return;
    const nextStyle = {
      ...prev.textStyle,
      ...style,
    };
    const newSize = calculateTextElementSize(
      prev.content || '',
      prev.richText,
      nextStyle,
      prev.width,
      {
        minWidth: 60,
        minHeight: 24,
        padding: 8,
      },
    );

    updateElement(editorState.element.id, {
      textStyle: nextStyle,
      width: newSize.width,
      height: newSize.height,
      updatedAt: Date.now(),
    });
  };

  if (!editorState || !editorPosition || !currentElement) {
    return null;
  }

  return (
    <RichTextEditor
      element={currentElement} // 使用最新的元素数据
      position={editorPosition}
      zoom={currentZoom} // 🎯 传递视口缩放级别
      onUpdate={handleUpdate}
      onBlur={handleBlur}
      onStyleChange={handleStyleChange}
    />
  );
};

export default TextEditorManager;
