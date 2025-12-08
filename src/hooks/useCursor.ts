import { useEffect } from 'react';
import { useCanvasStore } from '../stores/canvas-store';
import type { Tool } from '../types';

/**
 * 光标类型映射
 * 定义每个工具对应的光标样式
 */
export const CURSOR_MAP: Record<Tool, string> = {
  select: 'default',
  hand: 'move',
  transfor: 'default',
  rect: 'crosshair',
  'rounded-rect': 'crosshair',
  circle: 'crosshair',
  triangle: 'crosshair',
  text: 'text',
  image: 'crosshair',
};

/**
 * 光标状态类型
 */
export type CursorState =
  | 'default' // 默认光标
  | 'pointer' // 手型（悬停可点击元素）
  | 'move' // 移动光标
  | 'crosshair' // 十字光标（绘制）
  | 'text' // 文本光标
  | 'grab' // 抓取光标
  | 'grabbing'; // 抓取中

/**
 * 获取工具对应的光标样式
 */
export const getCursorForTool = (tool: Tool): CursorState => {
  return (CURSOR_MAP[tool] as CursorState) || 'default';
};

/**
 * 自定义Hook： 根据当前工具自动切换画布光标
 */
export const useCursor = (containerRef: React.RefObject<HTMLElement | null>) => {
  const activeTool = useCanvasStore((state) => state.tool.activeTool);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const cursor = getCursorForTool(activeTool);
    container.style.cursor = cursor;

    // 清理函数：恢复默认光标
    return () => {
      container.style.cursor = 'default';
    };
  }, [activeTool, containerRef]);
};
