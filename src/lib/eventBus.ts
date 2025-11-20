/**
 * 轻量事件总线
 * 提供 on/off/emit API，不做任何事件转换或业务逻辑
 */

type EventHandler = (...args: unknown[]) => void;

class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  /**
   * 订阅事件
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /**
   * 取消订阅事件
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param args 事件参数
   */
  emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        handler(...args);
      });
    }
  }

  /**
   * 清除所有事件监听器
   */
  clear(): void {
    this.listeners.clear();
  }
}

// 导出单例实例
export const eventBus = new EventBus();
