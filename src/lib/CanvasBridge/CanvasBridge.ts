import type { StoreApi } from 'zustand';
import type { RenderEngine } from '../../renderer/RenderEngine';
import type { Element, ViewportState } from '../../types';
import {
  type AllRenderCommand,
  type CreateElementCommand,
  type UpdateElementCommand,
  type UpdateSelectionCommand,
  RenderPriority,
} from '../../types/render.types';

type ElementsState = Record<string, Element>;
type BridgeStoreState = {
  elements: ElementsState;
  selectedElementIds: string[];
  viewport: ViewportState;
  tool: { tempElement?: Element | null };
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

  // 渲染命令队列：使用 Map 实现命令合并与覆盖
  // key = elementId，value = 最新的命令
  private pendingCommands = new Map<string, AllRenderCommand>();

  // rAF 调度标记：确保同一帧内只执行一次 flush
  private scheduled = false;

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
    // 清空命令队列
    this.pendingCommands.clear();
    this.scheduled = false;
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

    const selectedElementIdsUnsubscribe = this.subscribeToSlice(
      (state) => state.selectedElementIds,
      (next, prev) => this.handleSelectionChange(next, prev),
    );

    const viewportUnsubscribe = this.subscribeToSlice(
      (state) => state.viewport,
      (next) => this.handleViewportChange(next),
    );

    const tempElementUnsubscribe = this.subscribeToSlice(
      (state) => state.tool.tempElement,
      (next, prev) => this.handleTempElementChange(next, prev),
    );

    this.unsubscribes.push(
      elementsUnsubscribe,
      selectedElementIdsUnsubscribe,
      viewportUnsubscribe,
      tempElementUnsubscribe,
    );
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
      this.enqueueCommands(commands);
    }
  }

  /**
   * 处理选中状态的变化
   *
   * @param next - 最新的选中元素ID数组
   * @param prev - 之前的选中元素ID数组
   */
  protected handleSelectionChange(next: string[], prev: string[]): void {
    // 如果选中状态没有变化，直接返回
    if (this.arraysEqual(next, prev)) {
      return;
    }

    // 生成 UPDATE_SELECTION 命令
    const command: UpdateSelectionCommand = {
      type: 'UPDATE_SELECTION',
      selectedElementIds: next,
      priority: RenderPriority.HIGH, // 选中状态变化需要高优先级渲染
    };

    // 直接执行命令，不需要合并（选中状态是独立的）
    this.renderEngine.executeRenderCommand(command);
  }

  /**
   * 比较两个数组是否相等（浅比较）
   *
   * @param a - 第一个数组
   * @param b - 第二个数组
   * @returns 是否相等
   */
  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
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
   * 处理临时元素（预览）变化
   *
   * @param next - 最新的临时元素
   * @param prev - 之前的临时元素
   */
  protected handleTempElementChange(
    next: Element | null | undefined,
    prev: Element | null | undefined,
  ): void {
    // 如果临时元素没有变化，直接返回
    if (Object.is(next, prev)) {
      return;
    }

    if (next) {
      // 有新的临时元素，创建或更新预览
      this.updatePreviewElement(next);
    } else {
      // 临时元素被清除，移除预览
      this.removePreviewElement();
    }
  }

  /**
   * 将渲染命令加入队列并启动调度
   * 实现命令合并与 rAF 节流
   *
   * @param commands - 渲染命令数组
   */
  private enqueueCommands(commands: AllRenderCommand[]): void {
    // 将命令添加到队列，应用合并规则
    for (const command of commands) {
      // 对于没有 elementId 的命令（如 UPDATE_SELECTION、BATCH_*），直接执行
      if (
        command.type === 'UPDATE_SELECTION' ||
        command.type === 'BATCH_DELETE_ELEMENTS' ||
        command.type === 'BATCH_UPDATE_ELEMENTS'
      ) {
        this.renderEngine.executeRenderCommand(command);
        continue;
      }

      this.mergeCommand(command);
    }

    // 启动 rAF 调度
    this.scheduleFlush();
  }

  /**
   * 合并命令到队列
   * 根据专业画布架构实现命令合并规则
   * 注意：此方法只处理有 elementId 的命令（CREATE_ELEMENT、UPDATE_ELEMENT、DELETE_ELEMENT）
   *
   * @param command - 新的渲染命令
   */
  private mergeCommand(command: AllRenderCommand): void {
    // 类型守卫：确保命令有 elementId
    if (
      command.type !== 'CREATE_ELEMENT' &&
      command.type !== 'UPDATE_ELEMENT' &&
      command.type !== 'DELETE_ELEMENT'
    ) {
      console.warn('mergeCommand: 不支持的命令类型', command.type);
      return;
    }

    const elementId = command.elementId;
    const existing = this.pendingCommands.get(elementId);

    // 如果没有已存在的命令，直接添加
    if (!existing) {
      this.pendingCommands.set(elementId, command);
      return;
    }

    // 应用合并规则
    switch (existing.type) {
      case 'UPDATE_ELEMENT': {
        if (command.type === 'UPDATE_ELEMENT') {
          // 规则 (1): UPDATE_ELEMENT → UPDATE_ELEMENT
          // 合并 properties
          const existingUpdate = existing as UpdateElementCommand;
          const newUpdate = command as UpdateElementCommand;
          this.pendingCommands.set(elementId, {
            ...existingUpdate,
            properties: {
              ...existingUpdate.properties,
              ...newUpdate.properties,
            },
          });
        } else if (command.type === 'CREATE_ELEMENT') {
          // 规则 (2): CREATE_ELEMENT → UPDATE_ELEMENT (实际上不应该发生，但处理边界情况)
          // 转换为 CREATE，使用最新的 elementData
          this.pendingCommands.set(elementId, command);
        } else if (command.type === 'DELETE_ELEMENT') {
          // 规则 (4): UPDATE_ELEMENT → DELETE_ELEMENT
          // DELETE 覆盖一切
          this.pendingCommands.set(elementId, command);
        }
        break;
      }

      case 'CREATE_ELEMENT': {
        if (command.type === 'UPDATE_ELEMENT') {
          // 规则 (2): CREATE_ELEMENT → UPDATE_ELEMENT
          // 合并到 CREATE.elementData 内
          const existingCreate = existing as CreateElementCommand;
          const update = command as UpdateElementCommand;
          this.pendingCommands.set(elementId, {
            ...existingCreate,
            elementData: {
              ...existingCreate.elementData,
              ...update.properties,
            } as Element,
          });
        } else if (command.type === 'CREATE_ELEMENT') {
          // CREATE → CREATE：使用最新的 elementData
          this.pendingCommands.set(elementId, command);
        } else if (command.type === 'DELETE_ELEMENT') {
          // 规则 (3): CREATE_ELEMENT → DELETE_ELEMENT
          // 两者抵消，直接删除
          this.pendingCommands.delete(elementId);
        }
        break;
      }

      case 'DELETE_ELEMENT': {
        // 规则 (5): DELETE_ELEMENT 始终优先级最高
        // 如果已有 DELETE，新的命令会被忽略（除非是新的 DELETE，但通常不会发生）
        if (command.type === 'DELETE_ELEMENT') {
          // 如果还是 DELETE，保持 DELETE
          this.pendingCommands.set(elementId, command);
        }
        // 其他类型的命令在已有 DELETE 时被忽略
        break;
      }
    }
  }

  /**
   * 调度 flush 执行（使用 requestAnimationFrame）
   * 确保同一帧内只执行一次
   */
  private scheduleFlush(): void {
    if (this.scheduled) {
      return;
    }

    this.scheduled = true;
    requestAnimationFrame(() => {
      this.flush();
      this.scheduled = false;
    });
  }

  /**
   * 批处理执行队列中的所有命令
   * 清空队列并调用 RenderEngine 的批处理接口
   *
   * 当前实现：使用现有的 executeRenderCommand 接口模拟批处理
   * 未来优化：当 RenderEngine 提供 batchExecute 接口后，可直接调用以提升性能
   */
  private async flush(): Promise<void> {
    if (this.pendingCommands.size === 0) {
      return;
    }

    // 将队列转换为数组
    const commands = Array.from(this.pendingCommands.values());

    // 清空队列
    this.pendingCommands.clear();

    // 按优先级和类型排序：DELETE > CREATE > UPDATE
    // 确保命令执行顺序正确
    const sortedCommands = [...commands].sort((a, b) => {
      // 优先级高的先执行
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 同优先级时，DELETE > CREATE > UPDATE
      const typeOrder = { DELETE_ELEMENT: 0, CREATE_ELEMENT: 1, UPDATE_ELEMENT: 2 };
      return (
        typeOrder[a.type as keyof typeof typeOrder] - typeOrder[b.type as keyof typeof typeOrder]
      );
    });

    // 当前实现：使用现有接口逐个执行（模拟批处理）
    // TODO: 未来当 RenderEngine 提供 batchExecute 接口后，替换为：
    // await this.renderEngine.batchExecute(sortedCommands);
    for (const command of sortedCommands) {
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

  /**
   * 更新预览元素
   *
   * @param element - 临时元素
   */
  private async updatePreviewElement(element: Element): Promise<void> {
    await this.renderEngine.updatePreviewElement(element);
  }

  /**
   * 移除预览元素
   */
  private removePreviewElement(): void {
    this.renderEngine.removePreviewElement();
  }
}
