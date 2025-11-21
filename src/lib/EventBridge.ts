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
  preventDefault: () => void;
  stopPropagation: () => void;
}

class EventBridge {
  private app: PIXI.Application | null = null;
  private isInitialized = false;
  // 保存事件处理函数引用，用于正确清理
  private eventHandlers: {
    pointerdown?: (event: PIXI.FederatedPointerEvent) => void;
    pointermove?: (event: PIXI.FederatedPointerEvent) => void;
    pointerup?: (event: PIXI.FederatedPointerEvent) => void;
    pointerupoutside?: (event: PIXI.FederatedPointerEvent) => void;
    wheel?: (event: PIXI.FederatedWheelEvent) => void;
  } = {};

  /**
   * 初始化事件桥接
   * 自动获取 pixiApp 并订阅事件
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

    // 创建并保存事件处理函数引用
    this.eventHandlers.pointerdown = (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointerdown', event);
    };
    this.eventHandlers.pointermove = (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointermove', event);
    };
    this.eventHandlers.pointerup = (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointerup', event);
    };
    this.eventHandlers.pointerupoutside = (event: PIXI.FederatedPointerEvent) => {
      this.handlePointerEvent('pointerupoutside', event);
    };
    this.eventHandlers.wheel = (event: PIXI.FederatedWheelEvent) => {
      this.handleWheelEvent(event);
    };

    // 注册事件监听器
    stage.on('pointerdown', this.eventHandlers.pointerdown);
    stage.on('pointermove', this.eventHandlers.pointermove);
    stage.on('pointerup', this.eventHandlers.pointerup);
    stage.on('pointerupoutside', this.eventHandlers.pointerupoutside);
    stage.on('wheel', this.eventHandlers.wheel);
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
      preventDefault: () => {
        event.preventDefault();
      },
      stopPropagation: () => {
        event.stopPropagation();
      },
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
      preventDefault: () => {
        event.preventDefault();
      },
      stopPropagation: () => {
        event.stopPropagation();
      },
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
