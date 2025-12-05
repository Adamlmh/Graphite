// services/interaction/TextEditorInteraction.ts
import { eventBus } from '../../lib/eventBus';
import { useCanvasStore } from '../../stores/canvas-store';
import type { TextElement } from '../../types';
import { CoordinateTransformer } from '../../lib/Coordinate/CoordinateTransformer';

/**
 * 文本编辑交互管理器
 * 处理双击进入编辑态的逻辑
 */
export class TextEditorInteraction {
  private canvasStore: typeof useCanvasStore;
  private lastClickTime: number = 0;
  private lastClickElementId: string | null = null;
  private readonly DOUBLE_CLICK_THRESHOLD = 300; // 双击时间阈值（毫秒）
  private coordinateTransformer: CoordinateTransformer;

  constructor() {
    this.canvasStore = useCanvasStore;
    this.coordinateTransformer = new CoordinateTransformer();
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    eventBus.on('pointerdown', this.handlePointerDown as (payload: unknown) => void);
  }

  /**
   * 处理指针按下事件，检测双击
   */
  private handlePointerDown = (): void => {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;

    // 只在选择工具激活时处理
    if (state.tool.activeTool !== 'select') {
      return;
    }

    // 检查是否有选中的文本元素
    if (selectedElementIds.length !== 1) {
      return;
    }

    const elementId = selectedElementIds[0];
    const element = elements[elementId];

    // 必须是文本元素
    if (!element || element.type !== 'text') {
      return;
    }

    // 检测双击
    const currentTime = Date.now();
    const isDoubleClick =
      currentTime - this.lastClickTime < this.DOUBLE_CLICK_THRESHOLD &&
      this.lastClickElementId === elementId;

    this.lastClickTime = currentTime;
    this.lastClickElementId = elementId;

    if (isDoubleClick) {
      // 触发进入编辑态
      this.enterEditMode(element as TextElement);
    }
  };

  /**
   * 进入编辑态
   */
  private enterEditMode(element: TextElement): void {
    console.log('TextEditorInteraction: 进入编辑态', element.id);

    // 计算编辑器的屏幕坐标
    const screenPosition = this.calculateEditorPosition(element);

    // 发出编辑事件，通知 UI 层显示编辑器
    eventBus.emit('text-editor:open', {
      element,
      position: screenPosition,
    });
  }

  /**
   * 计算编辑器在屏幕上的位置
   */
  private calculateEditorPosition(element: TextElement): { x: number; y: number } {
    // 使用 CoordinateTransformer 将世界坐标转换为屏幕坐标
    return this.coordinateTransformer.worldToScreen(element.x, element.y);
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    eventBus.off('pointerdown', this.handlePointerDown as (payload: unknown) => void);
  }
}
