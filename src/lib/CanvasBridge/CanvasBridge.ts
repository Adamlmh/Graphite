import type { StoreApi } from 'zustand';
import type { Element, ViewportState } from '../../types';
import type { RenderEngine } from '../../renderer/RenderEngine';
import { type AllRenderCommand, RenderPriority } from '../../types/render.types';

type ElementsState = Record<string, Element>;
type BridgeStoreState = {
  elements: ElementsState;
  viewport: ViewportState;
};

// todo 未来可以考虑使用 subscribeWithSelector 来优化订阅
type StoreWithSelector = Pick<StoreApi<BridgeStoreState>, 'getState' | 'subscribe'>;

/**
 * CanvasBridge 负责把 Zustand 状态的“大类”变化同步到渲染层
 * 这里不写任何业务逻辑，只是做状态到渲染接口的转发
 *
 * @param store - 状态存储
 * @param renderEngine - 渲染引擎
 */
export class CanvasBridge {
  private unsubscribes: Array<() => void> = [];
  private isRunning = false;
  private readonly store: StoreWithSelector;
  private readonly renderEngine: RenderEngine;

  constructor(store: StoreWithSelector, renderEngine: RenderEngine) {
    this.store = store;
    this.renderEngine = renderEngine;
  }

  /**
   * 启动桥接：订阅 store 并开始转发变化。
   */
  start(): void {
    if (this.isRunning) return;

    this.subscribeToStore();
    this.isRunning = true;
  }

  /**
   * 停止桥接：解除所有订阅，防止内存泄漏。
   */
  stop(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
    this.unsubscribes = [];
    this.isRunning = false;
  }

  /**
   * 针对元素、视口等大类注册订阅。
   * 暂不做 raf/diff，仅监听引用变化。
   */
  private subscribeToStore(): void {
    const elementsUnsubscribe = this.subscribeToSlice(
      (state) => state.elements,
      (next, prev) => this.handleElementsChange(next, prev),
    );

    const viewportUnsubscribe = this.subscribeToSlice(
      (state) => state.viewport,
      (next) => this.handleViewportChange(next),
    );

    this.unsubscribes.push(elementsUnsubscribe, viewportUnsubscribe);
  }

  /**
   * 订阅 store 中的特定状态切片
   *
   * @param selector - 选择器函数，用于从 store 中获取特定状态切片
   * @param handler - 处理函数，用于处理状态切片的变化
   * @returns 取消订阅函数
   */
  private subscribeToSlice<Slice>(
    selector: (state: BridgeStoreState) => Slice,
    handler: (next: Slice, prev: Slice) => void,
  ): () => void {
    let previousSlice = selector(this.store.getState());

    return this.store.subscribe((state) => {
      const nextSlice = selector(state);
      if (Object.is(nextSlice, previousSlice)) {
        return;
      }

      const lastSlice = previousSlice;
      previousSlice = nextSlice;
      handler(nextSlice, lastSlice);
    });
  }

  /**
   * 处理元素集合的变化
   *
   * @param next - 最新的状态切片
   * @param prev - 之前的状态切片
   *
   * 元素集合发生变化。当前阶段直接把快照交给渲染层。
   * 未来可以在这里插入 diff / patch / 批处理 等高级能力。
   */
  protected handleElementsChange(next: ElementsState, prev: ElementsState): void {
    const commands: AllRenderCommand[] = [];

    // 处理删除
    Object.keys(prev).forEach((elementId) => {
      if (!next[elementId]) {
        commands.push({
          type: 'DELETE_ELEMENT',
          elementId,
          priority: RenderPriority.NORMAL,
        });
      }
    });

    // 处理新增与更新
    Object.values(next).forEach((nextElement) => {
      const prevElement = prev[nextElement.id];
      if (!prevElement) {
        commands.push({
          type: 'CREATE_ELEMENT',
          elementId: nextElement.id,
          elementType: nextElement.type,
          elementData: nextElement,
          priority: RenderPriority.NORMAL,
        });
        return;
      }

      const properties = this.diffElement(prevElement, nextElement);
      if (properties) {
        commands.push({
          type: 'UPDATE_ELEMENT',
          elementId: nextElement.id,
          properties,
          priority: RenderPriority.NORMAL,
        });
      }
    });

    if (commands.length > 0) {
      void this.dispatchCommands(commands);
    }
  }

  /**
   * 处理视口状态的变化
   *
   * @param next - 最新的视口状态
   */
  protected handleViewportChange(next: ViewportState): void {
    void next; // 视口的渲染联动后续接入，目前仅监听变化以便未来扩展
  }

  /**
   * 派发渲染命令
   *
   * @param commands - 渲染命令
   */
  private async dispatchCommands(commands: AllRenderCommand[]): Promise<void> {
    for (const command of commands) {
      await this.renderEngine.executeRenderCommand(command);
    }
  }

  /**
   * 比较两个元素
   *
   * @param prevElement - 之前的元素
   * @param nextElement - 最新的元素
   * @returns 差异属性
   */
  private diffElement(prevElement: Element, nextElement: Element): Partial<Element> | null {
    const patch = this.diffRecord(
      prevElement as unknown as Record<string, unknown>,
      nextElement as unknown as Record<string, unknown>,
    );
    return patch && Object.keys(patch).length > 0 ? (patch as Partial<Element>) : null;
  }

  /**
   * 比较两个记录
   *
   * @param prevValue - 之前的记录
   * @param nextValue - 最新的记录
   * @returns 差异属性
   */
  private diffRecord(
    prevValue: Record<string, unknown>,
    nextValue: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const patch: Record<string, unknown> = {};

    Object.keys(nextValue).forEach((key) => {
      const nextEntry = nextValue[key];
      const prevEntry = prevValue[key];

      if (this.isPlainObject(nextEntry) && this.isPlainObject(prevEntry)) {
        const nestedPatch = this.diffRecord(
          prevEntry as Record<string, unknown>,
          nextEntry as Record<string, unknown>,
        );
        if (nestedPatch && Object.keys(nestedPatch).length > 0) {
          patch[key] = nestedPatch;
        }
        return;
      }

      if (!Object.is(prevEntry, nextEntry)) {
        patch[key] = nextEntry;
      }
    });

    return Object.keys(patch).length > 0 ? patch : null;
  }

  /**
   * 判断是否是普通对象
   *
   * @param value - 值
   * @returns 是否是普通对象
   */
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.prototype.toString.call(value) === '[object Object]'
    );
  }
}
