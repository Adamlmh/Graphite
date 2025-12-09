import { eventBus } from '../../lib/eventBus';
import { useCanvasStore } from '../../stores/canvas-store';
import type { Element, Point } from '../../types/index';
import type { HistoryService } from '../HistoryService';
import { MoveCommand, ResizeCommand } from '../command/HistoryCommand';
import type { ResizeHandleType } from './interactionTypes';
import type { CanvasEvent } from '../../lib/EventBridge';
import type { FederatedPointerEvent } from 'pixi.js';
import { GeometryService } from '../../lib/Coordinate/GeometryService';
import { CoordinateTransformer } from '../../lib/Coordinate/CoordinateTransformer';
import { ElementProvider } from '../../lib/Coordinate/providers/ElementProvider';
import { ElementFactory } from '../element-factory';
import { SelectionManager } from '../SelectionManager';

type SelectSubState =
  | 'Idle'
  | 'IdleButPotentialMarquee'
  | 'IdleButPotentialMove'
  | 'HoverElement'
  | 'HoverGroup'
  | 'HoverHandle'
  | 'DragMoving'
  | 'DragResizing'
  | 'DragRotating'
  | 'DragMarqueeSelecting';

class MoveInteraction {
  private startPoint: Point | null = null;
  private originalPositions: Map<string, Point> = new Map();
  private isDragging = false;
  constructor(private historyService?: HistoryService) {}
  start(selectedIds: string[], startPoint: Point): void {
    this.startPoint = { ...startPoint };
    this.originalPositions.clear();
    const state = useCanvasStore.getState();
    selectedIds.forEach((id) => {
      const el = state.elements[id];
      if (el) this.originalPositions.set(id, { x: el.x, y: el.y });
    });
    this.isDragging = true;
    // 注意：operation-start 事件改为在 SelectInteraction 中真正开始拖动时触发
  }
  update(currentPoint: Point): void {
    if (!this.isDragging || !this.startPoint) return;
    const dx = currentPoint.x - this.startPoint.x;
    const dy = currentPoint.y - this.startPoint.y;
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];
    this.originalPositions.forEach((pos, id) => {
      updates.push({ id, updates: { x: pos.x + dx, y: pos.y + dy } });
    });
    if (updates.length) {
      useCanvasStore.getState().updateElements(updates);
    }
  }
  end(endPoint: Point): void {
    if (!this.isDragging || !this.startPoint) return;
    const movements: Array<{ elementId: string; oldPosition: Point; newPosition: Point }> = [];
    const dx = endPoint.x - this.startPoint.x;
    const dy = endPoint.y - this.startPoint.y;
    this.originalPositions.forEach((pos, id) => {
      movements.push({
        elementId: id,
        oldPosition: pos,
        newPosition: { x: pos.x + dx, y: pos.y + dy },
      });
    });
    if (movements.length) {
      if (this.historyService) {
        const cmd = new MoveCommand(movements, {
          updateElement: useCanvasStore.getState().updateElement,
          updateElements: useCanvasStore.getState().updateElements,
        });
        void this.historyService.executeCommand(cmd);
      }
    }
    eventBus.emit('element:operation-end', { type: 'move' });
    this.reset();
  }
  cancel(): void {
    this.reset();
  }
  nudgeLeft(fast = false): void {
    this.nudge({ x: fast ? -10 : -1, y: 0 });
  }
  nudgeRight(fast = false): void {
    this.nudge({ x: fast ? 10 : 1, y: 0 });
  }
  nudgeUp(fast = false): void {
    this.nudge({ x: 0, y: fast ? -10 : -1 });
  }
  nudgeDown(fast = false): void {
    this.nudge({ x: 0, y: fast ? 10 : 1 });
  }
  private nudge(delta: Point): void {
    const store = useCanvasStore.getState();
    const ids = store.selectedElementIds;
    if (!ids.length) return;
    const movements: Array<{ elementId: string; oldPosition: Point; newPosition: Point }> = [];
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];
    ids.forEach((id) => {
      const el = store.elements[id];
      if (!el) return;
      const oldPos = { x: el.x, y: el.y };
      const newPos = { x: el.x + delta.x, y: el.y + delta.y };
      movements.push({ elementId: id, oldPosition: oldPos, newPosition: newPos });
      updates.push({ id, updates: newPos });
    });
    if (updates.length) {
      store.updateElements(updates);
      if (this.historyService) {
        const cmd = new MoveCommand(movements, {
          updateElement: store.updateElement,
          updateElements: store.updateElements,
        });
        void this.historyService.executeCommand(cmd);
      }
    }
  }
  private reset(): void {
    this.startPoint = null;
    this.originalPositions.clear();
    this.isDragging = false;
  }
}

class ResizeInteraction {
  private elementIds: string[] = [];
  private handleType: ResizeHandleType | null = null;
  private startPoint: Point | null = null;
  private startBounds: { x: number; y: number; width: number; height: number } | null = null;
  private originalElements: Map<string, Element> = new Map();
  private isDragging = false;
  constructor(private historyService?: HistoryService) {}
  startSingle(elementId: string, handleType: ResizeHandleType, startPoint: Point): void {
    const el = useCanvasStore.getState().elements[elementId];
    if (!el) return;
    this.elementIds = [elementId];
    this.handleType = handleType;
    this.startPoint = { ...startPoint };
    this.startBounds = { x: el.x, y: el.y, width: el.width, height: el.height };
    this.originalElements.set(elementId, { ...el });
    this.isDragging = true;
    // 注意：operation-start 事件改为在 SelectInteraction 中真正开始拖动时触发
  }
  startGroup(
    elementIds: string[],
    handleType: ResizeHandleType | null,
    bounds: { x: number; y: number; width: number; height: number },
    startPoint: Point,
  ): void {
    this.elementIds = [...elementIds];
    this.handleType = handleType;
    this.startPoint = { ...startPoint };
    this.startBounds = { ...bounds };
    const store = useCanvasStore.getState();
    this.originalElements.clear();
    this.elementIds.forEach((id) => {
      const el = store.elements[id];
      if (el) this.originalElements.set(id, { ...el });
    });
    this.isDragging = true;
    // 注意：operation-start 事件改为在 SelectInteraction 中真正开始拖动时触发
  }
  update(currentPoint: Point): void {
    if (!this.isDragging || !this.startPoint || !this.startBounds) return;
    const dx = currentPoint.x - this.startPoint.x;
    const dy = currentPoint.y - this.startPoint.y;
    const store = useCanvasStore.getState();
    if (this.elementIds.length === 1) {
      const id = this.elementIds[0];
      const base = this.originalElements.get(id);
      if (!base) return;
      let x = base.x;
      let y = base.y;
      let width = base.width;
      let height = base.height;
      if (
        this.handleType === 'right' ||
        this.handleType === 'top-right' ||
        this.handleType === 'bottom-right'
      ) {
        width = Math.max(1, base.width + dx);
      }
      if (
        this.handleType === 'left' ||
        this.handleType === 'top-left' ||
        this.handleType === 'bottom-left'
      ) {
        width = Math.max(1, base.width - dx);
        x = base.x + dx;
      }
      if (
        this.handleType === 'bottom' ||
        this.handleType === 'bottom-left' ||
        this.handleType === 'bottom-right'
      ) {
        height = Math.max(1, base.height + dy);
      }
      if (
        this.handleType === 'top' ||
        this.handleType === 'top-left' ||
        this.handleType === 'top-right'
      ) {
        height = Math.max(1, base.height - dy);
        y = base.y + dy;
      }
      if (
        this.handleType === 'top-left' ||
        this.handleType === 'top-right' ||
        this.handleType === 'bottom-left' ||
        this.handleType === 'bottom-right'
      ) {
        const s = Math.max(width / base.width, height / base.height);
        const newW = Math.max(1, base.width * s);
        const newH = Math.max(1, base.height * s);
        if (this.handleType === 'bottom-right') {
          x = base.x;
          y = base.y;
          width = newW;
          height = newH;
        } else if (this.handleType === 'top-left') {
          const anchorX = base.x + base.width;
          const anchorY = base.y + base.height;
          x = anchorX - newW;
          y = anchorY - newH;
          width = newW;
          height = newH;
        } else if (this.handleType === 'top-right') {
          const anchorX = base.x;
          const anchorY = base.y + base.height;
          x = anchorX;
          y = anchorY - newH;
          width = newW;
          height = newH;
        } else if (this.handleType === 'bottom-left') {
          const anchorX = base.x + base.width;
          const anchorY = base.y;
          x = anchorX - newW;
          y = anchorY;
          width = newW;
          height = newH;
        }
      }
      store.updateElement(id, { x, y, width, height });
    } else {
      const sb = this.startBounds;
      if (!sb) return;
      const cx = sb.x + sb.width / 2;
      const cy = sb.y + sb.height / 2;
      let newW = Math.max(1, sb.width);
      let newH = Math.max(1, sb.height);
      if (
        this.handleType === 'right' ||
        this.handleType === 'top-right' ||
        this.handleType === 'bottom-right'
      ) {
        newW = Math.max(1, sb.width + dx);
      }
      if (
        this.handleType === 'left' ||
        this.handleType === 'top-left' ||
        this.handleType === 'bottom-left'
      ) {
        newW = Math.max(1, sb.width - dx);
      }
      if (
        this.handleType === 'bottom' ||
        this.handleType === 'bottom-left' ||
        this.handleType === 'bottom-right'
      ) {
        newH = Math.max(1, sb.height + dy);
      }
      if (
        this.handleType === 'top' ||
        this.handleType === 'top-left' ||
        this.handleType === 'top-right'
      ) {
        newH = Math.max(1, sb.height - dy);
      }
      if (
        this.handleType === 'top-left' ||
        this.handleType === 'top-right' ||
        this.handleType === 'bottom-left' ||
        this.handleType === 'bottom-right'
      ) {
        const s = Math.max(newW / sb.width, newH / sb.height);
        newW = Math.max(1, sb.width * s);
        newH = Math.max(1, sb.height * s);
      }
      const scaleX = newW / sb.width;
      const scaleY = newH / sb.height;
      const newX = cx - newW / 2;
      const newY = cy - newH / 2;
      const updates: Array<{ id: string; updates: Partial<Element> }> = [];
      this.elementIds.forEach((id) => {
        const base = this.originalElements.get(id);
        if (!base) return;
        const baseCX = base.x + base.width / 2;
        const baseCY = base.y + base.height / 2;
        const relCX = baseCX - cx;
        const relCY = baseCY - cy;
        const childW = Math.max(1, base.width * scaleX);
        const childH = Math.max(1, base.height * scaleY);
        const newChildCX = cx + relCX * scaleX;
        const newChildCY = cy + relCY * scaleY;
        updates.push({
          id,
          updates: {
            x: newChildCX - childW / 2,
            y: newChildCY - childH / 2,
            width: childW,
            height: childH,
          },
        });
      });
      if (updates.length) store.updateElements(updates);
    }
  }
  end(): void {
    if (!this.isDragging || !this.startBounds) {
      this.reset();
      return;
    }
    const store = useCanvasStore.getState();
    const resizes: Array<{
      elementId: string;
      oldState: { x: number; y: number; width: number; height: number; rotation?: number };
      newState: { x: number; y: number; width: number; height: number; rotation?: number };
    }> = [];
    this.elementIds.forEach((id) => {
      const oldEl = this.originalElements.get(id);
      const newEl = store.elements[id];
      if (!oldEl || !newEl) return;
      resizes.push({
        elementId: id,
        oldState: {
          x: oldEl.x,
          y: oldEl.y,
          width: oldEl.width,
          height: oldEl.height,
          rotation: oldEl.rotation,
        },
        newState: {
          x: newEl.x,
          y: newEl.y,
          width: newEl.width,
          height: newEl.height,
          rotation: newEl.rotation,
        },
      });
    });
    if (resizes.length && this.historyService) {
      const cmd = new ResizeCommand(resizes, {
        updateElement: store.updateElement,
        updateElements: store.updateElements,
      });
      void this.historyService.executeCommand(cmd);
    }
    eventBus.emit('element:operation-end', { type: 'resize' });
    this.reset();
  }
  cancel(): void {
    this.reset();
  }
  private reset(): void {
    this.elementIds = [];
    this.handleType = null;
    this.startPoint = null;
    this.startBounds = null;
    this.originalElements.clear();
    this.isDragging = false;
  }
}

class RotateInteraction {
  private elementIds: string[] = [];
  private center: Point | null = null;
  private startRotation: Map<string, number> = new Map();
  private isDragging = false;
  constructor(private historyService?: HistoryService) {}
  startSingle(elementId: string, boundsCenter: Point): void {
    const el = useCanvasStore.getState().elements[elementId];
    if (!el) return;
    this.elementIds = [elementId];
    this.center = { ...boundsCenter };
    this.startRotation.set(elementId, el.rotation);
    this.isDragging = true;
    // 注意：operation-start 事件改为在 SelectInteraction 中真正开始拖动时触发
  }
  startGroup(elementIds: string[], boundsCenter: Point): void {
    this.elementIds = [...elementIds];
    this.center = { ...boundsCenter };
    const store = useCanvasStore.getState();
    this.startRotation.clear();
    elementIds.forEach((id) => {
      const el = store.elements[id];
      if (el) this.startRotation.set(id, el.rotation);
    });
    this.isDragging = true;
    // 注意：operation-start 事件改为在 SelectInteraction 中真正开始拖动时触发
  }
  update(currentPoint: Point): void {
    if (!this.isDragging || !this.center) return;
    const angle =
      Math.atan2(currentPoint.y - this.center.y, currentPoint.x - this.center.x) * (180 / Math.PI);
    const store = useCanvasStore.getState();
    this.elementIds.forEach((id) => {
      store.updateElement(id, { rotation: angle });
    });
  }
  end(): void {
    if (!this.isDragging) {
      this.reset();
      return;
    }
    const store = useCanvasStore.getState();
    const resizes: Array<{
      elementId: string;
      oldState: { x: number; y: number; width: number; height: number; rotation?: number };
      newState: { x: number; y: number; width: number; height: number; rotation?: number };
    }> = [];
    this.elementIds.forEach((id) => {
      const startRot = this.startRotation.get(id) ?? 0;
      const el = store.elements[id];
      if (!el) return;
      resizes.push({
        elementId: id,
        oldState: { x: el.x, y: el.y, width: el.width, height: el.height, rotation: startRot },
        newState: { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation },
      });
    });
    if (resizes.length && this.historyService) {
      const cmd = new ResizeCommand(resizes, {
        updateElement: store.updateElement,
        updateElements: store.updateElements,
      });
      void this.historyService.executeCommand(cmd);
    }
    eventBus.emit('element:operation-end', { type: 'rotate' });
    this.reset();
  }
  cancel(): void {
    this.reset();
  }
  private reset(): void {
    this.elementIds = [];
    this.center = null;
    this.startRotation.clear();
    this.isDragging = false;
  }
}

// 移除旧的 MarqueeInteraction；改为在 SelectInteraction 中维护框选起点

export class SelectInteraction {
  private state: SelectSubState = 'Idle';
  private selectionTolerance = 0.5;
  private debugEnabled = true;
  private marqueeActivationThreshold = 4;
  private coordinateTransformer = new CoordinateTransformer();
  private geometryService = new GeometryService(this.coordinateTransformer);
  private historyService: HistoryService | null = null;
  readonly moveInteraction: MoveInteraction;
  readonly resizeInteraction: ResizeInteraction;
  readonly rotateInteraction: RotateInteraction;
  private moveStartPoint: Point | null = null;
  constructor(historyService?: HistoryService) {
    if (historyService) this.historyService = historyService;
    this.moveInteraction = new MoveInteraction(this.historyService ?? undefined);
    this.resizeInteraction = new ResizeInteraction(this.historyService ?? undefined);
    this.rotateInteraction = new RotateInteraction(this.historyService ?? undefined);
    this.setupEventListeners();
  }
  setHistoryService(historyService: HistoryService): void {
    this.historyService = historyService;
  }
  private hoverInfo: {
    type: 'element' | 'group' | 'handle' | null;
    elementId?: string;
    handleType?: ResizeHandleType | 'rotation';
    isGroup?: boolean;
  } = { type: null };
  private setupEventListeners(): void {
    eventBus.on('pointerdown', this.handlePointerDown as (p: unknown) => void);
    eventBus.on('pointermove', this.handlePointerMove as (p: unknown) => void);
    eventBus.on('pointerup', this.handlePointerUp as (p: unknown) => void);
    eventBus.on('pointerupoutside', this.handlePointerUp as (p: unknown) => void);
    eventBus.on('text-editor:double-click-handled', () => {
      if (this.state === 'IdleButPotentialMove' || this.state === 'DragMoving') {
        this.moveInteraction.cancel();
      }
      this.state = 'Idle';
    });
  }
  private isSelectTool(): boolean {
    const isSelect = useCanvasStore.getState().tool.activeTool === 'select';
    if (this.debugEnabled) {
      this.log('tool-check', { activeTool: useCanvasStore.getState().tool.activeTool, isSelect });
    }
    return isSelect;
  }
  private handlePointerDown = (payload: CanvasEvent): void => {
    if (this.debugEnabled) {
      this.log('pointerdown', {
        world: payload.world,
        screen: payload.screen,
        modifiers: payload.modifiers,
        nativeType: (payload.nativeEvent as unknown as { type?: string })?.type,
        state: this.state,
      });
    }
    if (!this.isSelectTool()) return;
    if (
      this.state === 'DragMoving' ||
      this.state === 'DragResizing' ||
      this.state === 'DragRotating' ||
      this.state === 'DragMarqueeSelecting'
    )
      return;
    const handleInfo = this.computeHoverInfo(payload.world);
    if (handleInfo && handleInfo.type === 'handle') {
      const store = useCanvasStore.getState();
      const selectedIds = store.selectedElementIds;
      this.log('handle-detected', { handleInfo, selectedIds });
      if (handleInfo.handleType === 'rotation') {
        eventBus.emit('element:operation-start', { type: 'rotate' });
        if (handleInfo.isGroup) {
          const bounds = this.computeGroupBounds(selectedIds);
          const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
          this.rotateInteraction.startGroup(selectedIds, center);
        } else if (handleInfo.elementId) {
          const el = store.elements[handleInfo.elementId];
          if (!el) return;
          const center = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
          this.rotateInteraction.startSingle(handleInfo.elementId, center);
        }
        this.state = 'DragRotating';
        this.log('state-change', { to: this.state });
        return;
      }
      const handleType = handleInfo.handleType as ResizeHandleType;
      eventBus.emit('element:operation-start', { type: 'resize' });
      if (handleInfo.isGroup) {
        const bounds = this.computeGroupBounds(selectedIds);
        this.resizeInteraction.startGroup(selectedIds, handleType, bounds, payload.world);
      } else if (handleInfo.elementId) {
        this.resizeInteraction.startSingle(handleInfo.elementId, handleType, payload.world);
      }
      this.state = 'DragResizing';
      this.log('state-change', { to: this.state, handleType });
      return;
    }
    const hit = this.findTopHitElement(payload.world);
    const store = useCanvasStore.getState();
    const selectedIds = store.selectedElementIds;
    const multiSelect = !!(
      payload.modifiers.shift ||
      payload.modifiers.ctrl ||
      payload.modifiers.meta
    );
    const groupBounds = selectedIds.length > 1 ? this.computeGroupBounds(selectedIds) : null;
    const insideGroup = groupBounds ? this.isPointInRect(payload.world, groupBounds) : false;
    if (selectedIds.length > 1 && insideGroup) {
      if (multiSelect && hit?.id) {
        const exists = selectedIds.includes(hit.id);
        if (exists) store.removeFromSelection(hit.id);
        else store.addToSelection(hit.id);
        eventBus.emit('interaction:onSelectionChange', { selectedIds: store.selectedElementIds });
      }
      this.moveInteraction.start(store.selectedElementIds, payload.world);
      this.moveStartPoint = { ...payload.world };
      this.state = 'IdleButPotentialMove';
      this.log('state-change', { to: this.state, reason: 'group-inside-click' });
      return;
    }
    if (hit) {
      if (multiSelect) {
        const exists = store.selectedElementIds.includes(hit.id);
        if (exists) store.removeFromSelection(hit.id);
        else store.addToSelection(hit.id);
      } else {
        store.setSelectedElements([hit.id]);
      }
      this.log('element-hit', {
        world: payload.world,
        screen: payload.screen,
        elementId: hit.id,
        type: hit.type,
        bounds: { x: hit.x, y: hit.y, width: hit.width, height: hit.height },
        zIndex: hit.zIndex,
        rotation: hit.rotation,
        transform: hit.transform,
        visibility: hit.visibility,
        selectedIds: store.selectedElementIds,
      });
      eventBus.emit('interaction:onSelectionChange', { selectedIds: store.selectedElementIds });
      this.moveInteraction.start(store.selectedElementIds, payload.world);
      this.moveStartPoint = { ...payload.world };
      this.state = 'IdleButPotentialMove';
      this.log('state-change', { to: this.state });
      return;
    }
    // 空白点击（不在 group AABB 内且未命中元素/手柄）：进入框选潜在态；在指针抬起未越阈值时清空选区
    this.marqueeStartPoint = { ...payload.world };
    this.log('marquee-start', { start: this.marqueeStartPoint, screen: payload.screen });
    useCanvasStore.setState((state) => {
      state.tool.tempElement = undefined;
    });
    this.state = 'IdleButPotentialMarquee';
    this.log('state-change', { to: this.state });
  };
  private handlePointerMove = (payload: CanvasEvent): void => {
    if (this.debugEnabled) {
      this.log('pointermove', { world: payload.world, screen: payload.screen, state: this.state });
    }
    if (!this.isSelectTool()) return;
    if (this.state === 'IdleButPotentialMove') {
      const sp = this.moveStartPoint;
      if (!sp) return;
      const zoom = useCanvasStore.getState().viewport.zoom || 1;
      const threshold = this.marqueeActivationThreshold / zoom;
      const dist = Math.hypot(payload.world.x - sp.x, payload.world.y - sp.y);
      if (dist >= threshold) {
        this.state = 'DragMoving';
        this.log('state-change', { to: this.state, dist, threshold });
        eventBus.emit('element:operation-start', { type: 'move' });
        this.moveInteraction.update(payload.world);
      }
      return;
    }
    if (this.state === 'IdleButPotentialMarquee') {
      if (!this.marqueeStartPoint) return;
      const zoom = useCanvasStore.getState().viewport.zoom || 1;
      const threshold = this.marqueeActivationThreshold / zoom;
      const dx = payload.world.x - this.marqueeStartPoint.x;
      const dy = payload.world.y - this.marqueeStartPoint.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= threshold) {
        this.state = 'DragMarqueeSelecting';
        this.log('state-change', { to: this.state, dist, threshold });
        this.updateMarqueeSelection(payload.world);
      }
      return;
    }
    if (this.state === 'DragMoving') {
      this.moveInteraction.update(payload.world);
      return;
    }
    if (this.state === 'DragMarqueeSelecting') {
      this.updateMarqueeSelection(payload.world);
      return;
    }
    if (this.state === 'DragResizing') {
      this.resizeInteraction.update(payload.world);
      return;
    }
    if (this.state === 'DragRotating') {
      this.rotateInteraction.update(payload.world);
      return;
    }
    const hover = this.computeHoverInfo(payload.world);
    this.hoverInfo = hover ?? { type: null };
    if (hover?.type === 'handle') {
      this.state = 'HoverHandle';
      this.log('state-change', { to: this.state, handleInfo: hover });
      return;
    }
    if (hover?.type === 'element') {
      this.state = 'HoverElement';
      this.log('state-change', { to: this.state, hoverElementId: hover.elementId });
      return;
    }
    if (hover?.type === 'group') {
      this.state = 'HoverGroup';
      this.log('state-change', { to: this.state });
      return;
    }
    this.state = 'Idle';
    this.log('state-change', { to: this.state });
  };
  private handlePointerUp = (payload: CanvasEvent): void => {
    if (this.debugEnabled) {
      this.log('pointerup', { world: payload.world, screen: payload.screen, state: this.state });
    }
    if (!this.isSelectTool()) return;
    if (this.state === 'IdleButPotentialMove') {
      // 点击但未触发拖拽：不做移动
      this.moveInteraction.cancel();
      this.moveStartPoint = null;
      this.state = 'Idle';
      this.log('state-change', { to: this.state });
      return;
    }
    if (this.state === 'IdleButPotentialMarquee') {
      const start = this.marqueeStartPoint;
      const last = payload.world;
      const zoom = useCanvasStore.getState().viewport.zoom || 1;
      const threshold = this.marqueeActivationThreshold / zoom;
      const moved = start ? Math.hypot(last.x - start.x, last.y - start.y) : 0;
      const multiSelect = !!(
        payload.modifiers.shift ||
        payload.modifiers.ctrl ||
        payload.modifiers.meta
      );
      if (!start || moved <= threshold) {
        if (!multiSelect) {
          useCanvasStore.getState().setSelectedElements([]);
          eventBus.emit('interaction:onSelectionChange', { selectedIds: [] });
        }
      }
      this.endMarqueeSelection();
      this.state = 'Idle';
      this.log('state-change', { to: this.state });
      return;
    }
    if (this.state === 'DragMoving') {
      this.moveInteraction.end(payload.world);
      eventBus.emit('interaction:onMoveEnd', {
        selectedIds: useCanvasStore.getState().selectedElementIds,
      });
      this.state = 'Idle';
      this.log('state-change', { to: this.state });
      return;
    }
    if (this.state === 'DragMarqueeSelecting') {
      const start = this.marqueeStartPoint;
      const last = this.marqueeLastPoint;
      const moved = start && last ? Math.hypot(last.x - start.x, last.y - start.y) : 0;
      const zoom = useCanvasStore.getState().viewport.zoom || 1;
      const threshold = this.marqueeActivationThreshold / zoom;
      const multiSelect = !!(
        payload.modifiers.shift ||
        payload.modifiers.ctrl ||
        payload.modifiers.meta
      );
      if (!last || moved <= threshold) {
        if (!multiSelect) {
          useCanvasStore.getState().setSelectedElements([]);
          eventBus.emit('interaction:onSelectionChange', { selectedIds: [] });
        }
      }
      this.endMarqueeSelection();
      this.state = 'Idle';
      this.log('state-change', { to: this.state });
      return;
    }
    if (this.state === 'DragResizing') {
      this.resizeInteraction.end();
      eventBus.emit('interaction:onTransformEnd', {
        selectedIds: useCanvasStore.getState().selectedElementIds,
      });
      this.state = 'Idle';
      this.log('state-change', { to: this.state });
      return;
    }
    if (this.state === 'DragRotating') {
      this.rotateInteraction.end();
      eventBus.emit('interaction:onTransformEnd', {
        selectedIds: useCanvasStore.getState().selectedElementIds,
      });
      this.state = 'Idle';
      this.log('state-change', { to: this.state });
      return;
    }
  };
  private computeHoverInfo(worldPoint: Point): {
    type: 'element' | 'group' | 'handle' | null;
    elementId?: string;
    handleType?: ResizeHandleType | 'rotation';
    isGroup?: boolean;
  } | null {
    const store = useCanvasStore.getState();
    const selectedIds = store.selectedElementIds;
    const zoom = store.viewport.zoom || 1;
    const size = 10 / zoom;
    const rotOffset = 20 / zoom;
    const rotSize = size * 1.4;
    if (selectedIds.length > 0) {
      const bounds = this.computeGroupBounds(selectedIds);
      const tl = { x: bounds.x, y: bounds.y };
      const tr = { x: bounds.x + bounds.width, y: bounds.y };
      const br = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
      const bl = { x: bounds.x, y: bounds.y + bounds.height };
      const tm = { x: bounds.x + bounds.width / 2, y: bounds.y };
      const rm = { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
      const bm = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
      const lm = { x: bounds.x, y: bounds.y + bounds.height / 2 };
      const rotation = { x: bm.x, y: bm.y + rotOffset };
      const rectAt = (p: Point) => ({
        x: p.x - size / 2,
        y: p.y - size / 2,
        width: size,
        height: size,
      });
      const rectAtRot = (p: Point) => ({
        x: p.x - rotSize / 2,
        y: p.y - rotSize / 2,
        width: rotSize,
        height: rotSize,
      });
      const handles: Array<{
        handleType: ResizeHandleType | 'rotation';
        rect: { x: number; y: number; width: number; height: number };
      }> = [
        { handleType: 'top-left', rect: rectAt(tl) },
        { handleType: 'top', rect: rectAt(tm) },
        { handleType: 'top-right', rect: rectAt(tr) },
        { handleType: 'right', rect: rectAt(rm) },
        { handleType: 'bottom-right', rect: rectAt(br) },
        { handleType: 'bottom', rect: rectAt(bm) },
        { handleType: 'bottom-left', rect: rectAt(bl) },
        { handleType: 'left', rect: rectAt(lm) },
        { handleType: 'rotation', rect: rectAtRot(rotation) },
      ];
      for (const h of handles) {
        if (this.isPointInRect(worldPoint, h.rect)) {
          return {
            type: 'handle',
            handleType: h.handleType,
            isGroup: selectedIds.length > 1,
            elementId: selectedIds.length === 1 ? selectedIds[0] : undefined,
          };
        }
      }
    }
    const element = this.findTopHitElement(worldPoint);
    if (element) return { type: 'element', elementId: element.id };
    if (selectedIds.length > 1) {
      const bounds = this.computeGroupBounds(selectedIds);
      const insideGroup = this.isPointInRect(worldPoint, bounds);
      if (insideGroup) {
        return { type: 'group', isGroup: true };
      }
    }
    return null;
  }
  private isPointInRect(
    p: Point,
    r: { x: number; y: number; width: number; height: number },
  ): boolean {
    return !(p.x < r.x || p.x > r.x + r.width || p.y < r.y || p.y > r.y + r.height);
  }
  private computeGroupBounds(ids: string[]): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    ids.forEach((id) => {
      const bounds = this.geometryService.getElementBoundsWorld(new ElementProvider(id));
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    });
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private getRotatedCorners(el: Element): Array<Point> {
    const w = el.width * (el.transform?.scaleX ?? 1);
    const h = el.height * (el.transform?.scaleY ?? 1);
    const px = (el.transform?.pivotX ?? 0.5) * el.width;
    const py = (el.transform?.pivotY ?? 0.5) * el.height;
    const cx = el.x + px;
    const cy = el.y + py;
    const angle = (el.rotation * Math.PI) / 180;
    const corners = [
      { x: el.x, y: el.y },
      { x: el.x + w, y: el.y },
      { x: el.x + w, y: el.y + h },
      { x: el.x, y: el.y + h },
    ];
    return corners.map((p) => this.rotatePoint(p, { x: cx, y: cy }, angle));
  }

  private rotatePoint(p: Point, c: Point, rad: number): Point {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  }

  private pointInElement(world: Point, el: Element): boolean {
    const provider = new ElementProvider(el.id);
    const hit = this.geometryService.isPointInElement(world, provider);
    const bounds = this.geometryService.getElementBoundsWorld(provider);
    this.log('hit-test', {
      world,
      elementId: el.id,
      type: el.type,
      aabb: bounds,
      zIndex: el.zIndex,
      rotation: el.rotation,
      transform: el.transform,
      visibility: el.visibility,
      selectionTolerance: this.selectionTolerance,
      result: hit,
    });
    if (!hit) {
      const expanded = {
        x: bounds.x - this.selectionTolerance,
        y: bounds.y - this.selectionTolerance,
        width: bounds.width + this.selectionTolerance * 2,
        height: bounds.height + this.selectionTolerance * 2,
      };
      const approx = this.geometryService.rectIntersect(expanded, {
        x: world.x,
        y: world.y,
        width: 0.001,
        height: 0.001,
      });
      if (approx) {
        this.log('hit-test-tolerance', { elementId: el.id, world, expanded });
      }
      return approx;
    }
    return hit;
  }

  private rectIntersectsElement(
    rect: { x: number; y: number; width: number; height: number },
    el: Element,
  ): boolean {
    const aabb = this.computeElementAABB(el);
    this.log('rect-intersect', {
      rect,
      elementId: el.id,
      type: el.type,
      elementAABB: aabb,
      zIndex: el.zIndex,
      rotation: el.rotation,
      transform: el.transform,
      visibility: el.visibility,
    });
    return !(
      rect.x + rect.width < aabb.x ||
      rect.x > aabb.x + aabb.width ||
      rect.y + rect.height < aabb.y ||
      rect.y > aabb.y + aabb.height
    );
  }

  private computeElementAABB(el: Element): { x: number; y: number; width: number; height: number } {
    return this.geometryService.getElementBoundsWorld(new ElementProvider(el.id));
  }

  private findTopHitElement(worldPoint: Point): Element | null {
    const elements = Object.values(useCanvasStore.getState().elements);
    const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);
    this.log('hit-scan-start', { world: worldPoint, count: sorted.length });
    for (const el of sorted) {
      if (el.visibility === 'hidden') continue;
      const aabb = this.computeElementAABB(el);
      const expanded = {
        x: aabb.x - this.selectionTolerance,
        y: aabb.y - this.selectionTolerance,
        width: aabb.width + this.selectionTolerance * 2,
        height: aabb.height + this.selectionTolerance * 2,
      };
      if (!this.isPointInRect(worldPoint, expanded)) continue;
      const ok = this.pointInElement(worldPoint, el);
      if (ok) {
        this.log('top-hit', { world: worldPoint, elementId: el.id, zIndex: el.zIndex });
        return el;
      }
    }
    return null;
  }

  private marqueeStartPoint: Point | null = null;
  private marqueeLastPoint: Point | null = null;
  private updateMarqueeSelection(worldPoint: Point): void {
    if (!this.marqueeStartPoint) return;
    const x = Math.min(this.marqueeStartPoint.x, worldPoint.x);
    const y = Math.min(this.marqueeStartPoint.y, worldPoint.y);
    const width = Math.abs(worldPoint.x - this.marqueeStartPoint.x);
    const height = Math.abs(worldPoint.y - this.marqueeStartPoint.y);
    const rect = { x, y, width, height };
    this.marqueeLastPoint = { ...worldPoint };
    const start = this.marqueeStartPoint;
    const end = worldPoint;
    const dragDistance = Math.sqrt((start.x - end.x) ** 2 + (start.y - end.y) ** 2);
    const zoom = useCanvasStore.getState().viewport.zoom || 1;
    const threshold = this.marqueeActivationThreshold / zoom;
    if (dragDistance < threshold) {
      useCanvasStore.setState((state) => {
        state.tool.tempElement = undefined;
      });
    } else {
      const preview = ElementFactory.createRectangle(x, y, width, height, {
        fill: '#3b82f6',
        fillOpacity: 0.08,
        stroke: '#3b82f6',
        strokeOpacity: 1,
        strokeWidth: 1,
        borderRadius: 0,
      });
      useCanvasStore.setState((state) => {
        state.tool.tempElement = preview;
      });
    }
    const elements = Object.values(useCanvasStore.getState().elements);
    const selected = new SelectionManager().getElementsInRect(rect, elements);
    useCanvasStore.getState().setSelectedElements(selected.map((e) => e.id));
    this.log('marquee-update', {
      start: this.marqueeStartPoint,
      current: worldPoint,
      rect,
      selectedIds: selected.map((e) => e.id),
    });
    eventBus.emit('interaction:onSelectionChange', { selectedIds: selected.map((e) => e.id) });
  }
  private endMarqueeSelection(): void {
    this.marqueeStartPoint = null;
    this.marqueeLastPoint = null;
    this.log('marquee-end', {});
    useCanvasStore.setState((state) => {
      state.tool.tempElement = undefined;
    });
  }

  private log(tag: string, payload: unknown): void {
    const ts = new Date().toISOString();
    console.debug(`[SelectInteraction][${ts}][${tag}]`, payload);
    eventBus.emit('debug:select', { tag, ts, payload });
  }
}

export { MoveInteraction, ResizeInteraction, RotateInteraction };
