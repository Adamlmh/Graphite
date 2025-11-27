import type { StoreApi } from 'zustand';
import type { Element, ViewportState } from '../../types';

interface IRenderLayer {
  /**
   * 创建元素。后续 diff/patch 完成后，Bridge 将调用该方法创建渲染实例。
   */
  createElement: (element: Element) => void;

  /**
   * 更新已有元素。changes 为增量数据，当前阶段可以直接传完整元素对象。
   */
  updateElement: (id: string, changes: Partial<Element>) => void;

  /**
   * 删除元素，对应渲染实例的销毁。
   */
  deleteElement: (id: string) => void;

  /**
   * 更新视口参数（缩放、偏移等）。
   */
  updateViewport: (viewport: ViewportState) => void;

  /**
   * 当前阶段 Bridge 不做 diff，直接把 next/prev 快照交给渲染层
   * 渲染层可以自行决定如何消费；未来会被 create/update/delete 替代
   */
  syncElementsSnapshot?: (payload: {
    next: Record<string, Element>;
    prev: Record<string, Element>;
  }) => void;
}

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
 */
export class CanvasBridge {
  private unsubscribes: Array<() => void> = [];
  private isRunning = false;
  private readonly store: StoreWithSelector;
  private readonly renderLayer: IRenderLayer;

  constructor(store: StoreWithSelector, renderLayer: IRenderLayer) {
    this.store = store;
    this.renderLayer = renderLayer;
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
    if (this.renderLayer.syncElementsSnapshot) {
      this.renderLayer.syncElementsSnapshot({ next, prev });
      return;
    }

    // fallback：没有 snapshot 能力时，直接把最新元素逐个 update。
    Object.values(next).forEach((element) => {
      this.renderLayer.updateElement(element.id, element);
    });
  }

  /**
   * 处理视口状态的变化
   *
   * @param next - 最新的视口状态
   */
  protected handleViewportChange(next: ViewportState): void {
    this.renderLayer.updateViewport(next);
  }
}
