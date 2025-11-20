import { useEffect } from 'react';
import CanvasRenderer from './components/canvas/CanvasRenderer';
import { eventBus } from './lib/eventBus';
import type { CanvasEvent } from './lib/EventBridge';
import type { KeyboardEventPayload } from './lib/DOMEventBridge';
import './lib/DOMEventBridge';
import * as PIXI from 'pixi.js';
import './App.css';

function App() {
  /**
   * 监听画布事件
   */
  useEffect(() => {
    // 验证 eventBus 是否正常工作 - 最小功能测试
    console.log('开始监听画布事件...');

    // 监听 pointerdown 事件
    const handlePointerDown = (...args: unknown[]) => {
      const event = args[0] as CanvasEvent;
      console.log('pointerdown 事件接收成功:', {
        type: event.type,
        screen: event.screen,
        world: event.world,
        buttons: event.buttons,
      });
    };

    // 监听 pointerup 事件
    const handlePointerUp = (...args: unknown[]) => {
      const event = args[0] as CanvasEvent;
      console.log('pointerup 事件接收成功:', {
        type: event.type,
        screen: event.screen,
        world: event.world,
      });
    };

    // 监听 pointermove 事件（节流输出，避免刷屏）
    let moveCount = 0;
    const handlePointerMove = (...args: unknown[]) => {
      const event = args[0] as CanvasEvent;
      moveCount++;
      // 每 30 次移动输出一次，避免控制台刷屏
      if (moveCount % 30 === 0) {
        console.log('pointermove 事件接收成功 (已接收 ' + moveCount + ' 次):', {
          type: event.type,
          world: event.world,
        });
      }
    };

    // 监听 wheel 事件
    const handleWheel = (...args: unknown[]) => {
      const event = args[0] as CanvasEvent;
      const wheelEvent = event.nativeEvent as PIXI.FederatedWheelEvent;
      console.log('wheel 事件接收成功:', {
        type: event.type,
        deltaX: wheelEvent.deltaX,
        deltaY: wheelEvent.deltaY,
        world: event.world,
      });
    };

    // 订阅事件
    eventBus.on('pointerdown', handlePointerDown);
    eventBus.on('pointerup', handlePointerUp);
    eventBus.on('pointermove', handlePointerMove);
    eventBus.on('wheel', handleWheel);

    console.log('事件监听器已注册');

    // 清理函数：组件卸载时取消订阅
    return () => {
      eventBus.off('pointerdown', handlePointerDown);
      eventBus.off('pointerup', handlePointerUp);
      eventBus.off('pointermove', handlePointerMove);
      eventBus.off('wheel', handleWheel);
      console.log('事件监听器已清理');
    };
  }, []);

  /**
   * 监听 DOM 事件（键盘事件）
   */
  useEffect(() => {
    console.log('🔍 开始监听 DOM 事件（键盘）...');

    // 监听 keyboard:down 事件
    const handleKeyDown = (...args: unknown[]) => {
      const event = args[0] as KeyboardEventPayload;
      console.log('✅ keyboard:down 事件接收成功:', {
        type: event.type,
        key: event.key,
        code: event.code,
        ctrl: event.ctrl,
        shift: event.shift,
        alt: event.alt,
        meta: event.meta,
      });
    };

    // 监听 keyboard:up 事件
    const handleKeyUp = (...args: unknown[]) => {
      const event = args[0] as KeyboardEventPayload;
      console.log('✅ keyboard:up 事件接收成功:', {
        type: event.type,
        key: event.key,
        code: event.code,
      });
    };

    // 订阅 DOM 事件
    eventBus.on('keyboard:down', handleKeyDown);
    eventBus.on('keyboard:up', handleKeyUp);

    console.log('✅ DOM 事件监听器已注册');

    // 清理函数：组件卸载时取消订阅
    return () => {
      eventBus.off('keyboard:down', handleKeyDown);
      eventBus.off('keyboard:up', handleKeyUp);
      console.log('🧹 DOM 事件监听器已清理');
    };
  }, []);

  return (
    <div className="app-container">
      <CanvasRenderer />
    </div>
  );
}

export default App;
