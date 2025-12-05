// services/interaction/ViewportInteraction.ts
import { useCanvasStore } from '../../stores/canvas-store';
import type { Point, ViewportState } from '../../types';

/**
 * 视口交互管理器
 * 负责处理视口相关的用户交互（缩放、平移），通过事件总线和状态管理器更新视口状态
 */
export class ViewportInteraction {
  private isInitialized = false;
  private container: HTMLElement;
  private isDragging = false;
  private lastPointerPos: Point = { x: 0, y: 0 };
  private panVelocity: Point = { x: 0, y: 0 };
  private lastTime = 0;
  private inertiaActive = false;
  private eventHandlers: {
    wheel?: (event: WheelEvent) => void;
    pointerdown?: (event: PointerEvent) => void;
    pointerup?: (event: PointerEvent) => void;
    pointermove?: (event: PointerEvent) => void;
  } = {};

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * 初始化视口交互
   */
  init(): void {
    if (this.isInitialized) return;

    this.setupEventListeners();
    this.isInitialized = true;
  }

  /**
   * 销毁视口交互
   */
  destroy(): void {
    this.removeEventListeners();
    this.isInitialized = false;
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 滚轮缩放
    this.eventHandlers.wheel = (event: WheelEvent) => {
      this.handleWheel(event);
    };

    // 指针事件用于平移
    this.eventHandlers.pointerdown = (event: PointerEvent) => {
      this.handlePointerDown(event);
    };

    this.eventHandlers.pointerup = (event: PointerEvent) => {
      this.handlePointerUp(event);
    };

    this.eventHandlers.pointermove = (event: PointerEvent) => {
      this.handlePointerMove(event);
    };

    // 注册到容器
    this.container.addEventListener('wheel', this.eventHandlers.wheel, { passive: false });
    this.container.addEventListener('pointerdown', this.eventHandlers.pointerdown);
    this.container.addEventListener('pointerup', this.eventHandlers.pointerup);
    this.container.addEventListener('pointermove', this.eventHandlers.pointermove);
  }

  /**
   * 移除事件监听器
   */
  private removeEventListeners(): void {
    if (this.eventHandlers.wheel) {
      this.container.removeEventListener('wheel', this.eventHandlers.wheel);
    }
    if (this.eventHandlers.pointerdown) {
      this.container.removeEventListener('pointerdown', this.eventHandlers.pointerdown);
    }
    if (this.eventHandlers.pointerup) {
      this.container.removeEventListener('pointerup', this.eventHandlers.pointerup);
    }
    if (this.eventHandlers.pointermove) {
      this.container.removeEventListener('pointermove', this.eventHandlers.pointermove);
    }
    this.eventHandlers = {};
  }

  /**
   * 处理滚轮事件
   */
  private handleWheel(event: WheelEvent): void {
    const rect = this.container.getBoundingClientRect();
    const cursor: Point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    if (event.ctrlKey || event.metaKey) {
      // 缩放
      event.preventDefault();
      this.handleZoom(cursor, event.deltaY < 0 ? 1.1 : 0.9);
    } else {
      // 平移
      this.handlePan(-event.deltaX, -event.deltaY);
    }
  }

  /**
   * 处理指针按下
   */
  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 1) return; // 只处理中键

    this.isDragging = true;
    this.lastPointerPos = { x: event.clientX, y: event.clientY };
    this.panVelocity = { x: 0, y: 0 };
    this.lastTime = performance.now();
    this.stopInertia();
  }

  /**
   * 处理指针释放
   */
  private handlePointerUp(event: PointerEvent): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.startInertia();
  }

  /**
   * 处理指针移动
   */
  private handlePointerMove(event: PointerEvent): void {
    if (!this.isDragging) return;

    const now = performance.now();
    const dt = Math.max(1, now - this.lastTime);
    const dx = event.clientX - this.lastPointerPos.x;
    const dy = event.clientY - this.lastPointerPos.y;

    this.lastPointerPos = { x: event.clientX, y: event.clientY };
    this.handlePan(dx, dy);
    this.panVelocity = { x: dx / dt, y: dy / dt };
    this.lastTime = now;
  }

  /**
   * 处理缩放
   */
  private handleZoom(screenPoint: Point, factor: number): void {
    const store = useCanvasStore.getState();
    const currentViewport = store.viewport;

    // 计算新的缩放级别
    let newZoom = currentViewport.zoom * factor;
    newZoom = Math.max(0.1, Math.min(6, newZoom)); // 限制缩放范围

    // 计算新的偏移量，以鼠标位置为中心缩放
    const worldPoint = this.screenToWorld(screenPoint, currentViewport);
    const newOffsetX = screenPoint.x - worldPoint.x * newZoom;
    const newOffsetY = screenPoint.y - worldPoint.y * newZoom;
    const newOffset = { x: -newOffsetX / newZoom, y: -newOffsetY / newZoom };

    // 更新视口状态
    store.setViewport({
      zoom: newZoom,
      offset: newOffset,
    });
  }

  /**
   * 处理平移
   */
  private handlePan(dx: number, dy: number): void {
    const store = useCanvasStore.getState();
    const currentViewport = store.viewport;
    const zoom = currentViewport.zoom;

    // 添加速度限制因子，使移动稍微慢一点
    const speedFactor = 0.5;
    const adjustedDx = dx * speedFactor;
    const adjustedDy = dy * speedFactor;

    // 计算世界坐标系中的偏移
    const worldDx = adjustedDx / zoom;
    const worldDy = adjustedDy / zoom;

    const newOffset = {
      x: currentViewport.offset.x - worldDx,
      y: currentViewport.offset.y - worldDy,
    };

    store.setViewport({
      offset: newOffset,
    });
  }

  /**
   * 屏幕坐标转世界坐标
   */
  private screenToWorld(screenPoint: Point, viewport: ViewportState): Point {
    const zoom = viewport.zoom;
    const offset = viewport.offset;

    return {
      x: screenPoint.x / zoom + offset.x,
      y: screenPoint.y / zoom + offset.y,
    };
  }

  /**
   * 启动惯性滚动
   */
  private startInertia(): void {
    if (this.inertiaActive) return;
    this.inertiaActive = true;

    const step = () => {
      const speedX = this.panVelocity.x * 16 * 0.6; // 同样应用速度限制
      const speedY = this.panVelocity.y * 16 * 0.6;

      if (Math.abs(speedX) + Math.abs(speedY) < 0.001) {
        this.stopInertia();
        return;
      }

      this.handlePan(speedX, speedY);
      this.panVelocity = {
        x: this.panVelocity.x * 0.9,
        y: this.panVelocity.y * 0.9,
      };

      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }

  /**
   * 停止惯性滚动
   */
  private stopInertia(): void {
    this.inertiaActive = false;
  }
}
