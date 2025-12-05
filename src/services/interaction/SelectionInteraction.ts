// services/interaction/SelectionInteraction.ts
import { SelectHelper } from '../../lib/Coordinate/SelectHelper';
import { eventBus } from '../../lib/eventBus';
import type { CanvasState } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import type { Point } from '../../types';
import { ElementFactory } from '../element-factory';
import { SelectionManager } from '../SelectionManager';

// 定义画布事件接口（匹配 EventBridge 的结构）
interface CanvasEvent {
  type: string;
  screen: Point;
  world: Point;
  buttons: number;
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
  };
  nativeEvent: Event;
  preventDefault: () => void;
  stopPropagation: () => void;
}

/**
 * 选择交互类 - 仿照 CreateInteraction 的模式
 * 处理选择工具的所有交互逻辑
 */
export class SelectionInteraction {
  private canvasStore: typeof useCanvasStore;
  private selectionManager: SelectionManager;
  private isDragging = false;
  private dragStartPoint: Point | null = null;
  private dragStartWorld: Point | null = null;
  private selectHelper: SelectHelper;

  constructor() {
    this.canvasStore = useCanvasStore;
    this.selectionManager = new SelectionManager();
    this.selectHelper = new SelectHelper();
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器 - 复用 CreateInteraction 的模式
   */
  private setupEventListeners(): void {
    eventBus.on('pointerdown', this.handlePointerDown as (payload: unknown) => void);
    eventBus.on('pointerup', this.handlePointerUp as (payload: unknown) => void);
    eventBus.on('pointermove', this.handlePointerMove as (payload: unknown) => void);
  }

  /**
   * 指针按下事件处理
   */
  private handlePointerDown = (event: CanvasEvent): void => {
    // 只有在选择工具激活时才处理
    if (this.canvasStore.getState().tool.activeTool !== 'select') {
      return;
    }

    this.isDragging = true;
    this.dragStartPoint = { x: event.screen.x, y: event.screen.y };
    this.dragStartWorld = { x: event.world.x, y: event.world.y };

    // 这里可以开始框选逻辑的准备
    console.log('SelectionInteraction: 开始拖拽', event.screen);
  };

  /**
   * 指针移动事件处理
   */
  private handlePointerMove = (event: CanvasEvent): void => {
    if (this.canvasStore.getState().tool.activeTool !== 'select' || !this.isDragging) {
      return;
    }

    // 框选预览：在 OVERLAY 层显示透明填充+边框的预览矩形
    if (this.dragStartWorld) {
      const start = this.dragStartWorld;
      const end = { x: event.world.x, y: event.world.y };
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);

      const preview = ElementFactory.createRectangle(x, y, width, height, {
        fill: '#3b82f6',
        fillOpacity: 0.08,
        stroke: '#3b82f6',
        strokeOpacity: 1,
        strokeWidth: 1,
        borderRadius: 0,
      });

      this.canvasStore.setState((state: CanvasState) => {
        state.tool.tempElement = preview;
      });
    }
  };

  /**
   * 指针释放事件处理
   */
  private handlePointerUp = (event: CanvasEvent): void => {
    if (this.canvasStore.getState().tool.activeTool !== 'select') {
      return;
    }

    const wasDragging = this.isDragging;
    this.isDragging = false;

    // 如果是拖拽结束且有明显位移，处理框选
    if (wasDragging && this.dragStartPoint) {
      const dragDistance = Math.sqrt(
        Math.pow(event.screen.x - this.dragStartPoint.x, 2) +
          Math.pow(event.screen.y - this.dragStartPoint.y, 2),
      );

      // 如果拖拽距离小于阈值，认为是点击
      if (dragDistance < 5) {
        this.handleClick(event);
      } else {
        if (this.dragStartWorld) {
          this.handleDragSelection(
            this.dragStartWorld,
            { x: event.world.x, y: event.world.y },
            event.modifiers,
          );
        }
      }
    } else {
      // 单纯的点击
      this.handleClick(event);
    }

    // 清除预览
    this.canvasStore.setState((state: CanvasState) => {
      state.tool.tempElement = undefined;
    });

    this.dragStartPoint = null;
    this.dragStartWorld = null;
  };

  /**
   * 处理点击选择
   */
  private handleClick(event: CanvasEvent): void {
    const state = this.canvasStore.getState();
    const { setSelectedElements, clearSelection } = state;

    // 直接从 elements 对象获取元素列表，不使用 getter
    const elementList = Object.values(state.elements);

    // 使用事件中的screen坐标
    const screenPoint: Point = {
      x: event.screen.x,
      y: event.screen.y,
    };

    const clickedElement = this.selectionManager.handleClick(screenPoint, elementList);

    // 使用modifiers对象获取按键状态
    const isMultiSelect = event.modifiers.ctrl || event.modifiers.meta;

    if (clickedElement) {
      console.log('SelectionInteraction: 点击到元素', clickedElement.id);

      if (isMultiSelect) {
        // 多选逻辑
        const currentSelection = this.canvasStore.getState().selectedElementIds;
        if (currentSelection.includes(clickedElement.id)) {
          // 如果已选中，则取消选中
          const newSelection = currentSelection.filter((id) => id !== clickedElement.id);
          setSelectedElements(newSelection);
        } else {
          // 如果未选中，则添加到选择
          setSelectedElements([...currentSelection, clickedElement.id]);
        }
      } else {
        // 单选
        setSelectedElements([clickedElement.id]);
      }
    } else {
      console.log('SelectionInteraction: 点击空白处');
      if (!isMultiSelect) {
        clearSelection();
      }
    }
  }

  /**
   * 处理框选
   */
  private handleDragSelection(
    startWorld: Point,
    endWorld: Point,
    modifiers: { ctrl: boolean; meta: boolean; shift: boolean; alt: boolean },
  ): void {
    const ids = this.selectHelper.getElementsInSelectionBox(startWorld, endWorld);
    const isMulti = modifiers.ctrl || modifiers.meta;
    const state = this.canvasStore.getState();
    if (isMulti) {
      const current = state.selectedElementIds;
      const merged = Array.from(new Set([...current, ...ids]));
      state.setSelectedElements(merged);
    } else {
      state.setSelectedElements(ids);
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    eventBus.off('pointerdown', this.handlePointerDown as (payload: unknown) => void);
    eventBus.off('pointerup', this.handlePointerUp as (payload: unknown) => void);
    eventBus.off('pointermove', this.handlePointerMove as (payload: unknown) => void);
  }
}
