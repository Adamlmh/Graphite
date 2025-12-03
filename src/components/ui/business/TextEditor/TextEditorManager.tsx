import React, { useEffect, useState, useMemo } from 'react';
import { eventBus } from '../../../../lib/eventBus';
import { useCanvasStore } from '../../../../stores/canvas-store';
import type { TextElement } from '../../../../types';
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

  // 根据视口变化动态计算编辑器位置
  const editorPosition = useMemo(() => {
    if (!editorState) {
      return null;
    }
    const { element } = editorState;
    // 使用 CoordinateTransformer 将世界坐标转换为屏幕坐标
    return coordinateTransformer.worldToScreen(element.x, element.y);
  }, [editorState, coordinateTransformer]);

  // 处理内容更新
  const handleUpdate = (content: string) => {
    if (!editorState) {
      return;
    }

    updateElement(editorState.element.id, {
      content,
      updatedAt: Date.now(),
    });
  };

  // 处理失焦，退出编辑态
  const handleBlur = () => {
    // 恢复PIXI文本元素的显示
    if (editorState) {
      const renderEngine = getRenderEngine();
      if (renderEngine) {
        renderEngine.setElementVisibility(editorState.element.id, true);
      }
    }
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

  if (!editorState || !editorPosition) {
    return null;
  }

  return (
    <RichTextEditor
      element={editorState.element}
      position={editorPosition}
      onUpdate={handleUpdate}
      onBlur={handleBlur}
      onStyleChange={handleStyleChange}
    />
  );
};

export default TextEditorManager;
