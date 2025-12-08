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
  private dragStartTime: number = 0;
  private selectHelper: SelectHelper;

  // 时间和距离阈值
  private readonly CLICK_TIME_THRESHOLD = 200; // 200ms
  private readonly CLICK_DISTANCE_THRESHOLD = 5; // 5px

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
    eventBus.on(
      'text-editor:double-click-handled',
      this.handleTextDoubleClickHandled as (payload: unknown) => void,
    );
  }

  /**
   * 指针按下事件处理
   */
  private handlePointerDown = (event: CanvasEvent): void => {
    if (this.canvasStore.getState().tool.activeTool !== 'select') {
      return;
    }

    const state = this.canvasStore.getState();
    const ids = state.selectedElementIds;
    if (ids.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of ids) {
        const el = state.elements[id];
        if (!el) continue;
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
      }
      if (minX !== Infinity) {
        const wx = event.world.x;
        const wy = event.world.y;
        const inside = wx >= minX && wx <= maxX && wy >= minY && wy <= maxY;
        if (inside) {
          return;
        }
      }
    }
    const elementList = Object.values(state.elements);
    const screenPoint: Point = { x: event.screen.x, y: event.screen.y };
    const clickedElement = this.selectionManager.handleClick(screenPoint, elementList);

    const isMultiSelect = event.modifiers.ctrl || event.modifiers.meta;

    if (clickedElement) {
      if (isMultiSelect) {
        const currentSelection = this.canvasStore.getState().selectedElementIds;
        if (currentSelection.includes(clickedElement.id)) {
          const newSelection = currentSelection.filter((id) => id !== clickedElement.id);
          state.setSelectedElements(newSelection);
        } else {
          state.setSelectedElements([...currentSelection, clickedElement.id]);
        }
      } else {
        state.setSelectedElements([clickedElement.id]);
      }

      this.isDragging = false;
      this.dragStartTime = Date.now();
      this.dragStartPoint = { x: event.screen.x, y: event.screen.y };
      this.dragStartWorld = { x: event.world.x, y: event.world.y };
      return;
    }

    this.startDragSelection(event);
  };

  /**
   * 开始拖拽选择
   */
  private startDragSelection(event: CanvasEvent): void {
    if (!this.isDragging) {
      this.isDragging = true;
    }
    this.dragStartTime = Date.now();
    this.dragStartPoint = { x: event.screen.x, y: event.screen.y };
    this.dragStartWorld = { x: event.world.x, y: event.world.y };

    console.log('SelectionInteraction: 开始拖拽', event.screen);
  }

  /**
   * 检查是否可能是文本双击
   */
  private isPotentialTextDoubleClick(): boolean {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;

    if (selectedElementIds.length !== 1) {
      return false;
    }

    const elementId = selectedElementIds[0];
    const element = elements[elementId];

    return element && element.type === 'text';
  }

  /**
   * 处理文本双击完成事件
   */
  private handleTextDoubleClickHandled = (): void => {
    // 双击已被处理，取消当前的拖拽状态
    this.isDragging = false;
    this.dragStartPoint = null;
    this.dragStartWorld = null;
    this.dragStartTime = 0;

    // 清除可能的预览
    this.canvasStore.setState((state: CanvasState) => {
      state.tool.tempElement = undefined;
    });
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
      const dragDistance = Math.sqrt(Math.pow(start.x - end.x, 2) + Math.pow(start.y - end.y, 2));
      if (dragDistance < 5) {
        // 拖拽距离太小，不显示预览
        console.log('SelectionInteraction: 拖拽距离太小，不显示预览');
        return;
      }
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

    // 如果是拖拽结束，使用时间+距离组合判断
    if (wasDragging && this.dragStartPoint) {
      const duration = Date.now() - this.dragStartTime;
      const dragDistance = Math.sqrt(
        Math.pow(event.screen.x - this.dragStartPoint.x, 2) +
          Math.pow(event.screen.y - this.dragStartPoint.y, 2),
      );

      // 组合判断：时间短且距离小 = 点击
      const isClick =
        duration < this.CLICK_TIME_THRESHOLD && dragDistance < this.CLICK_DISTANCE_THRESHOLD;

      if (isClick) {
        this.handleClick(event);
      } else {
        // 时间长或距离大 = 拖拽框选
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
    this.dragStartTime = 0;
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
        if (clickedElement.type === 'text') {
          const position = { x: clickedElement.x, y: clickedElement.y };
          eventBus.emit('text-editor:open', {
            element: clickedElement,
            position,
          });
        }
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
    eventBus.off(
      'text-editor:double-click-handled',
      this.handleTextDoubleClickHandled as (payload: unknown) => void,
    );
  }
}
