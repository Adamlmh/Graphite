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
  private moveThreshold: number = 3;

  // 微移步长配置
  private readonly NUDGE_STEP = 1;
  private readonly FAST_NUDGE_STEP = 10;

  // 用于防止重复初始化的标志
  private isInitialized: boolean = false;

  constructor() {
    this.canvasStore = useCanvasStore;
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (this.isInitialized) return;

    eventBus.on('pointerdown', this.handlePointerDown as (payload: unknown) => void);
    eventBus.on('pointermove', this.handlePointerMove as (payload: unknown) => void);
    eventBus.on('pointerup', this.handlePointerUp as (payload: unknown) => void);
    eventBus.on('pointerupoutside', this.handlePointerUp as (payload: unknown) => void);

    this.isInitialized = true;
  }

  /**
   * 检查选中的元素是否都存在于 store 中
   */
  private validateSelectedElements(): boolean {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;

    const validElements = selectedElementIds.filter((id) => {
      return !!elements[id];
    });

    if (validElements.length !== selectedElementIds.length) {
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

    if (activeTool !== 'hand' || selectedElementIds.length === 0) {
      return;
    }

    if (!this.validateSelectedElements()) {
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
      if (distance > this.moveThreshold) {
        this.state.isDragging = true;
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
   * 开始移动 - 简化版本
   */
  private startMove(point: Point): void {
    // 重置所有状态
    this.resetState();

    this.state.isActive = true;
    this.state.startPoint = { ...point };
    this.state.currentPoint = { ...point };
    this.state.isDragging = false;

    // 立即记录当前位置作为原始位置
    this.recordCurrentPositions();

    console.log('MoveInteraction: 开始移动', {
      startPoint: this.state.startPoint,
      selectedElements: this.canvasStore.getState().selectedElementIds,
    });
  }

  /**
   * 更新移动过程 - 简化版本
   */
  private updateMove(currentPoint: Point): void {
    if (!this.state.isActive || !this.state.startPoint) {
      return;
    }

    this.state.currentPoint = currentPoint;

    // 计算相对于起点的增量
    const delta = {
      x: currentPoint.x - this.state.startPoint.x,
      y: currentPoint.y - this.state.startPoint.y,
    };

    // 使用基于原始位置的增量更新
    this.updateElementsFromOriginalPositions(delta);

    console.log('MoveInteraction: 更新移动', {
      currentPoint,
      delta,
      originalPositions: Array.from(this.state.originalPositions.entries()),
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
      const delta = {
        x: endPoint.x - this.state.startPoint.x,
        y: endPoint.y - this.state.startPoint.y,
      };

      console.log('MoveInteraction: 移动完成', { delta, selectedElementIds });
    } else {
      console.log('MoveInteraction: 移动取消（点击）');
    }

    this.resetState();
  }

  /**
   * 微移方法 - 完全重写
   */
  nudgeLeft(fast: boolean = false): void {
    this.nudge({ x: -(fast ? this.FAST_NUDGE_STEP : this.NUDGE_STEP), y: 0 });
  }

  nudgeRight(fast: boolean = false): void {
    this.nudge({ x: fast ? this.FAST_NUDGE_STEP : this.NUDGE_STEP, y: 0 });
  }

  nudgeUp(fast: boolean = false): void {
    this.nudge({ x: 0, y: -(fast ? this.FAST_NUDGE_STEP : this.NUDGE_STEP) });
  }

  nudgeDown(fast: boolean = false): void {
    this.nudge({ x: 0, y: fast ? this.FAST_NUDGE_STEP : this.NUDGE_STEP });
  }

  /**
   * 统一的微移方法
   */
  private nudge(delta: Point): void {
    const selectedElementIds = this.canvasStore.getState().selectedElementIds;

    if (selectedElementIds.length === 0) {
      return;
    }

    if (!this.validateSelectedElements()) {
      return;
    }

    console.log('MoveInteraction: 开始微移', { delta, selectedElementIds });

    // 对于微移，我们直接使用当前位置 + 增量
    this.updateElementsFromCurrentPositions(delta);

    console.log('MoveInteraction: 微移完成', { delta });
  }

  /**
   * 记录当前位置
   */
  private recordCurrentPositions(): void {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;

    this.state.originalPositions.clear();

    selectedElementIds.forEach((id) => {
      const element = elements[id];
      if (element) {
        this.state.originalPositions.set(id, {
          x: element.x,
          y: element.y,
        });
      }
    });
  }

  /**
   * 基于原始位置更新元素
   */
  private updateElementsFromOriginalPositions(delta: Point): void {
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];

    this.state.originalPositions.forEach((originalPosition, id) => {
      const newX = originalPosition.x + delta.x;
      const newY = originalPosition.y + delta.y;

      updates.push({
        id,
        updates: { x: newX, y: newY },
      });
    });

    if (updates.length > 0) {
      this.canvasStore.getState().updateElements(updates);
    }
  }

  /**
   * 基于当前位置更新元素（用于微移）
   */
  private updateElementsFromCurrentPositions(delta: Point): void {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];

    selectedElementIds.forEach((id) => {
      const element = elements[id];
      if (element) {
        const newX = element.x + delta.x;
        const newY = element.y + delta.y;

        updates.push({
          id,
          updates: { x: newX, y: newY },
        });
      }
    });

    if (updates.length > 0) {
      this.canvasStore.getState().updateElements(updates);
    }
  }

  /**
   * 获取有效的选中元素
   */
  private getValidSelectedElements(): Element[] {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;

    return selectedElementIds
      .map((id) => elements[id])
      .filter((element): element is Element => element !== undefined);
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
   * 获取世界坐标点 - 确保坐标转换正确
   */
  private getWorldPoint(event: CanvasEvent): Point {
    // 直接使用事件桥接层提供的世界坐标
    // 确保这里返回的是正确的世界坐标
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
  }

  /**
   * 取消移动
   */
  cancelMove(): void {
    if (this.state.isActive) {
      if (this.state.isDragging) {
        this.restoreOriginalPositions();
      }
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
   * 诊断方法 - 检查当前状态
   */
  diagnose(): void {
    console.group('MoveInteraction 诊断信息');
    console.log('状态:', this.state);

    const storeState = this.canvasStore.getState();
    console.log('选中的元素:', storeState.selectedElementIds);
    console.log('工具状态:', storeState.tool);

    // 检查每个选中元素的位置
    storeState.selectedElementIds.forEach((id) => {
      const element = storeState.elements[id];
      if (element) {
        console.log(`元素 ${id}:`, { x: element.x, y: element.y, type: element.type });
      }
    });

    console.groupEnd();
  }

  /**
   * 清理资源
   */
  dispose(): void {
    eventBus.off('pointerdown', this.handlePointerDown as (payload: unknown) => void);
    eventBus.off('pointermove', this.handlePointerMove as (payload: unknown) => void);
    eventBus.off('pointerup', this.handlePointerUp as (payload: unknown) => void);
    eventBus.off('pointerupoutside', this.handlePointerUp as (payload: unknown) => void);

    this.isInitialized = false;
  }
}

// 导出单例实例
export const moveInteraction = new MoveInteraction();
