// interactions/MoveInteraction.ts
import type { CanvasEvent } from '../../lib/EventBridge';
import { eventBus } from '../../lib/eventBus';
import { useCanvasStore } from '../../stores/canvas-store';
import type { Point, Element, Guideline } from '../../types/index';
import { type MoveState, MoveEvent } from './interactionTypes';
import type { HistoryService } from '../HistoryService';
import { MoveCommand } from '../command/HistoryCommand';
import { isGroupElement } from '../../types/index';
import { moveGroup } from '../group-service';

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
  private historyService: HistoryService | null = null;

  // 微移步长配置
  private readonly NUDGE_STEP = 1;
  private readonly FAST_NUDGE_STEP = 10;

  // 用于防止重复初始化的标志
  private isInitialized: boolean = false;

  constructor(historyService?: HistoryService) {
    this.canvasStore = useCanvasStore;
    if (historyService) {
      this.historyService = historyService;
    }
    this.setupEventListeners();
  }

  /**
   * 设置历史服务
   */
  setHistoryService(historyService: HistoryService): void {
    this.historyService = historyService;
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

    const rawDelta = {
      x: currentPoint.x - this.state.startPoint.x,
      y: currentPoint.y - this.state.startPoint.y,
    };

    const { snappedDelta, guidelines } = this.computeSnapping(rawDelta);

    this.updateElementsFromOriginalPositions(snappedDelta);

    const vp = this.canvasStore.getState().viewport;
    const nextSnap = {
      ...vp.snapping,
      guidelines,
      showGuidelines: guidelines.length > 0,
    };
    this.canvasStore.getState().setViewport({ snapping: nextSnap });

    console.log('MoveInteraction: 更新移动', {
      currentPoint,
      delta: snappedDelta,
      originalPositions: Array.from(this.state.originalPositions.entries()),
    });
  }

  /**
   * 完成移动
   */
  private async finishMove(endPoint: Point): Promise<void> {
    if (!this.state.isActive || !this.state.startPoint) {
      return;
    }

    const selectedElementIds = this.canvasStore.getState().selectedElementIds;

    if (this.state.isDragging) {
      const delta = {
        x: endPoint.x - this.state.startPoint.x,
        y: endPoint.y - this.state.startPoint.y,
      };

      // 记录移动历史
      if (this.historyService) {
        await this.recordMoveToHistory(delta);
      }

      console.log('MoveInteraction: 移动完成', { delta, selectedElementIds });
    } else {
      console.log('MoveInteraction: 移动取消（点击）');
    }

    const vp = this.canvasStore.getState().viewport;
    const nextSnap = { ...vp.snapping, guidelines: [], showGuidelines: false };
    this.canvasStore.getState().setViewport({ snapping: nextSnap });
    this.resetState();
  }

  /**
   * 记录移动操作到历史
   */
  private async recordMoveToHistory(delta: Point): Promise<void> {
    if (!this.historyService) {
      return;
    }

    try {
      const elementMovements: Array<{
        elementId: string;
        oldPosition: Point;
        newPosition: Point;
      }> = [];

      // 收集移动信息
      this.state.originalPositions.forEach((oldPosition, elementId) => {
        const element = this.canvasStore.getState().elements[elementId];
        if (element) {
          elementMovements.push({
            elementId,
            oldPosition,
            newPosition: { x: element.x, y: element.y },
          });
        }
      });

      if (elementMovements.length > 0) {
        const command = new MoveCommand(elementMovements, {
          updateElement: (id: string, updates: Partial<Element>) =>
            this.canvasStore.getState().updateElement(id, updates),
          updateElements: (updates: Array<{ id: string; updates: Partial<Element> }>) =>
            this.canvasStore.getState().updateElements(updates),
        });

        await this.historyService.executeCommand(command);
        console.log('MoveInteraction: 移动操作已记录到历史记录');
      }
    } catch (error) {
      console.error('MoveInteraction: 通过历史服务记录移动失败:', error);
    }
  }

  /**
   * 微移方法 - 完全重写
   */
  async nudgeLeft(fast: boolean = false): Promise<void> {
    await this.nudge({ x: -(fast ? this.FAST_NUDGE_STEP : this.NUDGE_STEP), y: 0 }, fast);
  }

  async nudgeRight(fast: boolean = false): Promise<void> {
    await this.nudge({ x: fast ? this.FAST_NUDGE_STEP : this.NUDGE_STEP, y: 0 }, fast);
  }

  async nudgeUp(fast: boolean = false): Promise<void> {
    await this.nudge({ x: 0, y: -(fast ? this.FAST_NUDGE_STEP : this.NUDGE_STEP) }, fast);
  }

  async nudgeDown(fast: boolean = false): Promise<void> {
    await this.nudge({ x: 0, y: fast ? this.FAST_NUDGE_STEP : this.NUDGE_STEP }, fast);
  }

  /**
   * 统一的微移方法
   */
  private async nudge(delta: Point, fast: boolean = false): Promise<void> {
    const selectedElementIds = this.canvasStore.getState().selectedElementIds;

    if (selectedElementIds.length === 0) {
      return;
    }

    if (!this.validateSelectedElements()) {
      return;
    }

    console.log('MoveInteraction: 开始微移', { delta, selectedElementIds });

    // 记录微移前的位置
    const originalPositions = new Map<string, Point>();
    selectedElementIds.forEach((id) => {
      const element = this.canvasStore.getState().elements[id];
      if (element) {
        originalPositions.set(id, { x: element.x, y: element.y });
      }
    });

    // 执行微移
    this.updateElementsFromCurrentPositions(delta);

    // 记录微移历史
    if (this.historyService) {
      await this.recordNudgeToHistory(originalPositions, delta, fast);
    }

    console.log('MoveInteraction: 微移完成', { delta });
  }

  /**
   * 记录微移操作到历史
   */
  private async recordNudgeToHistory(
    originalPositions: Map<string, Point>,
    delta: Point,
    fast: boolean = false,
  ): Promise<void> {
    if (!this.historyService) {
      return;
    }

    try {
      const elementMovements: Array<{
        elementId: string;
        oldPosition: Point;
        newPosition: Point;
      }> = [];

      originalPositions.forEach((oldPosition, elementId) => {
        const element = this.canvasStore.getState().elements[elementId];
        if (element) {
          elementMovements.push({
            elementId,
            oldPosition,
            newPosition: { x: element.x, y: element.y },
          });
        }
      });

      if (elementMovements.length > 0) {
        const command = new MoveCommand(elementMovements, {
          updateElement: (id: string, updates: Partial<Element>) =>
            this.canvasStore.getState().updateElement(id, updates),
          updateElements: (updates: Array<{ id: string; updates: Partial<Element> }>) =>
            this.canvasStore.getState().updateElements(updates),
        });

        await this.historyService.executeCommand(command);
        console.log(`MoveInteraction: ${fast ? '快速' : ''}微移操作已记录到历史记录`);
      }
    } catch (error) {
      console.error('MoveInteraction: 通过历史服务记录微移失败:', error);
    }
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
    const state = this.canvasStore.getState();
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];

    this.state.originalPositions.forEach((originalPosition, id) => {
      const element = state.elements[id];
      if (!element) {
        return;
      }

      // 如果选中的是 group，使用 moveGroup 方法
      if (isGroupElement(element)) {
        moveGroup(id, delta.x, delta.y);
        return;
      }

      // 普通元素直接更新位置
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
      if (!element) {
        return;
      }

      // 如果选中的是 group，使用 moveGroup 方法
      if (isGroupElement(element)) {
        moveGroup(id, delta.x, delta.y);
        return;
      }

      // 普通元素直接更新位置
      const newX = element.x + delta.x;
      const newY = element.y + delta.y;

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
   * 获取有效的选中元素
   */
  private getValidSelectedElements(): Element[] {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;

    return selectedElementIds
      .map((id) => elements[id])
      .filter((element): element is Element => element !== undefined);
  }

  private computeSnapping(delta: Point): { snappedDelta: Point; guidelines: Guideline[] } {
    const state = this.canvasStore.getState();
    const threshold = state.viewport.snapping.threshold || 5;
    const selectedIds = state.selectedElementIds;
    const elements = state.elements;
    if (selectedIds.length === 0) {
      return { snappedDelta: delta, guidelines: [] };
    }
    const group = this.computeMovingGroupBounds(selectedIds, elements, delta);
    const movingEdges = {
      left: group.left,
      right: group.right,
      centerX: (group.left + group.right) / 2,
      top: group.top,
      bottom: group.bottom,
      centerY: (group.top + group.bottom) / 2,
    };

    let bestDX = 0;
    let bestDY = 0;
    let minXDist = Infinity;
    let minYDist = Infinity;
    const lines: Guideline[] = [];
    const preferCenter = true;

    for (const otherId of Object.keys(elements)) {
      if (selectedIds.includes(otherId)) continue;
      const other = elements[otherId];
      if (!other || other.visibility === 'hidden') continue;
      const ox = other.x;
      const oy = other.y;
      const ow = other.width;
      const oh = other.height;
      const otherEdges = {
        left: ox,
        right: ox + ow,
        centerX: ox + ow / 2,
        top: oy,
        bottom: oy + oh,
        centerY: oy + oh / 2,
      };

      const candidatesX: Array<{
        pos: number;
        src: Guideline['source'];
        edge: keyof typeof movingEdges;
        strength: Guideline['strength'];
      }> = [
        { pos: otherEdges.left, src: 'element-edge', edge: 'left', strength: 'weak' },
        { pos: otherEdges.centerX, src: 'element-center', edge: 'centerX', strength: 'strong' },
        { pos: otherEdges.right, src: 'element-edge', edge: 'right', strength: 'weak' },
      ];
      const candidatesY: Array<{
        pos: number;
        src: Guideline['source'];
        edge: keyof typeof movingEdges;
        strength: Guideline['strength'];
      }> = [
        { pos: otherEdges.top, src: 'element-edge', edge: 'top', strength: 'weak' },
        { pos: otherEdges.centerY, src: 'element-center', edge: 'centerY', strength: 'strong' },
        { pos: otherEdges.bottom, src: 'element-edge', edge: 'bottom', strength: 'weak' },
      ];

      for (const c of candidatesX) {
        const dist = Math.abs(movingEdges[c.edge] - c.pos);
        const bias = preferCenter && c.src === 'element-center' ? 0.5 : 1.0;
        if (dist <= threshold && dist * bias < minXDist) {
          minXDist = dist * bias;
          bestDX = c.pos - movingEdges[c.edge];
          lines.push({
            type: 'vertical',
            position: c.pos,
            source: c.src,
            elementId: otherId,
            targetElementId: selectedIds[0],
            strength: c.strength,
          });
        }
      }
      for (const c of candidatesY) {
        const dist = Math.abs(movingEdges[c.edge] - c.pos);
        const bias = preferCenter && c.src === 'element-center' ? 0.5 : 1.0;
        if (dist <= threshold && dist * bias < minYDist) {
          minYDist = dist * bias;
          bestDY = c.pos - movingEdges[c.edge];
          lines.push({
            type: 'horizontal',
            position: c.pos,
            source: c.src,
            elementId: otherId,
            targetElementId: selectedIds[0],
            strength: c.strength,
          });
        }
      }

      // 间距辅助线（显示，不参与吸附）
      const nearLeftGap = Math.abs(movingEdges.left - otherEdges.right) <= threshold;
      const nearRightGap = Math.abs(movingEdges.right - otherEdges.left) <= threshold;
      if (nearLeftGap) {
        const mid = (movingEdges.left + otherEdges.right) / 2;
        lines.push({
          type: 'vertical',
          position: mid,
          source: 'spacing',
          elementId: otherId,
          targetElementId: selectedIds[0],
          strength: 'weak',
        });
      }
      if (nearRightGap) {
        const mid = (movingEdges.right + otherEdges.left) / 2;
        lines.push({
          type: 'vertical',
          position: mid,
          source: 'spacing',
          elementId: otherId,
          targetElementId: selectedIds[0],
          strength: 'weak',
        });
      }
      const nearTopGap = Math.abs(movingEdges.top - otherEdges.bottom) <= threshold;
      const nearBottomGap = Math.abs(movingEdges.bottom - otherEdges.top) <= threshold;
      if (nearTopGap) {
        const mid = (movingEdges.top + otherEdges.bottom) / 2;
        lines.push({
          type: 'horizontal',
          position: mid,
          source: 'spacing',
          elementId: otherId,
          targetElementId: selectedIds[0],
          strength: 'weak',
        });
      }
      if (nearBottomGap) {
        const mid = (movingEdges.bottom + otherEdges.top) / 2;
        lines.push({
          type: 'horizontal',
          position: mid,
          source: 'spacing',
          elementId: otherId,
          targetElementId: selectedIds[0],
          strength: 'weak',
        });
      }
    }

    // 画布中心吸附（使用内容边界的中心作为画布中心）
    if (state.viewport.snapping.snapToCanvas) {
      const cb = state.viewport.contentBounds;
      const canvasCenterX = cb.x + cb.width / 2;
      const canvasCenterY = cb.y + cb.height / 2;
      const distCX = Math.abs(movingEdges.centerX - canvasCenterX);
      if (distCX <= threshold && distCX * 0.4 < minXDist) {
        minXDist = distCX * 0.4;
        bestDX = canvasCenterX - movingEdges.centerX;
        lines.push({
          type: 'vertical',
          position: canvasCenterX,
          source: 'canvas-center',
          strength: 'strong',
        });
      }
      const distCY = Math.abs(movingEdges.centerY - canvasCenterY);
      if (distCY <= threshold && distCY * 0.4 < minYDist) {
        minYDist = distCY * 0.4;
        bestDY = canvasCenterY - movingEdges.centerY;
        lines.push({
          type: 'horizontal',
          position: canvasCenterY,
          source: 'canvas-center',
          strength: 'strong',
        });
      }
    }

    const snappedDelta = { x: delta.x + bestDX, y: delta.y + bestDY };
    return { snappedDelta, guidelines: lines };
  }

  private computeMovingGroupBounds(
    selectedIds: string[],
    elements: Record<string, Element>,
    delta: Point,
  ): { left: number; right: number; top: number; bottom: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of selectedIds) {
      const el = elements[id];
      if (!el) continue;
      const originX = this.state.originalPositions.get(id)?.x ?? el.x;
      const originY = this.state.originalPositions.get(id)?.y ?? el.y;
      const left = originX + delta.x;
      const top = originY + delta.y;
      const right = left + el.width;
      const bottom = top + el.height;
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
    }
    if (minX === Infinity) {
      return { left: 0, right: 0, top: 0, bottom: 0 };
    }
    return { left: minX, right: maxX, top: minY, bottom: maxY };
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
