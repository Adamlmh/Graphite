/**
 * Canvas 事件订阅 Hook
 * 封装 eventBus 的订阅和清理逻辑，提供给业务层使用
 * 自动在组件挂载时订阅，卸载时取消订阅
 */

import { useEffect, useRef } from 'react';
import { eventBus } from '../lib/eventBus';
import type { CanvasEvent } from '../lib/EventBridge';
import type { KeyboardEventPayload } from '../lib/DOMEventBridge';

/**
 * 基础事件订阅 Hook
 * @param eventType 事件类型，例如 "pointerdown"、"pointermove"、"keyboard:down"、"clipboard:paste" 等
 * @param handler 事件回调函数
 */
export function useCanvasEvent<T = unknown>(eventType: string, handler: (evt: T) => void): void {
  // 使用 useRef 保存最新的 handler，避免 handler 变化导致重复订阅
  const handlerRef = useRef(handler);

  // 保持 handler 引用最新
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  // 订阅和清理逻辑
  useEffect(() => {
    // 创建稳定的包装函数，内部调用最新的 handler
    const wrappedHandler = (...args: unknown[]) => {
      // eventBus 可能传递多个参数，但通常第一个参数是事件数据
      handlerRef.current(args[0] as T);
    };

    // 订阅事件
    eventBus.on(eventType, wrappedHandler);

    // 清理函数：组件卸载时取消订阅
    return () => {
      eventBus.off(eventType, wrappedHandler);
    };
  }, [eventType]);
}

/**
 * 指针事件订阅 Hook
 * 用于订阅 pointerdown、pointermove、pointerup、pointerupoutside 等指针事件
 * @param type 指针事件类型
 * @param handler 事件回调函数
 */
export function usePointerEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerupoutside',
  handler: (evt: CanvasEvent) => void,
): void {
  useCanvasEvent<CanvasEvent>(type, handler);
}

/**
 * 键盘事件订阅 Hook
 * 用于订阅 keyboard:down、keyboard:up 等键盘事件
 * @param type 键盘事件类型
 * @param handler 事件回调函数
 */
export function useKeyboardEvent(
  type: 'keyboard:down' | 'keyboard:up',
  handler: (evt: KeyboardEventPayload) => void,
): void {
  useCanvasEvent<KeyboardEventPayload>(type, handler);
}

/**
 * 滚轮事件订阅 Hook
 * 用于订阅 wheel 事件
 * @param handler 事件回调函数
 */
export function useWheelEvent(handler: (evt: CanvasEvent) => void): void {
  useCanvasEvent<CanvasEvent>('wheel', handler);
}
