import { eventBus } from '../../lib/eventBus';
import { useCanvasStore } from '../../stores/canvas-store';
import type { Element, Point, Guideline } from '../../types/index';
import { isGroupElement } from '../../types/index';
import {
  getGroupDeepChildren,
  hitTestGroups,
  computeGroupBounds as groupComputeGroupBounds,
} from '../group-service';
import type { HistoryService } from '../HistoryService';
import { MoveCommand, ResizeCommand } from '../command/HistoryCommand';
import type { ResizeHandleType } from './interactionTypes';
import type { CanvasEvent } from '../../lib/EventBridge';
import { GeometryService } from '../../lib/Coordinate/GeometryService';
import { CoordinateTransformer } from '../../lib/Coordinate/CoordinateTransformer';
import { ElementProvider } from '../../lib/Coordinate/providers/ElementProvider';
import { ElementFactory } from '../element-factory';
import { SelectionManager } from '../SelectionManager';
import { ViewportManager } from '../../lib/Coordinate/ViewportManager';

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
  private groupIds: Set<string> = new Set();
  private snapAxis: 'x' | 'y' | null = null;
  private snapValue: number | null = null;
  private coordinateTransformer = new CoordinateTransformer();
  private geometryService = new GeometryService(this.coordinateTransformer);
  private viewportManager = new ViewportManager(this.coordinateTransformer);
  constructor(private historyService?: HistoryService) {}
  start(selectedIds: string[], startPoint: Point): void {
    this.startPoint = { ...startPoint };
    this.originalPositions.clear();
    this.groupIds.clear();
    this.snapAxis = null;
    this.snapValue = null;
    const state = useCanvasStore.getState();
    const movementSet = new Set<string>();
    selectedIds.forEach((sid) => {
      const el = state.elements[sid];
      if (!el) return;
      if (isGroupElement(el)) {
        this.groupIds.add(sid);
        movementSet.add(sid); // group 本身也要移动
        const children = getGroupDeepChildren(sid);
        children.forEach((cid) => movementSet.add(cid));
      } else {
        movementSet.add(sid);
      }
    });
    movementSet.forEach((id) => {
      const el = state.elements[id];
      if (el) this.originalPositions.set(id, { x: el.x, y: el.y });
    });
    this.isDragging = true;
    // 注意：operation-start 事件改为在 SelectInteraction 中真正开始拖动时触发
  }
  update(currentPoint: Point): void {
    if (!this.isDragging || !this.startPoint) return;
    const dx0 = currentPoint.x - this.startPoint.x;
    const dy0 = currentPoint.y - this.startPoint.y;
    const store = useCanvasStore.getState();
    if (!store.viewport.snapping.enabled) {
      const updates: Array<{ id: string; updates: Partial<Element> }> = [];
      this.originalPositions.forEach((pos, id) => {
        updates.push({ id, updates: { x: pos.x + dx0, y: pos.y + dy0 } });
      });
      if (updates.length) {
        useCanvasStore.getState().updateElements(updates);
      }
      const vp0 = useCanvasStore.getState().viewport;
      const nextSnap0 = { ...vp0.snapping, guidelines: [], showGuidelines: false };
      useCanvasStore.getState().setViewport({ snapping: nextSnap0 });
      return;
    }
    const selIds = Array.from(this.originalPositions.keys());
    const visibleBounds = this.viewportManager.getVisibleWorldBounds();
    const othersAll: Element[] = Object.values(store.elements).filter(
      (el) => !selIds.includes(el.id) && el.visibility !== 'hidden',
    );
    let bounds: { x: number; y: number; width: number; height: number } | null = null;
    if (selIds.length > 1) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      selIds.forEach((id) => {
        const base = store.elements[id];
        const pos = this.originalPositions.get(id)!;
        const x = pos.x;
        const y = pos.y;
        const w = base.width;
        const h = base.height;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
      });
      bounds = { x: minX + dx0, y: minY + dy0, width: maxX - minX, height: maxY - minY };
    } else if (selIds.length === 1) {
      const id = selIds[0];
      const base = store.elements[id];
      const pos = this.originalPositions.get(id)!;
      bounds = { x: pos.x + dx0, y: pos.y + dy0, width: base.width, height: base.height };
    }
    const guidelines: Guideline[] = [];
    let dx = dx0;
    let dy = dy0;
    if (bounds) {
      const threshold = store.viewport.snapping.threshold || 4;
      const snapToElements = store.viewport.snapping.snapToElements;
      const snapToCanvas = store.viewport.snapping.snapToCanvas;
      const intersect = (
        a: { x: number; y: number; width: number; height: number },
        b: {
          x: number;
          y: number;
          width: number;
          height: number;
        },
      ) =>
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      const others = othersAll.filter((el) => {
        const eb = this.geometryService.getElementBoundsWorld(new ElementProvider(el.id));
        return intersect(eb, visibleBounds);
      });
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const left = bounds.x;
      const right = bounds.x + bounds.width;
      const top = bounds.y;
      const bottom = bounds.y + bounds.height;
      const vList: Array<{ x: number; source: Guideline['source']; elementId?: string }> = [];
      const hList: Array<{ y: number; source: Guideline['source']; elementId?: string }> = [];
      if (snapToCanvas) {
        const cb = store.viewport.contentBounds;
        const ccx = cb.x + cb.width / 2;
        const ccy = cb.y + cb.height / 2;
        vList.push({ x: ccx, source: 'canvas-center' });
        hList.push({ y: ccy, source: 'canvas-center' });
      }
      if (snapToElements) {
        others.forEach((el) => {
          const ex = el.x;
          const ey = el.y;
          const ew = el.width;
          const eh = el.height;
          const ecx = ex + ew / 2;
          const ecy = ey + eh / 2;
          vList.push({ x: ecx, source: 'element-center', elementId: el.id });
          hList.push({ y: ecy, source: 'element-center', elementId: el.id });
          vList.push({ x: ex, source: 'element-edge', elementId: el.id });
          vList.push({ x: ex + ew, source: 'element-edge', elementId: el.id });
          hList.push({ y: ey, source: 'element-edge', elementId: el.id });
          hList.push({ y: ey + eh, source: 'element-edge', elementId: el.id });
        });
      }
      let bestAxis: 'x' | 'y' | null = null;
      let bestDelta = 0;
      let bestGuide: Guideline | null = null;
      let bestGuidePos: number | null = null;
      vList.forEach((c) => {
        const deltas = [c.x - cx, c.x - left, c.x - right];
        deltas.forEach((d) => {
          const ad = Math.abs(d);
          if (ad <= threshold) {
            if (bestAxis === null || Math.abs(bestDelta) > ad) {
              bestAxis = 'x';
              bestDelta = d;
              bestGuide = {
                type: 'vertical',
                position: c.x,
                source: c.source,
                strength: 'strong',
                elementId: c.elementId,
              };
              bestGuidePos = c.x;
            }
          }
        });
      });
      hList.forEach((c) => {
        const deltas = [c.y - cy, c.y - top, c.y - bottom];
        deltas.forEach((d) => {
          const ad = Math.abs(d);
          if (ad <= threshold) {
            if (bestAxis === null || Math.abs(bestDelta) > ad) {
              bestAxis = 'y';
              bestDelta = d;
              bestGuide = {
                type: 'horizontal',
                position: c.y,
                source: c.source,
                strength: 'strong',
                elementId: c.elementId,
              };
              bestGuidePos = c.y;
            }
          }
        });
      });
      const releaseThreshold = threshold * 1.5;
      if (this.snapAxis && this.snapValue != null) {
        const dist = this.snapAxis === 'x' ? this.snapValue - cx : this.snapValue - cy;
        if (Math.abs(dist) <= releaseThreshold) {
          if (this.snapAxis === 'x') dx = dx0 + dist;
          else dy = dy0 + dist;
          guidelines.push({
            type: this.snapAxis === 'x' ? 'vertical' : 'horizontal',
            position: this.snapValue,
            source: 'element-edge',
            strength: 'strong',
          });
        } else {
          this.snapAxis = null;
          this.snapValue = null;
        }
      }
      if (!this.snapAxis && bestAxis && bestGuide && bestGuidePos != null) {
        if (bestAxis === 'x') dx = dx0 + bestDelta;
        else dy = dy0 + bestDelta;
        this.snapAxis = bestAxis;
        this.snapValue = bestGuidePos;
        guidelines.push(bestGuide);
      }
    }
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];
    this.originalPositions.forEach((pos, id) => {
      updates.push({ id, updates: { x: pos.x + dx, y: pos.y + dy } });
    });
    if (updates.length) {
      useCanvasStore.getState().updateElements(updates);
    }
    const vp = useCanvasStore.getState().viewport;
    const nextSnap = { ...vp.snapping, guidelines, showGuidelines: guidelines.length > 0 };
    useCanvasStore.getState().setViewport({ snapping: nextSnap });
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
    if (this.groupIds.size > 0) {
      this.groupIds.forEach((gid) => {
        const gb = groupComputeGroupBounds(gid);
        if (gb) {
          const cb = useCanvasStore.getState().viewport.contentBounds;
          const nx = Math.max(cb.x, Math.min(cb.x + cb.width - gb.width, gb.x));
          const ny = Math.max(cb.y, Math.min(cb.y + cb.height - gb.height, gb.y));
          useCanvasStore
            .getState()
            .updateElement(gid, { x: nx, y: ny, width: gb.width, height: gb.height });
        }
      });
    }
    const vp = useCanvasStore.getState().viewport;
    const nextSnap = { ...vp.snapping, guidelines: [], showGuidelines: false };
    useCanvasStore.getState().setViewport({ snapping: nextSnap });
    this.reset();
  }
  cancel(): void {
    const vp = useCanvasStore.getState().viewport;
    const nextSnap = { ...vp.snapping, guidelines: [], showGuidelines: false };
    useCanvasStore.getState().setViewport({ snapping: nextSnap });
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
    const selectedIds = store.selectedElementIds;
    if (!selectedIds.length) return;
    const movementSet = new Set<string>();
    const groupIds = new Set<string>();
    selectedIds.forEach((sid) => {
      const el = store.elements[sid];
      if (!el) return;
      if (isGroupElement(el)) {
        groupIds.add(sid);
        movementSet.add(sid);
        const children = getGroupDeepChildren(sid);
        children.forEach((cid) => movementSet.add(cid));
      } else {
        movementSet.add(sid);
      }
    });
    const movements: Array<{ elementId: string; oldPosition: Point; newPosition: Point }> = [];
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];
    movementSet.forEach((id) => {
      const el = store.elements[id];
      if (!el) return;
      const oldPos = { x: el.x, y: el.y };
      const newPos = { x: el.x + delta.x, y: el.y + delta.y };
      movements.push({ elementId: id, oldPosition: oldPos, newPosition: newPos });
      updates.push({ id, updates: newPos });
    });
    if (updates.length) {
      store.updateElements(updates);
      groupIds.forEach((gid) => {
        const gb = groupComputeGroupBounds(gid);
        if (gb) {
          store.updateElement(gid, { x: gb.x, y: gb.y, width: gb.width, height: gb.height });
        }
      });
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
    this.groupIds.clear();
    this.snapAxis = null;
    this.snapValue = null;
  }
}

class ResizeInteraction {
  private elementIds: string[] = [];
  private handleType: ResizeHandleType | null = null;
  private startPoint: Point | null = null;
  private startBounds: { x: number; y: number; width: number; height: number } | null = null;
  private originalElements: Map<string, Element> = new Map();
  private isDragging = false;
  private coordinateTransformer = new CoordinateTransformer();
  private geometryService = new GeometryService(this.coordinateTransformer);
  private viewportManager = new ViewportManager(this.coordinateTransformer);
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
    const state = useCanvasStore.getState();
    const expanded: string[] = [];
    elementIds.forEach((id) => {
      const el = state.elements[id];
      if (el && isGroupElement(el)) {
        getGroupDeepChildren(id).forEach((cid) => expanded.push(cid));
      } else {
        expanded.push(id);
      }
    });
    this.elementIds = expanded;
    this.handleType = handleType;
    this.startPoint = { ...startPoint };
    this.startBounds = { ...bounds };
    this.originalElements.clear();
    this.elementIds.forEach((id) => {
      const el = state.elements[id];
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
    if (!store.viewport.snapping.enabled) {
      if (this.elementIds.length === 1) {
        const id = this.elementIds[0];
        const base = this.originalElements.get(id);
        if (!base || !this.handleType) return;
        const rad = (base.rotation || 0) * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dxLocal = dx * cos + dy * sin;
        const dyLocal = -dx * sin + dy * cos;
        const signMap: Record<string, { sx: number; sy: number }> = {
          'top-left': { sx: -1, sy: -1 },
          top: { sx: 0, sy: -1 },
          'top-right': { sx: 1, sy: -1 },
          right: { sx: 1, sy: 0 },
          'bottom-right': { sx: 1, sy: 1 },
          bottom: { sx: 0, sy: 1 },
          'bottom-left': { sx: -1, sy: 1 },
          left: { sx: -1, sy: 0 },
        };
        const sgn = signMap[this.handleType];
        let newW1 = base.width;
        let newH1 = base.height;
        if (sgn.sx !== 0) newW1 = Math.max(1, base.width + sgn.sx * dxLocal);
        if (sgn.sy !== 0) newH1 = Math.max(1, base.height + sgn.sy * dyLocal);
        let newW = newW1;
        let newH = newH1;
        const isCorner = sgn.sx !== 0 && sgn.sy !== 0;
        if (isCorner) {
          const s = Math.max(newW1 / base.width, newH1 / base.height);
          newW = Math.max(1, base.width * s);
          newH = Math.max(1, base.height * s);
        }
        const dW = newW - base.width;
        const dH = newH - base.height;
        const shiftLocalX = sgn.sx !== 0 ? (sgn.sx * dW) / 2 : 0;
        const shiftLocalY = sgn.sy !== 0 ? (sgn.sy * dH) / 2 : 0;
        const shiftWorldX = shiftLocalX * cos - shiftLocalY * sin;
        const shiftWorldY = shiftLocalX * sin + shiftLocalY * cos;
        const cx = base.x + base.width / 2;
        const cy = base.y + base.height / 2;
        const ncx = cx + shiftWorldX;
        const ncy = cy + shiftWorldY;
        const nx = ncx - newW / 2;
        const ny = ncy - newH / 2;
        store.updateElement(id, { x: nx, y: ny, width: newW, height: newH });
        const nextSnap0 = { ...store.viewport.snapping, guidelines: [], showGuidelines: false };
        useCanvasStore.getState().setViewport({ snapping: nextSnap0 });
        return;
      }
    }
    if (this.elementIds.length === 1) {
      const id = this.elementIds[0];
      const base = this.originalElements.get(id);
      if (!base) return;
      const rad = (base.rotation || 0) * (Math.PI / 180);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dxLocal = dx * cos + dy * sin;
      const dyLocal = -dx * sin + dy * cos;
      const signMap: Record<string, { sx: number; sy: number }> = {
        'top-left': { sx: -1, sy: -1 },
        top: { sx: 0, sy: -1 },
        'top-right': { sx: 1, sy: -1 },
        right: { sx: 1, sy: 0 },
        'bottom-right': { sx: 1, sy: 1 },
        bottom: { sx: 0, sy: 1 },
        'bottom-left': { sx: -1, sy: 1 },
        left: { sx: -1, sy: 0 },
      };
      const sgn = signMap[this.handleType!];
      let newW1 = base.width;
      let newH1 = base.height;
      if (sgn.sx !== 0) newW1 = Math.max(1, base.width + sgn.sx * dxLocal);
      if (sgn.sy !== 0) newH1 = Math.max(1, base.height + sgn.sy * dyLocal);
      let width = newW1;
      let height = newH1;
      const isCorner = sgn.sx !== 0 && sgn.sy !== 0;
      if (isCorner) {
        const s = Math.max(newW1 / base.width, newH1 / base.height);
        width = Math.max(1, base.width * s);
        height = Math.max(1, base.height * s);
      }
      const dW = width - base.width;
      const dH = height - base.height;
      const shiftLocalX = sgn.sx !== 0 ? (sgn.sx * dW) / 2 : 0;
      const shiftLocalY = sgn.sy !== 0 ? (sgn.sy * dH) / 2 : 0;
      const shiftWorldX = shiftLocalX * cos - shiftLocalY * sin;
      const shiftWorldY = shiftLocalX * sin + shiftLocalY * cos;
      const cx0 = base.x + base.width / 2;
      const cy0 = base.y + base.height / 2;
      let x = cx0 + shiftWorldX - width / 2;
      let y = cy0 + shiftWorldY - height / 2;
      const vp = useCanvasStore.getState().viewport;
      const visibleBounds = this.viewportManager.getVisibleWorldBounds();
      const intersect = (
        a: { x: number; y: number; width: number; height: number },
        b: {
          x: number;
          y: number;
          width: number;
          height: number;
        },
      ) =>
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      const others: Element[] = Object.values(store.elements)
        .filter((el) => el.id !== id && el.visibility !== 'hidden')
        .filter((el) => {
          const eb = this.geometryService.getElementBoundsWorld(new ElementProvider(el.id));
          return intersect(eb, visibleBounds);
        });
      const threshold = vp.snapping.threshold || 4;
      const snapToElements = vp.snapping.snapToElements;
      const snapToCanvas = vp.snapping.snapToCanvas;
      const cx = x + width / 2;
      const cy = y + height / 2;
      const left = x;
      const right = x + width;
      const top = y;
      const bottom = y + height;
      const vList: Array<{ x: number; source: Guideline['source']; elementId?: string }> = [];
      const hList: Array<{ y: number; source: Guideline['source']; elementId?: string }> = [];
      if (snapToCanvas) {
        const cb = vp.contentBounds;
        const ccx = cb.x + cb.width / 2;
        const ccy = cb.y + cb.height / 2;
        vList.push({ x: ccx, source: 'canvas-center' });
        hList.push({ y: ccy, source: 'canvas-center' });
      }
      if (snapToElements) {
        others.forEach((el) => {
          const ex = el.x;
          const ey = el.y;
          const ew = el.width;
          const eh = el.height;
          const ecx = ex + ew / 2;
          const ecy = ey + eh / 2;
          vList.push({ x: ecx, source: 'element-center', elementId: el.id });
          hList.push({ y: ecy, source: 'element-center', elementId: el.id });
          vList.push({ x: ex, source: 'element-edge', elementId: el.id });
          vList.push({ x: ex + ew, source: 'element-edge', elementId: el.id });
          hList.push({ y: ey, source: 'element-edge', elementId: el.id });
          hList.push({ y: ey + eh, source: 'element-edge', elementId: el.id });
        });
      }
      let bestAxis: 'x' | 'y' | null = null;
      let bestDelta = 0;
      let bestGuide: Guideline | null = null;
      vList.forEach((c) => {
        const deltas = [c.x - cx, c.x - left, c.x - right];
        deltas.forEach((d) => {
          const ad = Math.abs(d);
          if (ad <= threshold) {
            if (bestAxis === null || Math.abs(bestDelta) > ad) {
              bestAxis = 'x';
              bestDelta = d;
              bestGuide = {
                type: 'vertical',
                position: c.x,
                source: c.source,
                strength: 'strong',
                elementId: c.elementId,
              };
            }
          }
        });
      });
      hList.forEach((c) => {
        const deltas = [c.y - cy, c.y - top, c.y - bottom];
        deltas.forEach((d) => {
          const ad = Math.abs(d);
          if (ad <= threshold) {
            if (bestAxis === null || Math.abs(bestDelta) > ad) {
              bestAxis = 'y';
              bestDelta = d;
              bestGuide = {
                type: 'horizontal',
                position: c.y,
                source: c.source,
                strength: 'strong',
                elementId: c.elementId,
              };
            }
          }
        });
      });
      const guides: Guideline[] = [];
      if (bestAxis && bestGuide) {
        if (bestAxis === 'x') x += bestDelta;
        else y += bestDelta;
        guides.push(bestGuide);
      }
      store.updateElement(id, { x, y, width, height });
      const nextSnap = { ...vp.snapping, guidelines: guides, showGuidelines: guides.length > 0 };
      useCanvasStore.getState().setViewport({ snapping: nextSnap });
    } else {
      const sb = this.startBounds;
      if (!sb || !this.handleType) return;
      const handle = this.handleType;
      let ax = 0;
      let ay = 0;
      let hx0 = 0;
      let hy0 = 0;
      let allowX = false;
      let allowY = false;
      if (handle === 'top-left') {
        ax = sb.x + sb.width;
        ay = sb.y + sb.height;
        hx0 = sb.x;
        hy0 = sb.y;
        allowX = true;
        allowY = true;
      } else if (handle === 'top') {
        ax = sb.x + sb.width / 2;
        ay = sb.y + sb.height;
        hx0 = sb.x + sb.width / 2;
        hy0 = sb.y;
        allowX = false;
        allowY = true;
      } else if (handle === 'top-right') {
        ax = sb.x;
        ay = sb.y + sb.height;
        hx0 = sb.x + sb.width;
        hy0 = sb.y;
        allowX = true;
        allowY = true;
      } else if (handle === 'right') {
        ax = sb.x;
        ay = sb.y + sb.height / 2;
        hx0 = sb.x + sb.width;
        hy0 = sb.y + sb.height / 2;
        allowX = true;
        allowY = false;
      } else if (handle === 'bottom-right') {
        ax = sb.x;
        ay = sb.y;
        hx0 = sb.x + sb.width;
        hy0 = sb.y + sb.height;
        allowX = true;
        allowY = true;
      } else if (handle === 'bottom') {
        ax = sb.x + sb.width / 2;
        ay = sb.y;
        hx0 = sb.x + sb.width / 2;
        hy0 = sb.y + sb.height;
        allowX = false;
        allowY = true;
      } else if (handle === 'bottom-left') {
        ax = sb.x + sb.width;
        ay = sb.y;
        hx0 = sb.x;
        hy0 = sb.y + sb.height;
        allowX = true;
        allowY = true;
      } else if (handle === 'left') {
        ax = sb.x + sb.width;
        ay = sb.y + sb.height / 2;
        hx0 = sb.x;
        hy0 = sb.y + sb.height / 2;
        allowX = true;
        allowY = false;
      }
      const sx = handle === 'left' || handle === 'top-left' || handle === 'bottom-left' ? -1 : 1;
      const sy = handle === 'top' || handle === 'top-left' || handle === 'top-right' ? -1 : 1;
      let hx = hx0 + (allowX ? dx : 0);
      let hy = hy0 + (allowY ? dy : 0);
      if (allowX) {
        if (sx === -1 && hx > ax) hx = ax;
        if (sx === 1 && hx < ax) hx = ax;
      }
      if (allowY) {
        if (sy === -1 && hy > ay) hy = ay;
        if (sy === 1 && hy < ay) hy = ay;
      }
      let newW = Math.max(1, allowX ? Math.abs(ax - hx) : sb.width);
      let newH = Math.max(1, allowY ? Math.abs(ay - hy) : sb.height);
      const isCorner =
        allowX &&
        allowY &&
        (handle === 'top-left' ||
          handle === 'top-right' ||
          handle === 'bottom-left' ||
          handle === 'bottom-right');
      if (isCorner) {
        const s = Math.max(newW / sb.width, newH / sb.height);
        newW = Math.max(1, sb.width * s);
        newH = Math.max(1, sb.height * s);
      }
      let newX = sb.x;
      let newY = sb.y;
      if (handle === 'top-left') {
        newX = ax - newW;
        newY = ay - newH;
      } else if (handle === 'top') {
        newX = ax - newW / 2;
        newY = ay - newH;
      } else if (handle === 'top-right') {
        newX = ax;
        newY = ay - newH;
      } else if (handle === 'right') {
        newX = ax;
        newY = ay - newH / 2;
      } else if (handle === 'bottom-right') {
        newX = ax;
        newY = ay;
      } else if (handle === 'bottom') {
        newX = ax - newW / 2;
        newY = ay;
      } else if (handle === 'bottom-left') {
        newX = ax - newW;
        newY = ay;
      } else if (handle === 'left') {
        newX = ax - newW;
        newY = ay - newH / 2;
      }
      const vp = useCanvasStore.getState().viewport;
      const threshold = vp.snapping.threshold || 4;
      const snapToElements = vp.snapping.snapToElements;
      const snapToCanvas = vp.snapping.snapToCanvas;
      const left = newX;
      const right = newX + newW;
      const top = newY;
      const bottom = newY + newH;
      const vList: Array<{ x: number; source: Guideline['source']; elementId?: string }> = [];
      const hList: Array<{ y: number; source: Guideline['source']; elementId?: string }> = [];
      if (snapToCanvas) {
        const cb = vp.contentBounds;
        const ccx = cb.x + cb.width / 2;
        const ccy = cb.y + cb.height / 2;
        vList.push({ x: ccx, source: 'canvas-center' });
        hList.push({ y: ccy, source: 'canvas-center' });
      }
      const visibleBounds2 = this.viewportManager.getVisibleWorldBounds();
      const intersect2 = (
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number },
      ) =>
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      const allOthers: Element[] = Object.values(useCanvasStore.getState().elements)
        .filter((el) => !this.elementIds.includes(el.id) && el.visibility !== 'hidden')
        .filter((el) => {
          const eb = this.geometryService.getElementBoundsWorld(new ElementProvider(el.id));
          return intersect2(eb, visibleBounds2);
        });
      if (snapToElements) {
        allOthers.forEach((el) => {
          const ex = el.x;
          const ey = el.y;
          const ew = el.width;
          const eh = el.height;
          const ecx = ex + ew / 2;
          const ecy = ey + eh / 2;
          vList.push({ x: ecx, source: 'element-center', elementId: el.id });
          hList.push({ y: ecy, source: 'element-center', elementId: el.id });
          vList.push({ x: ex, source: 'element-edge', elementId: el.id });
          vList.push({ x: ex + ew, source: 'element-edge', elementId: el.id });
          hList.push({ y: ey, source: 'element-edge', elementId: el.id });
          hList.push({ y: ey + eh, source: 'element-edge', elementId: el.id });
        });
      }
      let bestAxis: 'x' | 'y' | null = null;
      let bestDelta = 0;
      let bestGuide: Guideline | null = null;
      if (allowX) {
        const targetX =
          handle === 'left' || handle === 'top-left' || handle === 'bottom-left' ? left : right;
        vList.forEach((c) => {
          const d = c.x - targetX;
          const ad = Math.abs(d);
          if (ad <= threshold) {
            if (bestAxis === null || Math.abs(bestDelta) > ad) {
              bestAxis = 'x';
              bestDelta = d;
              bestGuide = {
                type: 'vertical',
                position: c.x,
                source: c.source,
                strength: 'strong',
                elementId: c.elementId,
              };
            }
          }
        });
      }
      if (allowY) {
        const targetY =
          handle === 'top' || handle === 'top-left' || handle === 'top-right' ? top : bottom;
        hList.forEach((c) => {
          const d = c.y - targetY;
          const ad = Math.abs(d);
          if (ad <= threshold) {
            if (bestAxis === null || Math.abs(bestDelta) > ad) {
              bestAxis = 'y';
              bestDelta = d;
              bestGuide = {
                type: 'horizontal',
                position: c.y,
                source: c.source,
                strength: 'strong',
                elementId: c.elementId,
              };
            }
          }
        });
      }
      const guides: Guideline[] = [];
      if (bestAxis && bestGuide) {
        if (bestAxis === 'x') {
          if (handle === 'left' || handle === 'top-left' || handle === 'bottom-left') {
            newX += bestDelta;
          } else {
            newW = Math.max(1, newW + bestDelta);
          }
        } else {
          if (handle === 'top' || handle === 'top-left' || handle === 'top-right') {
            newY += bestDelta;
          } else {
            newH = Math.max(1, newH + bestDelta);
          }
        }
        if (isCorner) {
          if (bestAxis === 'x') {
            const s = Math.max(newW / sb.width, newH / sb.height);
            newW = Math.max(1, sb.width * s);
            newH = Math.max(1, sb.height * s);
          } else {
            const s = Math.max(newW / sb.width, newH / sb.height);
            newW = Math.max(1, sb.width * s);
            newH = Math.max(1, sb.height * s);
          }
        }
        if (handle === 'top-left') {
          newX = ax - newW;
          newY = ay - newH;
        } else if (handle === 'top') {
          newX = ax - newW / 2;
          newY = ay - newH;
        } else if (handle === 'top-right') {
          newX = ax;
          newY = ay - newH;
        } else if (handle === 'right') {
          newX = ax;
          newY = ay - newH / 2;
        } else if (handle === 'bottom-right') {
          newX = ax;
          newY = ay;
        } else if (handle === 'bottom') {
          newX = ax - newW / 2;
          newY = ay;
        } else if (handle === 'bottom-left') {
          newX = ax - newW;
          newY = ay;
        } else if (handle === 'left') {
          newX = ax - newW;
          newY = ay - newH / 2;
        }
        guides.push(bestGuide);
      }
      const scaleX = newW / sb.width;
      const scaleY = newH / sb.height;
      const updates: Array<{ id: string; updates: Partial<Element> }> = [];
      this.elementIds.forEach((id) => {
        const base = this.originalElements.get(id);
        if (!base) return;
        const nx = ax + (base.x - ax) * scaleX;
        const ny = ay + (base.y - ay) * scaleY;
        const childW = Math.max(1, base.width * scaleX);
        const childH = Math.max(1, base.height * scaleY);
        updates.push({ id, updates: { x: nx, y: ny, width: childW, height: childH } });
      });
      if (updates.length) store.updateElements(updates);
      const selectedIds = useCanvasStore.getState().selectedElementIds;
      selectedIds.forEach((sid) => {
        const el = useCanvasStore.getState().elements[sid];
        if (el && isGroupElement(el)) {
          const gb = groupComputeGroupBounds(sid);
          if (gb) {
            const cb = useCanvasStore.getState().viewport.contentBounds;
            const nx2 = Math.max(cb.x, Math.min(cb.x + cb.width - gb.width, gb.x));
            const ny2 = Math.max(cb.y, Math.min(cb.y + cb.height - gb.height, gb.y));
            useCanvasStore
              .getState()
              .updateElement(sid, { x: nx2, y: ny2, width: gb.width, height: gb.height });
          }
        }
      });
      const nextSnap = { ...vp.snapping, guidelines: guides, showGuidelines: guides.length > 0 };
      useCanvasStore.getState().setViewport({ snapping: nextSnap });
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
    const vp = useCanvasStore.getState().viewport;
    const nextSnap = { ...vp.snapping, guidelines: [], showGuidelines: false };
    useCanvasStore.getState().setViewport({ snapping: nextSnap });
    this.reset();
  }
  cancel(): void {
    const vp = useCanvasStore.getState().viewport;
    const nextSnap = { ...vp.snapping, guidelines: [], showGuidelines: false };
    useCanvasStore.getState().setViewport({ snapping: nextSnap });
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
  private startPointerAngle: number | null = null;
  private isDragging = false;
  constructor(private historyService?: HistoryService) {}
  startSingle(elementId: string, boundsCenter: Point, startPoint: Point): void {
    const el = useCanvasStore.getState().elements[elementId];
    if (!el) return;
    this.elementIds = [elementId];
    this.center = { ...boundsCenter };
    this.startRotation.set(elementId, el.rotation);
    this.startPointerAngle =
      Math.atan2(startPoint.y - boundsCenter.y, startPoint.x - boundsCenter.x) * (180 / Math.PI);
    this.isDragging = true;
    // 注意：operation-start 事件改为在 SelectInteraction 中真正开始拖动时触发
  }
  startGroup(elementIds: string[], boundsCenter: Point, startPoint: Point): void {
    const state = useCanvasStore.getState();
    const expanded: string[] = [];
    elementIds.forEach((id) => {
      const el = state.elements[id];
      if (el && isGroupElement(el)) {
        getGroupDeepChildren(id).forEach((cid) => expanded.push(cid));
      } else {
        expanded.push(id);
      }
    });
    this.elementIds = expanded;
    this.center = { ...boundsCenter };
    this.startRotation.clear();
    this.elementIds.forEach((id) => {
      const el = state.elements[id];
      if (el) this.startRotation.set(id, el.rotation);
    });
    this.startPointerAngle =
      Math.atan2(startPoint.y - boundsCenter.y, startPoint.x - boundsCenter.x) * (180 / Math.PI);
    this.isDragging = true;
    // 注意：operation-start 事件改为在 SelectInteraction 中真正开始拖动时触发
  }
  update(currentPoint: Point): void {
    if (!this.isDragging || !this.center || this.startPointerAngle === null) return;
    const currentAngle =
      Math.atan2(currentPoint.y - this.center.y, currentPoint.x - this.center.x) * (180 / Math.PI);
    const delta = currentAngle - this.startPointerAngle;
    const store = useCanvasStore.getState();
    this.elementIds.forEach((id) => {
      const base = this.startRotation.get(id) ?? 0;
      store.updateElement(id, { rotation: base + delta });
    });
    const selectedIds = useCanvasStore.getState().selectedElementIds;
    selectedIds.forEach((sid) => {
      const el = useCanvasStore.getState().elements[sid];
      if (el && isGroupElement(el)) {
        const base = this.startRotation.get(sid) ?? el.rotation;
        store.updateElement(sid, { rotation: (base ?? 0) + delta });
        const gb = groupComputeGroupBounds(sid);
        if (gb) {
          const cb = useCanvasStore.getState().viewport.contentBounds;
          const nx = Math.max(cb.x, Math.min(cb.x + cb.width - gb.width, gb.x));
          const ny = Math.max(cb.y, Math.min(cb.y + cb.height - gb.height, gb.y));
          store.updateElement(sid, { x: nx, y: ny, width: gb.width, height: gb.height });
        }
      }
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
    this.startPointerAngle = null;
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

  // 光标管理
  private container: HTMLElement | null = null;
  private lockedCursor: string | null = null;
  private originalCursor: string | null = null;

  constructor(historyService?: HistoryService) {
    if (historyService) this.historyService = historyService;
    this.moveInteraction = new MoveInteraction(this.historyService ?? undefined);
    this.resizeInteraction = new ResizeInteraction(this.historyService ?? undefined);
    this.rotateInteraction = new RotateInteraction(this.historyService ?? undefined);
    this.setupEventListeners();
  }

  /**
   * 设置容器元素，用于光标管理
   */
  setContainer(container: HTMLElement): void {
    this.container = container;
  }

  /**
   * 锁定光标样式
   */
  private lockCursor(cursor: string): void {
    if (!this.container) return;
    this.originalCursor = this.container.style.cursor;
    this.lockedCursor = cursor;
    this.container.style.cursor = cursor;
    // 添加高优先级样式，防止被覆盖
    this.container.style.setProperty('cursor', cursor, 'important');
  }

  /**
   * 解除光标锁定
   */
  private unlockCursor(): void {
    if (!this.container) return;
    this.lockedCursor = null;
    // 移除 important 标记
    this.container.style.removeProperty('cursor');
    // 恢复原始光标或设置为默认值
    if (this.originalCursor) {
      this.container.style.cursor = this.originalCursor;
    }
    this.originalCursor = null;
  }

  /**
   * 如果光标未被锁定，则设置光标样式（用于悬停状态）
   */
  private setCursorIfNotLocked(cursor: string): void {
    if (!this.container || this.lockedCursor) return;
    this.container.style.cursor = cursor;
  }

  /**
   * 检查光标是否被锁定
   */
  isCursorLocked(): boolean {
    return this.lockedCursor !== null;
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
    this.moveInteraction.cancel();
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
        // 锁定旋转光标
        this.lockCursor('pointer');

        if (handleInfo.isGroup) {
          const bounds = this.computeSelectionAABBFromIds(selectedIds);
          const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
          this.rotateInteraction.startGroup(selectedIds, center, payload.world);
        } else if (handleInfo.elementId) {
          const el = store.elements[handleInfo.elementId];
          if (!el) return;
          const corners = this.geometryService.getElementWorldCorners(
            new ElementProvider(handleInfo.elementId),
          );
          const center = {
            x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
            y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
          };
          this.rotateInteraction.startSingle(handleInfo.elementId, center, payload.world);
        }
        this.state = 'DragRotating';
        this.log('state-change', { to: this.state });
        return;
      }
      const handleType = handleInfo.handleType as ResizeHandleType;
      eventBus.emit('element:operation-start', { type: 'resize' });

      // 锁定对应的 resize 光标（排除 rotation）
      const resizeCursors: Partial<Record<ResizeHandleType, string>> = {
        'top-left': 'nwse-resize',
        top: 'ns-resize',
        'top-right': 'nesw-resize',
        right: 'ew-resize',
        'bottom-right': 'nwse-resize',
        bottom: 'ns-resize',
        'bottom-left': 'nesw-resize',
        left: 'ew-resize',
      };
      const cursor = resizeCursors[handleType] || 'default';
      this.lockCursor(cursor);

      if (handleInfo.isGroup) {
        const bounds = this.computeSelectionAABBFromIds(selectedIds);
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
      let newSelectedIds = selectedIds.slice();
      if (multiSelect && hit?.id) {
        const exists = newSelectedIds.includes(hit.id);
        newSelectedIds = exists
          ? newSelectedIds.filter((id) => id !== hit.id)
          : [...newSelectedIds, hit.id];
        store.setSelectedElements(newSelectedIds);
        eventBus.emit('interaction:onSelectionChange', { selectedIds: newSelectedIds });
      }
      this.moveInteraction.start(newSelectedIds, payload.world);
      this.moveStartPoint = { ...payload.world };
      this.state = 'IdleButPotentialMove';
      this.log('state-change', { to: this.state, reason: 'group-inside-click' });
      return;
    }
    if (hit) {
      let newSelectedIds: string[];
      if (multiSelect) {
        const exists = selectedIds.includes(hit.id);
        newSelectedIds = exists
          ? selectedIds.filter((id) => id !== hit.id)
          : [...selectedIds, hit.id];
      } else {
        newSelectedIds = [hit.id];
      }
      store.setSelectedElements(newSelectedIds);
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
      eventBus.emit('interaction:onSelectionChange', { selectedIds: newSelectedIds });
      this.moveInteraction.start(newSelectedIds, payload.world);
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
      // 悬停到 handle 时，设置对应的光标样式
      if (hover.handleType === 'rotation') {
        this.setCursorIfNotLocked('pointer');
      } else {
        const resizeCursors: Partial<Record<ResizeHandleType, string>> = {
          'top-left': 'nwse-resize',
          top: 'ns-resize',
          'top-right': 'nesw-resize',
          right: 'ew-resize',
          'bottom-right': 'nwse-resize',
          bottom: 'ns-resize',
          'bottom-left': 'nesw-resize',
          left: 'ew-resize',
        };
        const cursor = resizeCursors[hover.handleType as ResizeHandleType] || 'default';
        this.setCursorIfNotLocked(cursor);
      }
      this.state = 'HoverHandle';
      this.log('state-change', { to: this.state, handleInfo: hover });
      return;
    }
    if (hover?.type === 'element') {
      this.setCursorIfNotLocked('move');
      this.state = 'HoverElement';
      this.log('state-change', { to: this.state, hoverElementId: hover.elementId });
      return;
    }
    if (hover?.type === 'group') {
      this.setCursorIfNotLocked('default');
      this.state = 'HoverGroup';
      this.log('state-change', { to: this.state });
      return;
    }
    this.setCursorIfNotLocked('default');
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
      this.unlockCursor();
      eventBus.emit('interaction:onTransformEnd', {
        selectedIds: useCanvasStore.getState().selectedElementIds,
      });
      this.state = 'Idle';
      this.log('state-change', { to: this.state });
      return;
    }
    if (this.state === 'DragRotating') {
      this.rotateInteraction.end();
      this.unlockCursor();
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

      if (
        selectedIds.length === 1 &&
        !!store.elements[selectedIds[0]] &&
        !isGroupElement(store.elements[selectedIds[0]] as Element)
      ) {
        const el = store.elements[selectedIds[0]] as Element;
        const corners = this.geometryService.getElementWorldCorners(new ElementProvider(el.id));
        const tl = corners[0];
        const tr = corners[1];
        const br = corners[2];
        const bl = corners[3];
        const tm = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
        const rm = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };
        const bm = { x: (br.x + bl.x) / 2, y: (br.y + bl.y) / 2 };
        const lm = { x: (bl.x + tl.x) / 2, y: (bl.y + tl.y) / 2 };
        const center = {
          x: (tl.x + tr.x + br.x + bl.x) / 4,
          y: (tl.y + tr.y + br.y + bl.y) / 4,
        };
        const edgeVec = { x: tr.x - tl.x, y: tr.y - tl.y };
        const normal = { x: -edgeVec.y, y: edgeVec.x };
        const toOutside = { x: bm.x - center.x, y: bm.y - center.y };
        const dot = normal.x * toOutside.x + normal.y * toOutside.y;
        const sign = dot >= 0 ? 1 : -1;
        const nLen = Math.hypot(normal.x, normal.y) || 1;
        const nx = (normal.x / nLen) * sign;
        const ny = (normal.y / nLen) * sign;
        const rotation = { x: bm.x + nx * rotOffset, y: bm.y + ny * rotOffset };

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
              isGroup: false,
              elementId: selectedIds[0],
            };
          }
        }
      } else {
        const bounds = this.computeSelectionAABBFromIds(selectedIds);
        const tl = { x: bounds.x, y: bounds.y };
        const tr = { x: bounds.x + bounds.width, y: bounds.y };
        const br = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
        const bl = { x: bounds.x, y: bounds.y + bounds.height };
        const tm = { x: bounds.x + bounds.width / 2, y: bounds.y };
        const rm = { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
        const bm = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
        const lm = { x: bounds.x, y: bounds.y + bounds.height / 2 };
        const rotation = { x: bm.x, y: bm.y + rotOffset };
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
            const isGroupSingle =
              selectedIds.length === 1 &&
              !!store.elements[selectedIds[0]] &&
              isGroupElement(store.elements[selectedIds[0]] as Element);
            return {
              type: 'handle',
              handleType: h.handleType,
              isGroup: selectedIds.length > 1 || isGroupSingle,
              elementId: selectedIds.length === 1 ? selectedIds[0] : undefined,
            };
          }
        }
      }
    }
    const element = this.findTopHitElement(worldPoint);
    if (element) return { type: 'element', elementId: element.id };
    if (selectedIds.length > 1) {
      const bounds = this.computeSelectionAABBFromIds(selectedIds);
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
    const state = useCanvasStore.getState();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    ids.forEach((id) => {
      const el = state.elements[id];
      if (el && isGroupElement(el)) {
        const gb = groupComputeGroupBounds(id);
        if (gb) {
          minX = Math.min(minX, gb.x);
          minY = Math.min(minY, gb.y);
          maxX = Math.max(maxX, gb.x + gb.width);
          maxY = Math.max(maxY, gb.y + gb.height);
        }
      } else {
        const bounds = this.geometryService.getElementBoundsWorld(new ElementProvider(id));
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      }
    });
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private computeSelectionAABBFromIds(ids: string[]): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const state = useCanvasStore.getState();
    const expanded: string[] = [];
    ids.forEach((id) => {
      const el = state.elements[id];
      if (el && isGroupElement(el)) {
        getGroupDeepChildren(id).forEach((cid) => expanded.push(cid));
      } else {
        expanded.push(id);
      }
    });
    const providers = expanded.map((id) => new ElementProvider(id));
    const types = expanded.map((id) => state.elements[id]?.type || 'rect');
    return this.geometryService.computeAxisAlignedSelectionBounds(providers, types);
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
    const state = useCanvasStore.getState();
    const elements = Object.values(state.elements);
    const candidates: Array<{ el: Element; z: number; minEdgeDist: number; centerDist: number }> =
      [];
    const hitGroupId = hitTestGroups(worldPoint, elements);
    this.log('hit-scan-start', { world: worldPoint, count: elements.length });
    if (hitGroupId) {
      const gEl = state.elements[hitGroupId];
      if (gEl) {
        const gb = groupComputeGroupBounds(hitGroupId) || {
          x: gEl.x,
          y: gEl.y,
          width: gEl.width,
          height: gEl.height,
        };
        const cx = gb.x + gb.width / 2;
        const cy = gb.y + gb.height / 2;
        const distLeft = worldPoint.x - gb.x;
        const distRight = gb.x + gb.width - worldPoint.x;
        const distTop = worldPoint.y - gb.y;
        const distBottom = gb.y + gb.height - worldPoint.y;
        const minEdgeDist = Math.min(distLeft, distRight, distTop, distBottom);
        const centerDist = Math.hypot(worldPoint.x - cx, worldPoint.y - cy);
        candidates.push({ el: gEl, z: gEl.zIndex, minEdgeDist, centerDist });
      }
    }
    const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);
    for (const el of sorted) {
      if (el.visibility === 'hidden') continue;
      if (hitGroupId && el.id === hitGroupId) continue;
      const aabb = this.computeElementAABB(el);
      const expanded = {
        x: aabb.x - this.selectionTolerance,
        y: aabb.y - this.selectionTolerance,
        width: aabb.width + this.selectionTolerance * 2,
        height: aabb.height + this.selectionTolerance * 2,
      };
      if (!this.isPointInRect(worldPoint, expanded)) continue;
      const ok = this.pointInElement(worldPoint, el);
      if (!ok) continue;
      const cx = aabb.x + aabb.width / 2;
      const cy = aabb.y + aabb.height / 2;
      const distLeft = worldPoint.x - aabb.x;
      const distRight = aabb.x + aabb.width - worldPoint.x;
      const distTop = worldPoint.y - aabb.y;
      const distBottom = aabb.y + aabb.height - worldPoint.y;
      const minEdgeDist = Math.min(distLeft, distRight, distTop, distBottom);
      const centerDist = Math.hypot(worldPoint.x - cx, worldPoint.y - cy);
      candidates.push({ el, z: el.zIndex, minEdgeDist, centerDist });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (b.z !== a.z) return b.z - a.z;
      if (b.minEdgeDist !== a.minEdgeDist) return b.minEdgeDist - a.minEdgeDist;
      return a.centerDist - b.centerDist;
    });
    const top = candidates[0];
    this.log('top-hit', { world: worldPoint, elementId: top.el.id, zIndex: top.z });
    return top.el;
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
