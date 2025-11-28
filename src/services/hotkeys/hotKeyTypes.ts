// src/interaction/hotkeys/hotKeyTypes.ts
import type * as PIXI from 'pixi.js';
export type Context = string; // e.g. 'global', 'canvas', 'textInput', 'modal'
export type HotKeyType = 'keyboard' | 'wheel';
//描述一个快捷键的结构（key、context、handler等）
export interface HotKeyDescriptor {
  id: string; // 唯一 id，用于 unregister / 覆盖
  key: string | string[]; // e.g. 'Ctrl+Z', 'Meta+Shift+S', 'ArrowUp', 'Delete'
  context?: Context; // 默认为 'global'
  allowInInput?: boolean; // 是否在输入框中也触发
  description?: string;
  handler: (payload: HotKeyTriggerPayload) => void;
  priority?: number; // 当冲突时用来决定优先级（数值越大优先级越高）
  // 是否允许被用户绑定覆盖（用于保护系统关键命令）
  userAssignable?: boolean;
}

export interface HotKeyTriggerPayload {
  native: KeyboardEvent | WheelEvent | PIXI.FederatedWheelEvent | PIXI.FederatedPointerEvent;
  normalized: string; // 规范化的键名
  context: Context;
  isWheel?: boolean;
  wheelDelta?: number; // wheel 才有
  modifiers: { ctrl: boolean; meta: boolean; shift: boolean; alt: boolean };
  repeat: boolean;
}
