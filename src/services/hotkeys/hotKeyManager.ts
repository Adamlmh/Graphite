import { eventBus } from '../../lib/eventBus';
import type { KeyboardEventPayload } from '../../lib/DOMEventBridge';
// import type { CanvasEvent } from '../../lib/EventBridge';
import type { HotKeyDescriptor, HotKeyTriggerPayload, Context } from './hotKeyTypes';
import { DEFAULT_HOTKEYS, loadUserOverrides, saveUserOverrides } from './hotKeyConfig';

/**
 * HotKeyManager 单例
 *
 * 功能：
 * - 注册 / 注销快捷键（支持 context）
 * - 启用 / 禁用 整体或某个 context
 * - 监听 eventBus 发来的 keyboard:down（由 DOMEventBridge 触发）
 * - 标准化键位（跨系统Win、macOS兼容）
 * - 冲突检测（同一 context 下默认禁止重复键位注册）
 * - 支持用户覆盖（从 localStorage 加载覆盖表）
 */
class HotKeyManager {
  //快捷键系统所必须的“内核数据结构”
  private static _instance: HotKeyManager | null = null;
  private regs: Map<string, HotKeyDescriptor> = new Map(); // id -> descriptor
  private index: Map<string, string> = new Map(); // normalizedKey|context -> id,实现 O(1) 的键位查找
  private enabledContexts: Set<Context> = new Set(['global']); // 用于切换模式时激活/禁用对应快捷键
  private enabled = true; //快捷键系统开关,可以一次性全局禁用快捷键
  private userOverrides: Record<string, string> | null = null; //用户自定义快捷键（从 localStorage 读出）

  private constructor() {
    this.userOverrides = loadUserOverrides(); //加载用户定义的快捷键
    this.setupDefaults(); //配置默认快捷键
    eventBus.on('keyboard:down', this.onKeyDown as (payload: unknown) => void); // 订阅键盘事件，总线来自 DOMEventBridge
    // eventBus.on('wheel', this.onWheel);
  }

  static get instance() {
    if (!this._instance) this._instance = new HotKeyManager();
    return this._instance;
  }

  dispose() {
    eventBus.off('keyboard:down', this.onKeyDown as (payload: unknown) => void);
    // eventBus.off('wheel', this.onWheel);
    this.regs.clear();
    this.index.clear();
    HotKeyManager._instance = null;
  }

  // ---- 公共 API ----
  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }

  enableContext(ctx: Context) {
    this.enabledContexts.add(ctx);
  }
  disableContext(ctx: Context) {
    this.enabledContexts.delete(ctx);
  }

  /**
   * 注册快捷键
   * @param desc 完整 descriptor，若 conflict 且 !override 返回 false
   * @param override 若为 true，允许覆盖原有绑定
   */
  // register(desc: HotKeyDescriptor, override = false): boolean {
  //   const normalized = HotKeyManager.normalizeKeyString(desc.key);
  //   const ctx = desc.context || 'global';
  //   const idxKey = HotKeyManager.indexKey(normalized, ctx);

  //   // 冲突检测（同 context）
  //   const existingId = this.index.get(idxKey);
  //   if (existingId && existingId !== desc.id && !override) {
  //     console.warn(`[HotKeyManager] conflict: ${desc.key} in ${ctx} already used by ${existingId}`);
  //     return false;
  //   }

  //   // 存储
  //   this.regs.set(desc.id, { ...desc, key: normalized });
  //   this.index.set(idxKey, desc.id);
  //   return true;
  // }

  // 注册多个键位：key: string | string[]
  register(desc: HotKeyDescriptor, override = false): boolean {
    const keys = Array.isArray(desc.key) ? desc.key : [desc.key];
    const ctx = desc.context || 'global';

    for (const k of keys) {
      const normalized = HotKeyManager.normalizeKeyString(k);
      const idxKey = HotKeyManager.indexKey(normalized, ctx);

      const existing = this.index.get(idxKey);
      if (existing && existing !== desc.id && !override) {
        console.warn(`HotKeyManager conflict: ${normalized} already bound to ${existing}`);
        return false;
      }
    }

    this.regs.set(desc.id, desc);

    // 逐个键写入 index
    for (const k of keys) {
      const normalized = HotKeyManager.normalizeKeyString(k);
      const ctx = desc.context ?? 'global';
      this.index.set(HotKeyManager.indexKey(normalized, ctx), desc.id);
    }
    return true;
  }

  unregister(id: string) {
    const desc = this.regs.get(id);
    if (!desc) return;

    const keys = Array.isArray(desc.key) ? desc.key : [desc.key];
    const ctx = desc.context || 'global';

    for (const k of keys) {
      const normalized = HotKeyManager.normalizeKeyString(k);
      this.index.delete(HotKeyManager.indexKey(normalized, ctx));
    }
    this.regs.delete(id);
  }

  /**
   * 列出某 context 下的绑定（用于 UI 显示 / 冲突排查）
   */
  list(context?: Context) {
    const out: HotKeyDescriptor[] = [];
    for (const d of this.regs.values()) {
      if (!context || (d.context || 'global') === context) out.push(d);
    }
    return out;
  }

  /**
   * 覆盖用户自定义绑定并保存
   * overrides: { [id] : keyString }
   */
  applyUserOverridesAndSave(overrides: Record<string, string>) {
    // 清理 index 中用户 assignable 的项
    for (const [id, desc] of this.regs.entries()) {
      if (desc.userAssignable) {
        this.unregister(id);
      }
    }

    // apply default descriptors + user overrides map
    // find corresponding default by id in DEFAULT_HOTKEYS
    for (const base of DEFAULT_HOTKEYS) {
      const id = base.id;
      const keyToUse = overrides[id] || base.key;
      const desc: HotKeyDescriptor = {
        id,
        key: keyToUse,
        context: base.context,
        description: base.description,
        handler: () => {
          /* placeholder: real handler should be registered by caller */
        },
        userAssignable: base.userAssignable,
      };
      this.register(desc, true);
    }

    // persist
    saveUserOverrides(overrides);
    this.userOverrides = overrides;
  }

  // ---- 内部逻辑 ----
  // private setupDefaults() {
  //   // 注册默认快捷键（handler 为空占位，真实 handler 应由上层注册）
  //   for (const base of DEFAULT_HOTKEYS) {
  //     const desc: HotKeyDescriptor = {
  //       id: base.id,
  //       key: this.userOverrides?.[base.id] || base.key,
  //       context: base.context,
  //       description: base.description,
  //       handler: () => {
  //         /* NO-OP placeholder; user must set handler later */
  //       },
  //       userAssignable: base.userAssignable,
  //     };
  //     this.register(desc, true);
  //   }
  // }
  // ============ 默认加载 ============
  private setupDefaults() {
    for (const base of DEFAULT_HOTKEYS) {
      const keys = Array.isArray(base.key) ? base.key : [base.key];
      const useKeys = keys.map((k) => this.userOverrides?.[base.id] || k);

      const desc: HotKeyDescriptor = {
        id: base.id,
        key: useKeys,
        context: base.context,
        description: base.description,
        handler: () => {},
        userAssignable: base.userAssignable,
      };

      this.register(desc, true);
    }
  }

  /**
   * 外部可以用这个方法为某个已存在 id 设置 handler（通常在 app 初始化时由命令系统注入）
   */
  setHandler(id: string, handler: HotKeyDescriptor['handler']) {
    const desc = this.regs.get(id);
    if (!desc) {
      console.warn('[HotKeyManager] setHandler: unknown id', id);
      return false;
    }
    desc.handler = handler;
    this.regs.set(id, desc);
    return true;
  }

  // 处理 incoming keyboard 消息（由 DOMEventBridge 发上来的 eventBus 事件）
  private onKeyDown = (evtPayload: KeyboardEventPayload) => {
    if (!this.enabled) return;

    // evtPayload shape is KeyboardEventPayload from DOMEventBridge
    const native: KeyboardEvent = evtPayload.nativeEvent || evtPayload;
    const normalized = HotKeyManager.normalizeFromKeyboardEvent(native);
    const ctxCandidates = this.getActiveContextsOrder(); // ordered contexts to try

    // build trigger payload
    const payload: HotKeyTriggerPayload = {
      native,
      normalized,
      context: 'global',
      modifiers: {
        ctrl: native.ctrlKey,
        meta: native.metaKey,
        shift: native.shiftKey,
        alt: native.altKey,
      },
      repeat: native.repeat ?? false,
    };

    // if focussing input element and handler disallows input, skip those
    const isInput = HotKeyManager.isTypingTarget(native);

    for (const ctx of ctxCandidates) {
      payload.context = ctx;
      const idxKey = HotKeyManager.indexKey(normalized, ctx);
      const id = this.index.get(idxKey);
      if (!id) continue;
      const desc = this.regs.get(id);
      if (!desc) continue;
      if (isInput && !desc.allowInInput) {
        // skip
        continue;
      }
      // execute
      try {
        desc.handler(payload);
        // prevent default to avoid browser handling (e.g. Ctrl+S)
        if (native && typeof native.preventDefault === 'function') native.preventDefault();
      } catch (err) {
        console.error('[HotKeyManager] handler error', err);
      }
      // by design：触发第一个匹配的（可配置为继续传播，但目前停止）
      return;
    }
  };

  // active contexts order: top-of-stack first (we only have set so we'll prefer 'global' last)
  private getActiveContextsOrder(): Context[] {
    // simple heuristic: active contexts except 'global' first, then 'global'
    const arr = Array.from(this.enabledContexts);
    // ensure 'global' is last
    const filtered = arr.filter((c) => c !== 'global');
    if (this.enabledContexts.has('global')) filtered.push('global');
    return filtered;
  }

  // 鼠标滚轮事件
  // ========== 滚轮（wheel）事件 ==========
  // private onWheel = (evt: any) => {
  //   if (!this.enabled) return;

  //   const e: WheelEvent = evt.nativeEvent || evt;
  //   const ctxList = this.getActiveContextsOrder();

  //   // “Ctrl 或 Meta + 滚轮”才触发快捷键
  //   if (!e.shiftKey && !e.metaKey) return;

  //   const normalized =
  //     e.deltaY < 0 ? 'WheelUp' : 'WheelDown';

  //   for (const ctx of ctxList) {
  //     const idxKey = HotKeyManager.indexKey(normalized, ctx);
  //     const id = this.index.get(idxKey);
  //     if (!id) continue;

  //     const desc = this.regs.get(id);
  //     if (!desc) continue;

  //     const payload: HotKeyTriggerPayload = {
  //       native: e,
  //       normalized,
  //       context: ctx,
  //       isWheel: true,
  //       wheelDelta: e.deltaY,
  //       modifiers: {
  //         ctrl: e.ctrlKey,
  //         meta: e.metaKey,
  //         shift: e.shiftKey,
  //         alt: e.altKey,
  //       },
  //       repeat: false,
  //     };

  //     desc.handler(payload);
  //     e.preventDefault();
  //     return;
  //   }
  // };

  // ---- 静态工具方法 ----

  // 规范化字符串键，例如 "ctrl+shift+Z" -> "Ctrl+Shift+Z"
  static normalizeKeyString(k: string) {
    // split by + and normalize tokens
    const tokens = k
      .split('+')
      .map((t) => t.trim())
      .filter(Boolean);
    const parts: string[] = [];
    const modOrder = ['Ctrl', 'Meta', 'Alt', 'Shift']; // 固定顺序（Meta 表示 mac 的 Command）
    const normalizedMods = new Set<string>();
    let keyPart = '';
    for (const t of tokens) {
      const up = t.toLowerCase();
      if (up === 'ctrl' || up === 'control') normalizedMods.add('Ctrl');
      else if (up === 'meta' || up === 'cmd' || up === 'command' || up === '⌘')
        normalizedMods.add('Meta');
      else if (up === 'alt' || up === 'option' || up === 'opt') normalizedMods.add('Alt');
      else if (up === 'shift') normalizedMods.add('Shift');
      else {
        // normalize common synonyms
        if (up === '=') keyPart = '=';
        else if (up === '+') keyPart = '+';
        else keyPart = t.length === 1 ? t.toUpperCase() : HotKeyManager.capitalize(t);
      }
    }
    for (const m of modOrder) {
      if (normalizedMods.has(m)) parts.push(m);
    }
    if (!keyPart && tokens.length > 0) {
      // maybe last token was something like ArrowLeft
      const last = tokens[tokens.length - 1];
      keyPart = HotKeyManager.capitalize(last);
    }
    if (keyPart) parts.push(keyPart);
    return parts.join('+');
  }

  static indexKey(normalizedKey: string, context: Context) {
    return `${context}::${normalizedKey}`;
  }

  // 从原生 KeyboardEvent 生成规范化字符串（考虑 Win/Mac）
  static normalizeFromKeyboardEvent(e: KeyboardEvent) {
    // Normalize: prefer Meta on mac, Ctrl on windows (but we'll represent both if present)
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Meta');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    // key handling: convert e.key to something stable
    let k = e.key;

    // Normalize special keys
    if (k === ' ') k = 'Space';
    if (k === 'ArrowLeft') k = 'ArrowLeft';
    // For platform differences: on mac, cmd often used in place of ctrl; we keep both flags above

    // unify single letter to upper
    if (k.length === 1) k = k.toUpperCase();

    // e.key may be 'Unidentified' in some cases; fallback to code
    if (!k || k === 'Unidentified') {
      k = e.code || '';
    }

    parts.push(k);
    return parts.join('+');
  }

  static capitalize(s: string) {
    if (!s) return s;
    if (s.length === 1) return s.toUpperCase();
    return s[0].toUpperCase() + s.slice(1);
  }

  static isTypingTarget(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    const tag = (target.tagName || '').toLowerCase();
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      (target.getAttribute && target.getAttribute('contenteditable') === 'true')
    )
      return true;
    // also check role attr?
    return false;
  }
}

// export singleton
export const hotKeyManager = HotKeyManager.instance;
