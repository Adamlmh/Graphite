import React, { useEffect, useState, useMemo } from 'react';
import { CanvasTextMetrics, TextStyle } from 'pixi.js';
import { eventBus } from '../../../../lib/eventBus';
import { useCanvasStore } from '../../../../stores/canvas-store';
import type { TextElement, RichTextSpan } from '../../../../types';
import { getRenderEngine } from '../../../../lib/renderEngineManager';
import { CoordinateTransformer } from '../../../../lib/Coordinate/index';
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
  const viewport = useCanvasStore((state) => state.viewport); // 监听视口变化
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
    };

    // 监听关闭编辑器事件
    const handleClose = () => {
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
  }, [currentElement, coordinateTransformer, viewport]); // 添加 viewport 依赖，确保视口变化时重新计算

  // 计算编辑器的缩放比例，跟随视口缩放
  const editorScale = useMemo(() => {
    return viewport.zoom;
  }, [viewport.zoom]);

  // 处理内容更新
  const handleUpdate = (content: string, richText?: RichTextSpan[]) => {
    if (!editorState) {
      return;
    }

    const { element } = editorState;
    const { textStyle } = element;

    console.log('[TextEditorManager] Updating content:', { content, richText, textStyle });

    // 测量文本尺寸
    const style = new TextStyle({
      fontFamily: textStyle.fontFamily,
      fontSize: textStyle.fontSize,
      fontWeight: textStyle.fontWeight === 'bold' ? 'bold' : 'normal',
      fontStyle: textStyle.fontStyle === 'italic' ? 'italic' : 'normal',
      fill: textStyle.color,
      align: textStyle.textAlign,
      lineHeight: textStyle.fontSize * textStyle.lineHeight,
      wordWrap: true, // 启用换行计算
      wordWrapWidth: element.width, // 使用当前宽度作为基准
    });

    const naturalStyle = new TextStyle({
      ...style,
      wordWrap: false, // 不强制换行，测量自然宽度
    });
    const metrics = CanvasTextMetrics.measureText(content, naturalStyle);

    // 更新元素，同时更新宽高
    updateElement(editorState.element.id, {
      content,
      width: metrics.width + 20, // 增加一点 padding 防止边缘裁剪
      height: metrics.height,
      richText,
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
    }
    eventBus.emit('text-editor:close');
    setEditorState(null);
  };

  // 处理样式变化（预留接口，用于局部文本样式）
  const handleStyleChange = (style: Partial<TextElement['textStyle']>) => {
    if (!editorState) return;

    updateElement(editorState.element.id, {
      textStyle: {
        ...editorState.element.textStyle,
        ...style,
      },
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
      scale={editorScale} // 传递缩放比例
      onUpdate={handleUpdate}
      onBlur={handleBlur}
      onStyleChange={handleStyleChange}
    />
  );
};

export default TextEditorManager;
