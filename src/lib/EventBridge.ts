/**
 * 事件桥接层
 * 监听 Pixi 原生事件，转换成统一格式，通过 eventBus 分发到业务层
 * 不做任何业务判断（选中/框选/拖拽/模式判断）
 */

import * as PIXI from 'pixi.js';
import { getPixiApp, onPixiAppInit } from './pixiApp';
import { eventBus } from './eventBus';
import { useCanvasStore } from '../stores/canvas-store';
import { GeometryService } from '../lib/Coordinate/GeometryService';
import { ElementProvider } from '../lib/Coordinate/providers/ElementProvider';
import type { Point } from '../types';

/**
 * 统一的事件数据格式
 */
export interface CanvasEvent {
  type: string;
  /** 屏幕坐标（相对于画布） */
  screen: { x: number; y: number };
  /** 世界坐标（考虑缩放和平移） */
  world: { x: number; y: number };
  /** 鼠标按钮状态 */
  buttons: number;
  /** 修饰键状态 */
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
  };
  /** 原始 Pixi 事件 */
  nativeEvent: PIXI.FederatedPointerEvent | PIXI.FederatedWheelEvent;
  /** wheel 事件的累积 delta 值（可选，仅 wheel 事件有） */
  deltaX?: number;
  deltaY?: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

class EventBridge {
  private app: PIXI.Application | null = null;
  private isInitialized = false;
  private geometryService: GeometryService;
  // 保存事件处理函数引用，用于正确清理
  /**
   * @param pointerdown 鼠标按下事件
   * @param pointermove 鼠标移动事件
   * @param pointerup 鼠标抬起事件
   * @param pointerupoutside 鼠标抬起事件（超出边界）
   * @param wheel 滚轮事件
   */
  private eventHandlers: {
    pointerdown?: (event: PIXI.FederatedPointerEvent) => void;
    pointermove?: (event: PIXI.FederatedPointerEvent) => void;
    pointerup?: (event: PIXI.FederatedPointerEvent) => void;
    pointerupoutside?: (event: PIXI.FederatedPointerEvent) => void;
    wheel?: (event: PIXI.FederatedWheelEvent) => void;
    domWheel?: (event: WheelEvent) => void;
  } = {};
  // pointermove 节流相关状态
  private pendingPointerMoveEvent: PIXI.FederatedPointerEvent | null = null;
  private pointerMoveRafId: number | null = null;
  // wheel 时间节流 + delta 合流相关状态
  private wheelState = {
    deltaX: 0,
    deltaY: 0,
    event: null as PIXI.FederatedWheelEvent | null,
    rafId: null as number | null,
    lastFlushTime: 0,
  };
  private readonly WHEEL_THROTTLE_MS = 16; // 时间节流窗口：16ms

  constructor() {
    this.geometryService = new GeometryService();
  }

  /**
   * 初始化事件桥接
   * 自动获取 pixiApp 并订阅事件
   *
   * @param app Pixi 应用实例
   */
  init(app?: PIXI.Application): void {
    // 如果已经初始化且 app 相同，跳过
    if (this.isInitialized && this.app === (app || getPixiApp())) {
      return;
    }

    // 如果已经初始化但 app 不同，先销毁旧的
    if (this.isInitialized) {
      this.destroy();
    }

    // 使用传入的 app 或尝试获取 pixiApp
    this.app = app || getPixiApp();
    if (!this.app) {
      return;
    }

    this.setupEventListeners();
    this.isInitialized = true;
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.app) return;

    const stage = this.app.stage;
    const view = this.app.view as HTMLCanvasElement | undefined;

    // 创建并保存事件处理函数引用
    this.eventHandlers.pointerdown = (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointerdown', event);
    };
    this.eventHandlers.pointermove = (event: PIXI.FederatedPointerEvent) => {
      this.throttledPointerMove(event);
    };
    this.eventHandlers.pointerup = (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointerup', event);
    };
    this.eventHandlers.pointerupoutside = (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointerupoutside', event);
    };
    this.eventHandlers.wheel = (event: PIXI.FederatedWheelEvent) => {
      this.throttledWheel(event);
    };

    // 注册事件监听器
    stage.on('pointerdown', this.eventHandlers.pointerdown);
    stage.on('pointermove', this.eventHandlers.pointermove);
    stage.on('pointerup', this.eventHandlers.pointerup);
    stage.on('pointerupoutside', this.eventHandlers.pointerupoutside);
    stage.on('wheel', this.eventHandlers.wheel);

    // DOM 层阻止 Ctrl + 滚轮触发浏览器缩放
    if (view) {
      this.eventHandlers.domWheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
        }
      };
      view.addEventListener('wheel', this.eventHandlers.domWheel, { passive: false });
    }
  }

  /**
   * 节流处理 pointermove 事件
   * 使用 requestAnimationFrame 确保每帧只发出一次事件
   *
   * @param event 鼠标移动事件
   */
  private throttledPointerMove(event: PIXI.FederatedPointerEvent): void {
    // 缓存最新的 pointermove 事件
    this.pendingPointerMoveEvent = event;

    // 如果已经有待执行的 rAF，直接返回（保证一帧只注册一次）
    if (this.pointerMoveRafId !== null) {
      return;
    }

    // 注册下一帧的回调
    this.pointerMoveRafId = requestAnimationFrame(() => {
      // 提取缓存的事件
      const pendingEvent = this.pendingPointerMoveEvent;

      // 清空状态
      this.pendingPointerMoveEvent = null;
      this.pointerMoveRafId = null;

      // 如果有待处理的事件，调用原有的处理逻辑
      if (pendingEvent) {
        this.handlePointerEvent('pointermove', pendingEvent);
      }
    });
  }

  /**
   * 节流处理 wheel 事件
   * 使用时间节流 + delta 合流，在 16ms 窗口内合并多次 wheel 事件
   */
  private throttledWheel(event: PIXI.FederatedWheelEvent): void {
    const now = performance.now();

    // 累加 delta 值
    this.wheelState.deltaX += event.deltaX;
    this.wheelState.deltaY += event.deltaY;

    // 保存最后一次事件（用于取坐标、修饰键等）
    this.wheelState.event = event;

    // 如果这是本轮合流的第一条 wheel，初始化时间
    if (this.wheelState.lastFlushTime === 0) {
      this.wheelState.lastFlushTime = now;
    }

    // 计算距离上次分发的时间
    const timeSinceLastFlush = now - this.wheelState.lastFlushTime;

    // 如果已经超过 16ms，立即分发
    if (timeSinceLastFlush >= this.WHEEL_THROTTLE_MS) {
      this.flushWheel();
    } else {
      // 如果还在 16ms 窗口内，且没有待执行的定时器，则设置定时器
      if (this.wheelState.rafId === null) {
        const remainingTime = this.WHEEL_THROTTLE_MS - timeSinceLastFlush;
        this.wheelState.rafId = window.setTimeout(() => {
          this.wheelState.rafId = null;
          this.flushWheel();
        }, remainingTime);
      }
      // 如果已有定时器，什么都不做，等待定时器触发
    }
  }

  /**
   * 分发累积的 wheel 事件
   */
  private flushWheel(): void {
    // 如果没有待处理的事件，直接返回
    if (!this.wheelState.event) {
      return;
    }

    const event = this.wheelState.event;
    const deltaX = this.wheelState.deltaX;
    const deltaY = this.wheelState.deltaY;

    // 构造 CanvasEvent
    const canvasEvent: CanvasEvent = {
      type: 'wheel',
      screen: {
        x: event.screen.x,
        y: event.screen.y,
      },
      world: {
        x: event.global.x,
        y: event.global.y,
      },
      buttons: event.buttons,
      modifiers: {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey,
      },
      nativeEvent: event,
      // 附加合并后的 delta 值
      deltaX,
      deltaY,
      preventDefault: () => {
        event.preventDefault();
      },
      stopPropagation: () => {
        event.stopPropagation();
      },
    };

    // 通过 eventBus 分发事件
    eventBus.emit('wheel', canvasEvent);

    // 重置状态
    this.wheelState.deltaX = 0;
    this.wheelState.deltaY = 0;
    this.wheelState.event = null;
    this.wheelState.lastFlushTime = performance.now();
  }

  /**
   * 处理指针事件
   */
  private handlePointerEvent(type: string, event: PIXI.FederatedPointerEvent): void {
    if (!this.app) return;

    const canvasEvent: CanvasEvent = {
      type,
      screen: {
        x: event.screen.x,
        y: event.screen.y,
      },
      world: {
        x: event.global.x,
        y: event.global.y,
      },
      buttons: event.buttons,
      modifiers: {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey,
      },
      nativeEvent: event,
      preventDefault: () => {
        event.preventDefault();
      },
      stopPropagation: () => {
        event.stopPropagation();
      },
    };

    // 如果是点击事件，进行命中判断并更新选中状态
    if (type === 'pointerdown') {
      this.handleHitTest(canvasEvent);
    }

    // 通过 eventBus 分发事件
    eventBus.emit(type, canvasEvent);
  }

  /**
   * 处理命中检测和选中状态更新
   */
  private handleHitTest(event: CanvasEvent): void {
    // 检查当前工具是否为选择工具
    const store = useCanvasStore.getState();
    const activeTool = store.tool.activeTool;

    // 只在选择工具时进行命中检测
    if (activeTool !== 'select') {
      return;
    }

    const worldPoint: Point = {
      x: event.world.x,
      y: event.world.y,
    };

    console.log('[EventBridge] 命中检测，点击位置:', worldPoint);

    // 查找命中的元素
    const hitElementId = this.findHitElement(worldPoint);

    console.log(
      '[EventBridge] 命中检测结果:',
      hitElementId ? `命中元素: ${hitElementId}` : '未命中任何元素',
    );

    if (hitElementId) {
      // 命中元素，更新选中状态
      const store = useCanvasStore.getState();
      const currentSelectedIds = store.selectedElementIds;

      if (event.modifiers.shift || event.modifiers.ctrl || event.modifiers.meta) {
        // 按住 Shift/Ctrl/Cmd，添加到选中列表（如果已选中则取消选中）
        const isAlreadySelected = currentSelectedIds.includes(hitElementId);
        if (isAlreadySelected) {
          // 取消选中
          const newSelectedIds = currentSelectedIds.filter((id) => id !== hitElementId);
          store.setSelectedElements(newSelectedIds);
          console.log('[EventBridge] 取消选中，新的选中列表:', newSelectedIds);
        } else {
          // 添加到选中列表
          store.setSelectedElements([...currentSelectedIds, hitElementId]);
          console.log('[EventBridge] 添加到选中列表，新的选中列表:', [
            ...currentSelectedIds,
            hitElementId,
          ]);
        }
      } else {
        // 没有修饰键，替换选中（只选中当前元素）
        store.setSelectedElements([hitElementId]);
        console.log('[EventBridge] 替换选中，新的选中列表:', [hitElementId]);
      }
    } else {
      // 未命中任何元素，清空选中
      useCanvasStore.getState().clearSelection();
      console.log('[EventBridge] 清空选中');
    }
  }

  /**
   * 查找点击位置命中的元素
   * 从 zIndex 高的元素开始检查（后渲染的元素在上层）
   *
   * @param worldPoint 世界坐标点
   * @returns 命中的元素ID，如果没有命中则返回 null
   */
  private findHitElement(worldPoint: Point): string | null {
    const store = useCanvasStore.getState();
    // 直接使用 Object.values(store.elements) 而不是 store.elementList
    // 因为 elementList 是 getter，可能在某些情况下返回错误的状态
    const elements = Object.values(store.elements);
    const elementsRecord = store.elements;

    console.log('[EventBridge] Store 中的元素数量:', elements.length);
    console.log('[EventBridge] Store.elements 对象:', elementsRecord);
    console.log('[EventBridge] 直接获取的元素列表:', elements);
    console.log(
      '[EventBridge] Store 中的元素列表:',
      elements.map((el) => ({
        id: el.id,
        type: el.type,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
      })),
    );

    // 按 zIndex 从高到低排序，后渲染的元素优先命中
    const sortedElements = [...elements].sort((a, b) => {
      // zIndex 高的优先，如果相同则按创建时间（后创建的优先）
      if (a.zIndex !== b.zIndex) {
        return b.zIndex - a.zIndex;
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    // 遍历元素，查找第一个命中的
    for (const element of sortedElements) {
      // 跳过不可见的元素
      if (element.visibility !== 'visible') {
        console.log(`[EventBridge] 跳过不可见元素: ${element.id}`);
        continue;
      }

      // 创建元素提供者
      const elementProvider = new ElementProvider(element.id);

      // 判断点是否在元素内部
      const isHit = this.geometryService.isPointInElement(worldPoint, elementProvider);
      console.log(`[EventBridge] 检测元素 ${element.id}:`, {
        elementBounds: { x: element.x, y: element.y, width: element.width, height: element.height },
        worldPoint,
        isHit,
      });

      if (isHit) {
        return element.id;
      }
    }

    return null;
  }

  /**
   * 销毁事件桥接
   */
  destroy(): void {
    // 取消待执行的 rAF
    if (this.pointerMoveRafId !== null) {
      cancelAnimationFrame(this.pointerMoveRafId);
      this.pointerMoveRafId = null;
    }

    // 取消待执行的 wheel 定时器
    if (this.wheelState.rafId !== null) {
      clearTimeout(this.wheelState.rafId);
      this.wheelState.rafId = null;
    }

    // 清空待处理的事件
    this.pendingPointerMoveEvent = null;
    this.wheelState = {
      deltaX: 0,
      deltaY: 0,
      event: null,
      rafId: null,
      lastFlushTime: 0,
    };

    if (this.app) {
      const stage = this.app.stage;
      // 使用保存的处理函数引用精确移除监听器
      if (this.eventHandlers.pointerdown) {
        stage.off('pointerdown', this.eventHandlers.pointerdown);
      }
      if (this.eventHandlers.pointermove) {
        stage.off('pointermove', this.eventHandlers.pointermove);
      }
      if (this.eventHandlers.pointerup) {
        stage.off('pointerup', this.eventHandlers.pointerup);
      }
      if (this.eventHandlers.pointerupoutside) {
        stage.off('pointerupoutside', this.eventHandlers.pointerupoutside);
      }
      if (this.eventHandlers.wheel) {
        stage.off('wheel', this.eventHandlers.wheel);
      }
      if (this.eventHandlers.domWheel) {
        const view = this.app.view as HTMLCanvasElement | undefined;
        if (view) {
          view.removeEventListener('wheel', this.eventHandlers.domWheel);
        }
      }
    }
    // 清空事件处理函数引用
    this.eventHandlers = {};
    this.app = null;
    this.isInitialized = false;
  }
}

// 导出单例实例
export const eventBridge = new EventBridge();

// 自动初始化：当 pixiApp 可用时自动初始化 EventBridge
onPixiAppInit((app) => {
  eventBridge.init(app);
});
