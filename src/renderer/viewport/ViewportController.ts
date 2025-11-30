import * as PIXI from 'pixi.js';
import type { Point, ViewportState } from '../../types';
import { RenderPriority } from '../../types/render.types';

/**
 * 管理无限画布的视口与相机：统一处理缩放、平移、边界约束、惯性与坐标转换。
 * - 相机容器(camera)承载所有内容图层；stage仅承载UI（滚动条等）。
 * - 视口(ViewportState)作为单一真源，任何交互通过此控制器更新并回调给RenderEngine。
 */
export class ViewportController {
  private app: PIXI.Application;
  private camera: PIXI.Container;
  private container: HTMLElement;
  private viewport!: ViewportState;
  private minZoom = 0.1;
  private maxZoom = 6;
  /**
   * 工作区padding因子：相对于当前视口尺寸的扩展比例。
   * 目的：在缩小时视口大于内容的场景，仍保留合理滚动空间与滚动条指示。
   */
  private paddingFactor = 0.25;
  private isDragging = false;
  private lastPointerPos: Point = { x: 0, y: 0 };
  private panVelocity: Point = { x: 0, y: 0 };
  private lastTime = 0;
  private inertiaActive = false;
  onViewportChange?: (vp: ViewportState, priority: RenderPriority) => void;

  constructor(app: PIXI.Application, camera: PIXI.Container, container: HTMLElement) {
    this.app = app;
    this.camera = camera;
    this.container = container;
  }

  setZoomLimits(min: number, max: number): void {
    this.minZoom = min;
    this.maxZoom = max;
  }

  setViewport(vp: ViewportState, priority: RenderPriority = RenderPriority.NORMAL): void {
    const zoom = Math.max(this.minZoom, Math.min(this.maxZoom, vp.zoom));
    const next: ViewportState = { ...vp, zoom };
    this.viewport = next;
    this.camera.scale.set(next.zoom, next.zoom);
    this.camera.position.set(-next.offset.x * next.zoom, -next.offset.y * next.zoom);
    this.onViewportChange?.(this.viewport, priority);
  }

  applyZoomAround(screenPoint: Point, factor: number): void {
    const old = this.viewport || this.defaultViewport();
    let nz = old.zoom * factor;
    nz = Math.max(this.minZoom, Math.min(this.maxZoom, nz));
    const worldPoint = this.screenToWorld(screenPoint);
    const newPosX = screenPoint.x - worldPoint.x * nz;
    const newPosY = screenPoint.y - worldPoint.y * nz;
    const newOffset = { x: -newPosX / nz, y: -newPosY / nz };
    const next = { ...old, zoom: nz, offset: newOffset } as ViewportState;
    this.setViewport(next, RenderPriority.HIGH);
  }

  panBy(dx: number, dy: number, priority: RenderPriority = RenderPriority.NORMAL): void {
    const z = this.viewport?.zoom ?? 1;
    const pos = this.camera.position;
    this.camera.position.set(pos.x + dx, pos.y + dy);
    const newOffset = { x: -this.camera.position.x / z, y: -this.camera.position.y / z };
    const next = {
      ...(this.viewport || this.defaultViewport()),
      offset: newOffset,
    } as ViewportState;
    this.viewport = next;
    this.onViewportChange?.(this.viewport, priority);
  }

  enforceBounds(animated = true): void {
    const vp = this.viewport || this.defaultViewport();
    const z = vp.zoom;
    const cw = this.app.renderer.width;
    const ch = this.app.renderer.height;
    const vw = cw / z;
    const vh = ch / z;
    // 使用工作区bounds进行约束，以适配无限画布在缩小时的滚动预期
    const wb = this.getWorkingBounds(vp);
    const minX = wb.x;
    const maxX = wb.x + Math.max(0, wb.width - vw);
    const minY = wb.y;
    const maxY = wb.y + Math.max(0, wb.height - vh);
    const clamped = {
      x: Math.max(minX, Math.min(maxX, vp.offset.x)),
      y: Math.max(minY, Math.min(maxY, vp.offset.y)),
    };
    if (animated) {
      // 缓动回弹：逐帧趋近目标位置，确保体验平滑
      const target = new PIXI.Point(-clamped.x * z, -clamped.y * z);
      let frames = 0;
      const step = () => {
        frames++;
        this.camera.position.set(
          this.camera.position.x + (target.x - this.camera.position.x) * 0.2,
          this.camera.position.y + (target.y - this.camera.position.y) * 0.2,
        );
        const newOffset = { x: -this.camera.position.x / z, y: -this.camera.position.y / z };
        this.viewport = { ...vp, offset: newOffset } as ViewportState;
        this.onViewportChange?.(this.viewport, RenderPriority.HIGH);
        const dx = Math.abs(target.x - this.camera.position.x);
        const dy = Math.abs(target.y - this.camera.position.y);
        if (dx + dy < 0.5 || frames > 60) {
          this.app.ticker.remove(step);
        }
      };
      this.app.ticker.add(step);
    } else {
      this.setViewport({ ...vp, offset: clamped } as ViewportState, RenderPriority.HIGH);
    }
  }

  /**
   * 计算“工作区”bounds：为滚动条与边界约束提供更合理的参考范围。
   * - 工作区 = 内容边界 与 当前视口矩形 的并集，再按视口尺寸比例进行padding扩展。
   * - 这样在缩小时（视口远大于内容）仍保留滚动空间与滚动条可操作性。
   */
  getWorkingBounds(vp?: ViewportState): { x: number; y: number; width: number; height: number } {
    const state = vp || this.viewport || this.defaultViewport();
    const z = state.zoom;
    const cw = this.app.renderer.width;
    const ch = this.app.renderer.height;
    const vw = cw / z;
    const vh = ch / z;
    const cb = state.contentBounds;
    const viewRect = { x: state.offset.x, y: state.offset.y, width: vw, height: vh };
    const minX = Math.min(cb.x, viewRect.x);
    const minY = Math.min(cb.y, viewRect.y);
    const maxX = Math.max(cb.x + cb.width, viewRect.x + viewRect.width);
    const maxY = Math.max(cb.y + cb.height, viewRect.y + viewRect.height);
    const paddingX = vw * this.paddingFactor;
    const paddingY = vh * this.paddingFactor;
    return {
      x: minX - paddingX,
      y: minY - paddingY,
      width: maxX - minX + paddingX * 2,
      height: maxY - minY + paddingY * 2,
    };
  }

  bindInteractions(): void {
    // 交互逻辑已移至 ViewportInteraction 服务
    // 此方法保留以保持接口兼容性，但不再绑定事件
  }

  private stopInertia(): void {
    if (!this.inertiaActive) return;
    this.inertiaActive = false;
    const step = (this as Record<string, unknown>)._inertiaStep as () => void;
    if (step) this.app.ticker.remove(step);
    (this as Record<string, unknown>)._inertiaStep = null;
  }

  screenToWorld(p: Point): Point {
    const m = this.camera.worldTransform;
    const inv = m.clone().invert();
    const res = inv.apply(new PIXI.Point(p.x, p.y));
    return { x: res.x, y: res.y };
  }

  worldToScreen(p: Point): Point {
    const m = this.camera.worldTransform;
    const res = m.apply(new PIXI.Point(p.x, p.y));
    return { x: res.x, y: res.y };
  }

  private defaultViewport(): ViewportState {
    return {
      zoom: 1,
      offset: { x: 0, y: 0 },
      canvasSize: { width: this.container.clientWidth, height: this.container.clientHeight },
      contentBounds: {
        x: 0,
        y: 0,
        width: this.container.clientWidth,
        height: this.container.clientHeight,
      },
      snapping: {
        enabled: false,
        guidelines: [],
        threshold: 4,
        showGuidelines: false,
        snapToElements: false,
        snapToCanvas: false,
      },
    };
  }
}
