// src/services/debug/testCanvasEvents.ts
import { eventBus } from '../../lib/eventBus';
import type { CanvasEvent } from '../../lib/EventBridge';

console.log('%c[CanvasEventTest] 测试监听器已启用', 'color: #4CAF50; font-weight: bold;');

// 点击（pointerdown）
eventBus.on('pointerdown', (evt: unknown) => {
  const e = evt as CanvasEvent;
  console.log(
    '%c[pointerdown]',
    'color: #2196F3; font-size:14px;',
    'screen=',
    e.screen,
    'world=',
    e.world,
    'buttons=',
    e.buttons,
    'mods=',
    e.modifiers,
  );
});

// 松开（pointerup）
eventBus.on('pointerup', (evt: unknown) => {
  const e = evt as CanvasEvent;
  console.log('%c[pointerup]', 'color: #03A9F4;', e);
});

// 滚轮（wheel）
eventBus.on('wheel', (evt: unknown) => {
  const e = evt as CanvasEvent;
  console.log(
    '%c[wheel]',
    'color: #FF5722; font-size:14px;',
    'deltaY=',
    (e.nativeEvent as WheelEvent)?.deltaY,
    'screen=',
    e.screen,
    'ctrl=',
    e.modifiers.ctrl,
    'shift=',
    e.modifiers.shift,
  );
});

// 移动（pointermove）— 可选，怕你日志太多
eventBus.on('pointermove', (evt: unknown) => {
  const e = evt as CanvasEvent;
  // throttle logs
  console.log('[pointermove]', e.screen);
});
