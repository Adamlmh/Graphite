// services/interaction/SelectionInteraction.ts
import { SelectHelper } from '../../lib/Coordinate/SelectHelper';
import { eventBus } from '../../lib/eventBus';
import type { CanvasState } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import type { Point, Element, Guideline } from '../../types';
import { isGroupElement } from '../../types';
import { ElementFactory } from '../element-factory';
import { SelectionManager } from '../SelectionManager';
import type { HistoryService } from '../HistoryService';
import { MoveCommand } from '../command/HistoryCommand';
import { moveGroup } from '../group-service';

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

  // 移动相关状态（迁移自 MoveInteraction）
  private isMoveActive = false;
  private moveStartPoint: Point | null = null;
  private moveCurrentPoint: Point | null = null;
  private originalPositions: Map<string, Point> = new Map();
  private moveThreshold: number = 3;
  private historyService: HistoryService | null = null;

  // 时间和距离阈值
  private readonly CLICK_TIME_THRESHOLD = 200; // 200ms
  private readonly CLICK_DISTANCE_THRESHOLD = 5; // 5px

  constructor(historyService?: HistoryService) {
    this.canvasStore = useCanvasStore;
    this.selectionManager = new SelectionManager();
    this.selectHelper = new SelectHelper();
    if (historyService) {
      this.historyService = historyService;
    }
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

  setHistoryService(historyService: HistoryService): void {
    this.historyService = historyService;
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
      // 优先命中已选元素：若按下在任何已选元素或选区联合边界内，则进入移动
      const elementList = Object.values(state.elements);
      const screenPoint: Point = { x: event.screen.x, y: event.screen.y };
      const clickedElement = this.selectionManager.handleClick(screenPoint, elementList);
      const wx = event.world.x;
      const wy = event.world.y;

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
      const insideUnion = minX !== Infinity && wx >= minX && wx <= maxX && wy >= minY && wy <= maxY;

      if ((clickedElement && ids.includes(clickedElement.id)) || insideUnion) {
        this.startMove({ x: event.world.x, y: event.world.y });
        return;
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
    if (this.canvasStore.getState().tool.activeTool !== 'select') {
      return;
    }

    // 移动模式优先
    if (this.isMoveActive) {
      this.updateMove({ x: event.world.x, y: event.world.y });
      return;
    }

    if (!this.isDragging) {
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

    // 若处于移动模式，优先结束移动
    if (this.isMoveActive) {
      this.finishMove({ x: event.world.x, y: event.world.y });
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

  // === 移动交互（迁移自 MoveInteraction） ===

  private startMove(point: Point): void {
    this.isMoveActive = true;
    this.moveStartPoint = { ...point };
    this.moveCurrentPoint = { ...point };
    this.recordCurrentPositions();
  }

  private updateMove(currentPoint: Point): void {
    if (!this.isMoveActive || !this.moveStartPoint) {
      return;
    }
    this.moveCurrentPoint = currentPoint;
    const rawDelta = {
      x: currentPoint.x - this.moveStartPoint.x,
      y: currentPoint.y - this.moveStartPoint.y,
    };
    const { snappedDelta, guidelines } = this.computeSnapping(rawDelta);
    this.updateElementsFromOriginalPositions(snappedDelta);
    const vp = this.canvasStore.getState().viewport;
    const nextSnap = { ...vp.snapping, guidelines, showGuidelines: guidelines.length > 0 };
    this.canvasStore.getState().setViewport({ snapping: nextSnap });
  }

  private async finishMove(endPoint: Point): Promise<void> {
    if (!this.isMoveActive || !this.moveStartPoint) {
      this.resetMoveState();
      return;
    }
    const moved =
      Math.sqrt(
        Math.pow(endPoint.x - this.moveStartPoint.x, 2) +
          Math.pow(endPoint.y - this.moveStartPoint.y, 2),
      ) > this.moveThreshold;
    if (moved && this.historyService) {
      const delta = {
        x: endPoint.x - this.moveStartPoint.x,
        y: endPoint.y - this.moveStartPoint.y,
      };
      await this.recordMoveToHistory(delta);
    }
    const vp = this.canvasStore.getState().viewport;
    const nextSnap = { ...vp.snapping, guidelines: [], showGuidelines: false };
    this.canvasStore.getState().setViewport({ snapping: nextSnap });
    this.resetMoveState();
  }

  private resetMoveState(): void {
    this.isMoveActive = false;
    this.moveStartPoint = null;
    this.moveCurrentPoint = null;
    this.originalPositions.clear();
  }

  private recordCurrentPositions(): void {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;
    this.originalPositions.clear();
    selectedElementIds.forEach((id) => {
      const element = elements[id];
      if (element) {
        this.originalPositions.set(id, { x: element.x, y: element.y });
      }
    });
  }

  private updateElementsFromOriginalPositions(delta: Point): void {
    const state = this.canvasStore.getState();
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];
    this.originalPositions.forEach((originalPosition, id) => {
      const element = state.elements[id];
      if (!element) return;
      if (isGroupElement(element)) {
        const targetX = originalPosition.x + delta.x;
        const targetY = originalPosition.y + delta.y;
        const actualDeltaX = targetX - element.x;
        const actualDeltaY = targetY - element.y;
        if (actualDeltaX !== 0 || actualDeltaY !== 0) {
          moveGroup(id, actualDeltaX, actualDeltaY);
        }
        return;
      }
      updates.push({
        id,
        updates: { x: originalPosition.x + delta.x, y: originalPosition.y + delta.y },
      });
    });
    if (updates.length > 0) {
      this.canvasStore.getState().updateElements(updates);
    }
  }

  private async recordMoveToHistory(delta: Point): Promise<void> {
    if (!this.historyService) return;
    try {
      const elementMovements: Array<{ elementId: string; oldPosition: Point; newPosition: Point }> =
        [];
      this.originalPositions.forEach((oldPosition, elementId) => {
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
      }
    } catch (error) {
      console.error('SelectionInteraction: 通过历史服务记录移动失败:', error);
    }
  }

  private computeSnapping(delta: Point): { snappedDelta: Point; guidelines: Guideline[] } {
    const state = this.canvasStore.getState();
    const threshold = state.viewport.snapping.threshold || 5;
    const selectedIds = state.selectedElementIds;
    const elements = state.elements;
    if (selectedIds.length === 0) return { snappedDelta: delta, guidelines: [] };
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
      const nearLeftGap = Math.abs(movingEdges.left - otherEdges.right) <= threshold;
      const nearRightGap = Math.abs(movingEdges.right - otherEdges.left) <= threshold;
      if (nearLeftGap)
        lines.push({
          type: 'vertical',
          position: (movingEdges.left + otherEdges.right) / 2,
          source: 'spacing',
          elementId: otherId,
          targetElementId: selectedIds[0],
          strength: 'weak',
        });
      if (nearRightGap)
        lines.push({
          type: 'vertical',
          position: (movingEdges.right + otherEdges.left) / 2,
          source: 'spacing',
          elementId: otherId,
          targetElementId: selectedIds[0],
          strength: 'weak',
        });
      const nearTopGap = Math.abs(movingEdges.top - otherEdges.bottom) <= threshold;
      const nearBottomGap = Math.abs(movingEdges.bottom - otherEdges.top) <= threshold;
      if (nearTopGap)
        lines.push({
          type: 'horizontal',
          position: (movingEdges.top + otherEdges.bottom) / 2,
          source: 'spacing',
          elementId: otherId,
          targetElementId: selectedIds[0],
          strength: 'weak',
        });
      if (nearBottomGap)
        lines.push({
          type: 'horizontal',
          position: (movingEdges.bottom + otherEdges.top) / 2,
          source: 'spacing',
          elementId: otherId,
          targetElementId: selectedIds[0],
          strength: 'weak',
        });
    }
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
      const originX = this.originalPositions.get(id)?.x ?? el.x;
      const originY = this.originalPositions.get(id)?.y ?? el.y;
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

  // === 微移 ===
  async nudgeLeft(fast: boolean = false): Promise<void> {
    await this.nudge({ x: -(fast ? 10 : 1), y: 0 }, fast);
  }
  async nudgeRight(fast: boolean = false): Promise<void> {
    await this.nudge({ x: fast ? 10 : 1, y: 0 }, fast);
  }
  async nudgeUp(fast: boolean = false): Promise<void> {
    await this.nudge({ x: 0, y: -(fast ? 10 : 1) }, fast);
  }
  async nudgeDown(fast: boolean = false): Promise<void> {
    await this.nudge({ x: 0, y: fast ? 10 : 1 }, fast);
  }
  private async nudge(delta: Point, fast: boolean = false): Promise<void> {
    const selectedElementIds = this.canvasStore.getState().selectedElementIds;
    if (selectedElementIds.length === 0) return;
    const originalPositions = new Map<string, Point>();
    selectedElementIds.forEach((id) => {
      const element = this.canvasStore.getState().elements[id];
      if (element) {
        originalPositions.set(id, { x: element.x, y: element.y });
      }
    });
    this.updateElementsFromCurrentPositions(delta);
    if (this.historyService) {
      await this.recordNudgeToHistory(originalPositions);
    }
  }
  private updateElementsFromCurrentPositions(delta: Point): void {
    const state = this.canvasStore.getState();
    const { selectedElementIds, elements } = state;
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];
    selectedElementIds.forEach((id) => {
      const element = elements[id];
      if (!element) return;
      if (isGroupElement(element)) {
        moveGroup(id, delta.x, delta.y);
        return;
      }
      updates.push({ id, updates: { x: element.x + delta.x, y: element.y + delta.y } });
    });
    if (updates.length > 0) {
      this.canvasStore.getState().updateElements(updates);
    }
  }
  private async recordNudgeToHistory(originalPositions: Map<string, Point>): Promise<void> {
    if (!this.historyService) return;
    try {
      const elementMovements: Array<{ elementId: string; oldPosition: Point; newPosition: Point }> =
        [];
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
      }
    } catch (error) {
      console.error('SelectionInteraction: 通过历史服务记录微移失败:', error);
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
