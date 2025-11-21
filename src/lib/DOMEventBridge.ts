/**
 * DOM 事件桥接层
 * 监听 DOM 原生事件（keyboard、clipboard 等），转换成统一格式，通过 eventBus 分发到业务层
 * 不做任何业务判断，保持纯净、可销毁、可单元测试
 */

import { eventBus } from './eventBus';

/**
 * 键盘事件数据格式
 */
export interface KeyboardEventPayload {
  type: 'keyboard:down' | 'keyboard:up';
  key: string;
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  nativeEvent: KeyboardEvent;
  preventDefault: () => void;
  stopPropagation: () => void;
}

/**
 * 剪贴板事件数据格式（预留）
 */
export interface ClipboardEventPayload {
  type: 'clipboard:paste';
  clipboardData: DataTransfer | null;
  nativeEvent: ClipboardEvent;
  preventDefault: () => void;
  stopPropagation: () => void;
}

class DOMEventBridge {
  private isInitialized = false;
  // 保存事件处理函数引用，用于正确清理
  private eventHandlers: {
    keydown?: (event: KeyboardEvent) => void;
    keyup?: (event: KeyboardEvent) => void;
    paste?: (event: ClipboardEvent) => void;
  } = {};

  /**
   * 初始化 DOM 事件桥接
   * 自动监听 window 的 DOM 事件
   */
  init(): void {
    if (this.isInitialized) {
      return;
    }

    this.setupEventListeners();
    this.isInitialized = true;
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 创建并保存事件处理函数引用
    this.eventHandlers.keydown = (event: KeyboardEvent) => {
      this.handleKeyboardEvent('keyboard:down', event);
    };

    this.eventHandlers.keyup = (event: KeyboardEvent) => {
      this.handleKeyboardEvent('keyboard:up', event);
    };

    // 预留：paste 事件处理（现在不需要开发）
    // this.eventHandlers.paste = (event: ClipboardEvent) => {
    //   this.handleClipboardEvent('clipboard:paste', event);
    // };

    // 注册事件监听器到 window
    window.addEventListener('keydown', this.eventHandlers.keydown);
    window.addEventListener('keyup', this.eventHandlers.keyup);
    // 预留：window.addEventListener('paste', this.eventHandlers.paste);
  }

  /**
   * 处理键盘事件
   */
  private handleKeyboardEvent(type: 'keyboard:down' | 'keyboard:up', event: KeyboardEvent): void {
    const keyboardEvent: KeyboardEventPayload = {
      type,
      key: event.key,
      code: event.code,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
      nativeEvent: event,
      preventDefault: () => {
        event.preventDefault();
      },
      stopPropagation: () => {
        event.stopPropagation();
      },
    };

    // 通过 eventBus 分发事件
    eventBus.emit(type, keyboardEvent);
  }

  /**
   * 处理剪贴板事件（预留）
   */
  // private handleClipboardEvent(
  //   type: 'clipboard:paste',
  //   event: ClipboardEvent
  // ): void {
  //   const clipboardEvent: ClipboardEventPayload = {
  //     type,
  //     clipboardData: event.clipboardData,
  //     nativeEvent: event,
  //     preventDefault: () => {
  //       event.preventDefault();
  //     },
  //     stopPropagation: () => {
  //       event.stopPropagation();
  //     },
  //   };
  //
  //   // 通过 eventBus 分发事件
  //   eventBus.emit(type, clipboardEvent);
  // }

  /**
   * 销毁 DOM 事件桥接
   */
  destroy(): void {
    // 使用保存的处理函数引用精确移除监听器
    if (this.eventHandlers.keydown) {
      window.removeEventListener('keydown', this.eventHandlers.keydown);
    }
    if (this.eventHandlers.keyup) {
      window.removeEventListener('keyup', this.eventHandlers.keyup);
    }
    if (this.eventHandlers.paste) {
      window.removeEventListener('paste', this.eventHandlers.paste);
    }

    // 清空事件处理函数引用
    this.eventHandlers = {};
    this.isInitialized = false;
  }
}

// 导出单例实例
export const domEventBridge = new DOMEventBridge();

// 自动初始化：创建后自动调用 init()
domEventBridge.init();
