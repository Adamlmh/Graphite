// interactions/MoveInteraction.ts
import type { CanvasEvent } from '../../lib/EventBridge';
import { eventBus } from '../../lib/eventBus';
import { useCanvasStore } from '../../stores/canvas-store';
import type { Point, Element } from '../../types/index';
import { type MoveState, MoveEvent } from './interactionTypes';

// 定义移动事件数据接口
interface MoveEventData {
  selectedElementIds: string[];
  startPoint: Point;
  currentPoint: Point;
  delta: Point;
  movedElements: Element[];
}

export class MoveInteraction {
  private state: MoveState = {
    isActive: false,
    startPoint: null,
    currentPoint: null,
    originalPositions: new Map(),
    isDragging: false,
  };

  private canvasStore: typeof useCanvasStore;
  private moveThreshold: number = 3; // 移动阈值，小于这个值认为是点击

  constructor() {
    this.canvasStore = useCanvasStore;
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器 - 使用 eventBus
   */
  private setupEventListeners(): void {
    // 监听 eventBus 上的画布事件
    eventBus.on('pointerdown', this.handlePointerDown as (payload: unknown) => void);
    eventBus.on('pointermove', this.handlePointerMove as (payload: unknown) => void);
    eventBus.on('pointerup', this.handlePointerUp as (payload: unknown) => void);
    eventBus.on('pointerupoutside', this.handlePointerUp as (payload: unknown) => void);
  }

  /**
   * 检查选中的元素是否都存在于 store 中
   */
  private validateSelectedElements(): boolean {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;

    console.log('MoveInteraction: 验证选中元素', {
      selectedElementIds,
      elements: Object.keys(elements),
      allElements: elements,
    });

    // 检查每个选中的元素是否都存在
    const validElements = selectedElementIds.filter((id) => {
      const exists = !!elements[id];
      if (!exists) {
        console.warn(`MoveInteraction: 元素 ${id} 不存在于 store 中`);
      }
      return exists;
    });

    // 如果有无效的选中元素，清理它们
    if (validElements.length !== selectedElementIds.length) {
      console.log('MoveInteraction: 清理无效的选中元素', {
        original: selectedElementIds,
        valid: validElements,
      });
      this.canvasStore.getState().setSelectedElements(validElements);
    }

    return validElements.length > 0;
  }

  /**
   * 指针按下事件处理
   */
  private handlePointerDown = (event: CanvasEvent): void => {
    const activeTool = this.canvasStore.getState().tool.activeTool;
    const selectedElementIds = this.canvasStore.getState().selectedElementIds;

    console.log('MoveInteraction: 检查条件', {
      activeTool,
      selectedElementIds,
      selectedElementsCount: selectedElementIds.length,
    });

    // 只有在 hand 工具且有选中元素时才启动移动
    if (activeTool !== 'hand' || selectedElementIds.length === 0) {
      console.log('MoveInteraction: 条件不满足，不启动移动');
      return;
    }

    // 验证选中元素是否都存在
    if (!this.validateSelectedElements()) {
      console.log('MoveInteraction: 选中的元素无效，不启动移动');
      return;
    }

    const point = this.getWorldPoint(event);
    this.startMove(point);
  };

  /**
   * 指针移动事件处理
   */
  private handlePointerMove = (event: CanvasEvent): void => {
    if (!this.state.isActive) {
      return;
    }

    const point = this.getWorldPoint(event);

    // 检查是否超过了移动阈值
    if (this.state.startPoint && !this.state.isDragging) {
      const distance = this.calculateDistance(this.state.startPoint, point);
      console.log('MoveInteraction: 移动距离', distance);

      if (distance > this.moveThreshold) {
        this.state.isDragging = true;
        // 开始拖拽时记录原始位置
        this.recordOriginalPositions();
      }
    }

    if (this.state.isDragging) {
      this.updateMove(point);
    }
  };

  /**
   * 指针释放事件处理
   */
  private handlePointerUp = (event: CanvasEvent): void => {
    if (!this.state.isActive) {
      return;
    }

    const point = this.getWorldPoint(event);
    this.finishMove(point);
  };

  /**
   * 开始移动
   */
  private startMove(point: Point): void {
    this.state.isActive = true;
    this.state.startPoint = point;
    this.state.currentPoint = point;
    this.state.isDragging = false;

    console.log('MoveInteraction: 开始移动', point);

    // 发出移动开始事件
    this.emitMoveEvent(MoveEvent.MOVE_START, {
      selectedElementIds: this.canvasStore.getState().selectedElementIds,
      startPoint: point,
      currentPoint: point,
      delta: { x: 0, y: 0 },
      movedElements: [],
    });
  }

  /**
   * 更新移动过程
   */
  private updateMove(currentPoint: Point): void {
    if (!this.state.isActive || !this.state.startPoint) {
      return;
    }

    this.state.currentPoint = currentPoint;

    // 计算移动增量
    const delta = {
      x: currentPoint.x - this.state.startPoint.x,
      y: currentPoint.y - this.state.startPoint.y,
    };

    console.log('MoveInteraction: 更新移动', { delta, currentPoint });

    // 更新选中元素的位置
    this.updateSelectedElementsPosition(delta);

    // 发出移动更新事件
    this.emitMoveEvent(MoveEvent.MOVE_UPDATE, {
      selectedElementIds: this.canvasStore.getState().selectedElementIds,
      startPoint: this.state.startPoint,
      currentPoint,
      delta,
      movedElements: this.getValidSelectedElements(),
    });
  }

  /**
   * 完成移动
   */
  private finishMove(endPoint: Point): void {
    if (!this.state.isActive || !this.state.startPoint) {
      return;
    }

    const selectedElementIds = this.canvasStore.getState().selectedElementIds;

    if (this.state.isDragging) {
      // 计算最终移动增量
      const delta = {
        x: endPoint.x - this.state.startPoint.x,
        y: endPoint.y - this.state.startPoint.y,
      };

      console.log('MoveInteraction: 完成移动', { delta, isDragging: this.state.isDragging });

      // 发出移动完成事件
      this.emitMoveEvent(MoveEvent.MOVE_END, {
        selectedElementIds,
        startPoint: this.state.startPoint,
        currentPoint: endPoint,
        delta,
        movedElements: this.getValidSelectedElements(),
      });
    } else {
      // 如果没有拖拽，只是点击，发出移动取消事件
      console.log('MoveInteraction: 取消移动（无拖拽）');
      this.emitMoveEvent(MoveEvent.MOVE_CANCEL, {
        selectedElementIds,
        startPoint: this.state.startPoint,
        currentPoint: endPoint,
        delta: { x: 0, y: 0 },
        movedElements: [],
      });
    }

    this.resetState();
  }

  /**
   * 获取有效的选中元素（不依赖 selectedElements getter）
   */
  private getValidSelectedElements(): Element[] {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;

    return selectedElementIds
      .map((id) => elements[id])
      .filter((element): element is Element => element !== undefined);
  }

  /**
   * 记录元素的原始位置
   */
  private recordOriginalPositions(): void {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;

    console.log('MoveInteraction: 准备记录原始位置', {
      selectedElementIds,
      elementsCount: Object.keys(elements).length,
    });

    this.state.originalPositions.clear();

    selectedElementIds.forEach((id) => {
      const element = elements[id];
      if (element) {
        this.state.originalPositions.set(element.id, {
          x: element.x,
          y: element.y,
        });
        console.log(`MoveInteraction: 记录元素 ${element.id} 位置`, { x: element.x, y: element.y });
      } else {
        console.warn(`MoveInteraction: 元素 ${id} 不存在，跳过记录`);
      }
    });

    console.log('MoveInteraction: 记录原始位置完成', this.state.originalPositions);
  }

  /**
   * 更新选中元素的位置
   */
  private updateSelectedElementsPosition(delta: Point): void {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];

    console.log('MoveInteraction: 准备更新元素位置', {
      selectedElementIds,
      delta,
      originalPositions: this.state.originalPositions,
    });

    selectedElementIds.forEach((id) => {
      const element = elements[id];
      const originalPosition = this.state.originalPositions.get(id);

      if (element && originalPosition) {
        const newX = originalPosition.x + delta.x;
        const newY = originalPosition.y + delta.y;

        updates.push({
          id: element.id,
          updates: {
            x: newX,
            y: newY,
          },
        });

        console.log(`MoveInteraction: 更新元素 ${element.id}`, {
          original: originalPosition,
          new: { x: newX, y: newY },
        });
      } else if (!element) {
        console.warn(`MoveInteraction: 元素 ${id} 不存在，跳过更新`);
      } else if (!originalPosition) {
        console.warn(`MoveInteraction: 元素 ${id} 没有原始位置记录，跳过更新`);
      }
    });

    // 批量更新元素位置
    if (updates.length > 0) {
      console.log('MoveInteraction: 执行批量更新', updates);
      this.canvasStore.getState().updateElements(updates);
    } else {
      console.log('MoveInteraction: 没有需要更新的元素');
    }
  }

  /**
   * 计算两点之间的距离
   */
  private calculateDistance(point1: Point, point2: Point): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 获取世界坐标点
   */
  private getWorldPoint(event: CanvasEvent): Point {
    // 直接使用事件桥接层提供的世界坐标
    return {
      x: event.world.x,
      y: event.world.y,
    };
  }

  /**
   * 重置状态
   */
  private resetState(): void {
    this.state.isActive = false;
    this.state.startPoint = null;
    this.state.currentPoint = null;
    this.state.originalPositions.clear();
    this.state.isDragging = false;

    console.log('MoveInteraction: 重置状态');
  }

  /**
   * 取消移动
   */
  cancelMove(): void {
    if (this.state.isActive) {
      // 恢复到原始位置
      if (this.state.isDragging) {
        this.restoreOriginalPositions();
      }

      this.emitMoveEvent(MoveEvent.MOVE_CANCEL, {
        selectedElementIds: this.canvasStore.getState().selectedElementIds,
        startPoint: this.state.startPoint!,
        currentPoint: this.state.currentPoint!,
        delta: { x: 0, y: 0 },
        movedElements: [],
      });

      this.resetState();
    }
  }

  /**
   * 恢复到原始位置
   */
  private restoreOriginalPositions(): void {
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];

    this.state.originalPositions.forEach((position, elementId) => {
      updates.push({
        id: elementId,
        updates: {
          x: position.x,
          y: position.y,
        },
      });
    });

    if (updates.length > 0) {
      this.canvasStore.getState().updateElements(updates);
    }
  }

  /**
   * 发出移动事件
   */
  private emitMoveEvent(event: MoveEvent, data: MoveEventData): void {
    // 使用事件总线发出移动事件
    eventBus.emit(event, data);
  }

  /**
   * 获取当前状态
   */
  getState(): Readonly<MoveState> {
    return { ...this.state };
  }

  /**
   * 检查是否正在移动
   */
  isMoving(): boolean {
    return this.state.isActive;
  }

  /**
   * 检查是否正在拖拽
   */
  isDragging(): boolean {
    return this.state.isDragging;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 清理事件监听
    eventBus.off('pointerdown', this.handlePointerDown as (payload: unknown) => void);
    eventBus.off('pointermove', this.handlePointerMove as (payload: unknown) => void);
    eventBus.off('pointerup', this.handlePointerUp as (payload: unknown) => void);
    eventBus.off('pointerupoutside', this.handlePointerUp as (payload: unknown) => void);
  }
}
