/**
 * 事件桥接层
 * 监听 Pixi 原生事件，转换成统一格式，通过 eventBus 分发到业务层
 * 不做任何业务判断（选中/框选/拖拽/模式判断）
 */

import * as PIXI from 'pixi.js';
import { getPixiApp, onPixiAppInit } from './pixiApp';
import { eventBus } from './eventBus';

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
}

class EventBridge {
  private app: PIXI.Application | null = null;
  private isInitialized = false;

  /**
   * 初始化事件桥接
   * 自动获取 pixiApp 并订阅事件
   */
  init(app?: PIXI.Application): void {
    if (this.isInitialized) {
      return;
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

    // 监听 pointerdown 事件
    stage.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointerdown', event);
    });

    // 监听 pointermove 事件
    stage.on('pointermove', (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointermove', event);
    });

    // 监听 pointerup 事件
    stage.on('pointerup', (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointerup', event);
    });

    // 监听 pointerupoutside 事件
    stage.on('pointerupoutside', (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointerupoutside', event);
    });

    // 监听 wheel 事件
    stage.on('wheel', (event: PIXI.FederatedWheelEvent) => {
      this.handleWheelEvent(event);
    });
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
        ctrl: event.ctrlKey || event.metaKey, // macOS 兼容
        alt: event.altKey,
        meta: event.metaKey,
      },
      nativeEvent: event,
    };

    // 通过 eventBus 分发事件
    eventBus.emit(type, canvasEvent);
  }

  /**
   * 处理滚轮事件
   */
  private handleWheelEvent(event: PIXI.FederatedWheelEvent): void {
    if (!this.app) return;

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
        ctrl: event.ctrlKey || event.metaKey,
        alt: event.altKey,
        meta: event.metaKey,
      },
      nativeEvent: event,
    };

    // 通过 eventBus 分发事件
    eventBus.emit('wheel', canvasEvent);
  }

  /**
   * 销毁事件桥接
   */
  destroy(): void {
    if (this.app) {
      const stage = this.app.stage;
      stage.off('pointerdown');
      stage.off('pointermove');
      stage.off('pointerup');
      stage.off('pointerupoutside');
      stage.off('wheel');
    }
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
