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
  }, [currentElement, coordinateTransformer]);

  // 处理内容更新
  const handleUpdate = (content: string, richText?: RichTextSpan[]) => {
    if (!editorState) {
      return;
    }

    const { element } = editorState;
    const { textStyle } = element;

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

    // 如果内容变长，我们希望宽度自适应还是保持固定？
    // 既然用户抱怨宽高没变，说明他们希望宽高能跟随内容变化。
    // 这里我们采用一种策略：
    // 1. 如果是单行文本（无换行符），且宽度超过当前宽度，则扩展宽度。
    // 2. 如果有多行文本，则保持宽度，扩展高度。
    // 但为了简单起见，且符合大多数“点击输入”的直觉，我们先尝试让宽高都自适应内容。
    // 注意：如果一直自适应宽度，就无法换行了（除非手动输入换行符）。

    // 修正策略：
    // 既然 TextRenderer 强制使用了 wordWrap = true 和 wordWrapWidth = width，
    // 那么如果我们不更新 width，文本就会在旧 width 处换行。
    // 如果用户在编辑器里看到的是不换行的（因为编辑器可能没限制宽度），但渲染出来换行了，这就是“不一致”。

    // 我们尝试测量“自然”宽高（不限制宽度），看看效果。
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
      onUpdate={handleUpdate}
      onBlur={handleBlur}
      onStyleChange={handleStyleChange}
    />
  );
};

export default TextEditorManager;
