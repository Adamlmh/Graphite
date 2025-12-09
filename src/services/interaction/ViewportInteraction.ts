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
  private unsubscribe?: () => void; // store订阅清理函数
  private eventHandlers: {
    wheel?: (event: WheelEvent) => void;
    pointerdown?: (event: PointerEvent) => void;
    pointerup?: (event: PointerEvent) => void;
    pointermove?: (event: PointerEvent) => void;
    pointerenter?: (event: PointerEvent) => void;
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
    this.setupToolListener();
    this.updateCursor(); // 初始化光标
    this.isInitialized = true;
  }

  /**
   * 销毁视口交互
   */
  destroy(): void {
    this.removeEventListeners();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.container.style.cursor = ''; // 恢复默认光标
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

    this.eventHandlers.pointerenter = (event: PointerEvent) => {
      // 鼠标进入画布时更新光标
      this.updateCursor();
    };

    // 注册到容器
    this.container.addEventListener('wheel', this.eventHandlers.wheel, { passive: false });
    this.container.addEventListener('pointerdown', this.eventHandlers.pointerdown);
    this.container.addEventListener('pointerup', this.eventHandlers.pointerup);
    this.container.addEventListener('pointermove', this.eventHandlers.pointermove);
    this.container.addEventListener('pointerenter', this.eventHandlers.pointerenter);
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
    if (this.eventHandlers.pointerenter) {
      this.container.removeEventListener('pointerenter', this.eventHandlers.pointerenter);
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
    const store = useCanvasStore.getState();
    const activeTool = store.tool.activeTool;

    // 中键始终可以拖拽画布
    const isMiddleButton = event.button === 1;
    // 左键 + hand工具也可以拖拽画布
    const isLeftButtonWithHandTool = event.button === 0 && activeTool === 'hand';

    if (!isMiddleButton && !isLeftButtonWithHandTool) return;

    event.preventDefault();
    event.stopPropagation();

    this.isDragging = true;
    this.lastPointerPos = { x: event.clientX, y: event.clientY };
    this.panVelocity = { x: 0, y: 0 };
    this.lastTime = performance.now();
    this.stopInertia();

    // 设置拖拽光标
    this.container.style.cursor = 'grabbing';
  }

  /**
   * 处理指针释放
   */
  private handlePointerUp(event: PointerEvent): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.startInertia();

    // 恢复光标样式
    this.updateCursor();
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

  /**
   * 更新光标样式
   */
  private updateCursor(): void {
    // 检查容器是否有 important 光标样式（表示被 SelectInteraction 锁定）
    const cursorValue = this.container.style.getPropertyValue('cursor');
    const cursorPriority = this.container.style.getPropertyPriority('cursor');
    if (cursorPriority === 'important') {
      // 光标已被锁定，不要修改
      return;
    }

    const store = useCanvasStore.getState();
    const activeTool = store.tool.activeTool;

    // 只处理 hand 工具的光标样式
    if (activeTool === 'hand') {
      this.container.style.cursor = this.isDragging ? 'grabbing' : 'grab';
    }
    // 其他工具的光标由 useCursor hook 统一管理，不在此处干预
  }

  /**
   * 监听工具切换，更新光标样式
   */
  setupToolListener(): void {
    // 订阅store变化
    this.unsubscribe = useCanvasStore.subscribe((state) => {
      this.updateCursor();
    });
  }
}
