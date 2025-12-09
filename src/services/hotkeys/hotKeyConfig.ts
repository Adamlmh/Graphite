// src/interaction/hotkeys/hotKeyConfig.ts
import type { HotKeyDescriptor } from './hotKeyTypes';

const STORAGE_KEY = 'app.hotkeys.userOverrides_v1';

export const DEFAULT_HOTKEYS: Omit<HotKeyDescriptor, 'handler'>[] = [
  {
    id: 'undo',
    key: ['Ctrl+Z', 'Meta+Z'],
    context: 'global',
    description: '撤销',
    userAssignable: true,
  },
  {
    id: 'redo',
    key: ['Ctrl+Y', 'Meta+Shift+Z'],
    context: 'global',
    description: '重做',
    userAssignable: true,
  },
  {
    id: 'copy',
    key: ['Ctrl+C', 'Meta+C'],
    context: 'global',
    description: '复制',
    userAssignable: true,
  },
  {
    id: 'paste',
    key: ['Ctrl+V', 'Meta+V'],
    context: 'global',
    description: '粘贴',
    userAssignable: true,
  },
  {
    id: 'cut',
    key: ['Ctrl+X', 'Meta+X'],
    context: 'global',
    description: '剪切',
    userAssignable: true,
  },
  {
    id: 'save',
    key: ['Ctrl+S', 'Meta+S'],
    context: 'global',
    description: '保存',
    userAssignable: true,
  },
  {
    id: 'delete',
    key: ['Delete', 'Backspace'],
    context: 'global',
    description: '删除',
    userAssignable: true,
  },
  {
    id: 'selectAll',
    key: ['Ctrl+A', 'Meta+A'],
    context: 'global',
    description: '全选',
    userAssignable: true,
  },

  {
    id: 'zoomIn',
    key: ['Ctrl+=', 'Meta+='],
    context: 'canvas',
    description: '放大',
    userAssignable: true,
  },
  {
    id: 'zoomOut',
    key: ['Ctrl+-', 'Meta+-'],
    context: 'canvas',
    description: '缩小',
    userAssignable: true,
  },

  // ctrl + wheel（不能用户覆盖）
  {
    id: 'zoomInWheel',
    key: 'WheelUp',
    context: 'canvas',
    description: '滚轮放大',
    userAssignable: false,
  },
  {
    id: 'zoomOutWheel',
    key: 'WheelDown',
    context: 'canvas',
    description: '滚轮缩小',
    userAssignable: false,
  },

  {
    id: 'panToggle',
    key: ['Space'],
    context: 'canvas',
    description: '平移画布切换',
    userAssignable: true,
  },

  {
    id: 'nudgeLeft',
    key: 'ArrowLeft',
    context: 'canvas',
    description: '左移微移',
    userAssignable: true,
  },
  {
    id: 'nudgeRight',
    key: 'ArrowRight',
    context: 'canvas',
    description: '右移微移',
    userAssignable: true,
  },
  {
    id: 'nudgeUp',
    key: 'ArrowUp',
    context: 'canvas',
    description: '上移微移',
    userAssignable: true,
  },
  {
    id: 'nudgeDown',
    key: 'ArrowDown',
    context: 'canvas',
    description: '下移微移',
    userAssignable: true,
  },

  {
    id: 'fastNudgeLeft',
    key: 'Shift+ArrowLeft',
    context: 'canvas',
    description: '快速左移',
    userAssignable: true,
  },
  {
    id: 'fastNudgeRight',
    key: 'Shift+ArrowRight',
    context: 'canvas',
    description: '快速右移',
    userAssignable: true,
  },
  {
    id: 'fastNudgeUp',
    key: 'Shift+ArrowUp',
    context: 'canvas',
    description: '快速上移',
    userAssignable: true,
  },
  {
    id: 'fastNudgeDown',
    key: 'Shift+ArrowDown',
    context: 'canvas',
    description: '快速下移',
    userAssignable: true,
  },

  {
    id: 'duplicate',
    key: ['Ctrl+D', 'Meta+D'],
    context: 'canvas',
    description: '复制元素',
    userAssignable: true,
  },
  {
    id: 'clone',
    key: ['Ctrl+Shift+D', 'Meta+Shift+D'],
    context: 'canvas',
    description: '克隆元素',
    userAssignable: true,
  },

  { id: 'selectTool', key: 'V', context: 'global', description: '选择工具', userAssignable: true },
  {
    id: 'boxSelectTool',
    key: 'M',
    context: 'global',
    description: '框选工具',
    userAssignable: true,
  },
  {
    id: 'group',
    key: ['Ctrl+G', 'Meta+G'],
    context: 'global',
    description: '打组',
    userAssignable: true,
  },
  {
    id: 'ungroup',
    key: ['Ctrl+Shift+G', 'Meta+Shift+G'],
    context: 'global',
    description: '解组',
    userAssignable: true,
  },
];

//用户自定义快捷键的持久化接口
export function loadUserOverrides(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('hotkey: load overrides failed', err);
    return null;
  }
}

export function saveUserOverrides(overrides: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (err) {
    console.warn('hotkey: save overrides failed', err);
  }
}
