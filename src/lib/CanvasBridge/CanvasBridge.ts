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
   *
   * 注意：如果启动时 store 中已有元素（如页面刷新后恢复的数据），
   * 需要主动触发一次渲染。这是因为：
   * 1. 订阅初始化时，previousElements 会被设置为当前状态
   * 2. 如果此时恢复已完成，previousElements 就是恢复后的状态
   * 3. 订阅只会检测后续的变化，不会检测到初始化时已有的数据
   *
   * 理想情况下，应该在 HistoryService 恢复完成后再启动 CanvasBridge，
   * 但为了保持架构简单，这里采用主动触发的方式。
   */
  start(): void {
    if (this.isRunning) return;

    this.subscribeToStore();

    // 初始化时主动触发一次状态更新，确保从历史状态恢复时元素能被渲染
    const initialState = this.store.getState();

    // 初始化时主动触发一次元素状态更新，确保元素被渲染
    // 这解决了从历史状态恢复时元素不显示的问题
    const initialElements = initialState.elements;
    if (Object.keys(initialElements).length > 0) {
      console.log('[CanvasBridge.start] 初始化时触发元素状态更新', {
        elementCount: Object.keys(initialElements).length,
        elementIds: Object.keys(initialElements),
      });
      // 使用空对象作为 prev，强制触发所有元素的 CREATE_ELEMENT 命令
      this.handleElementsChange(initialElements, {});
    }

    // 初始化时主动触发一次选中状态更新，确保选中框被绘制
    // 这解决了从历史状态恢复时选中框不显示的问题
    if (initialState.selectedElementIds.length > 0) {
      console.log('[CanvasBridge.start] 初始化时触发选中状态更新', {
        selectedElementIds: initialState.selectedElementIds,
      });
      this.handleSelectionChange(initialState.selectedElementIds, []);
    }

    this.isRunning = true;

    // 启动时，如果 store 中已经有元素，需要主动触发一次渲染
    const currentElements = this.store.getState().elements;
    const elementCount = Object.keys(currentElements).length;
    if (elementCount > 0) {
      console.log('CanvasBridge: 启动时检测到已有元素，主动触发渲染', { elementCount });
      // 使用空对象作为 prev，触发 CREATE_ELEMENT 命令
      this.handleElementsChange(currentElements, {});
    }
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
   * 对于 elements，使用深度比较来检测变化，确保即使 store 直接修改元素对象也能触发响应。
   */
  private subscribeToStore(): void {
    // 对 elements 使用深度比较订阅，确保能检测到对象内部属性的变化
    const elementsUnsubscribe = this.subscribeToElementsWithDeepCompare();

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
   * 订阅 elements 状态，使用深度比较来检测变化
   * 这样可以检测到即使 store 直接修改元素对象内部属性的情况
   *
   * 实现方式：每次 store 订阅触发时，都检查 elements 的实际内容变化
   * 即使引用没变，也会通过深度比较检测到内容变化
   *
   * @returns 取消订阅函数
   */
  private subscribeToElementsWithDeepCompare(): () => void {
    let previousElements = this.store.getState().elements;
    console.log(
      'CanvasBridge: 初始化元素订阅，当前元素数量:',
      Object.keys(previousElements).length,
    );

    return this.store.subscribe((state) => {
      const nextElements = state.elements;
      const nextCount = Object.keys(nextElements).length;
      const prevCount = Object.keys(previousElements).length;

      // 先检查引用是否变化（快速路径）
      if (Object.is(nextElements, previousElements)) {
        // 引用没变，但可能内容变了（如果 store 直接修改了对象属性）
        // 使用深度比较检查是否有实际内容变化
        if (this.hasElementsContentChanged(previousElements, nextElements)) {
          console.log('CanvasBridge: 检测到元素内容变化（引用未变）', { prevCount, nextCount });
          const lastElements = previousElements;
          previousElements = nextElements;
          this.handleElementsChange(nextElements, lastElements);
        }
        return;
      }

      // 引用变化了，直接触发处理（handleElementsChange 内部会做 diff）
      console.log('CanvasBridge: 检测到元素引用变化', { prevCount, nextCount });
      const lastElements = previousElements;
      previousElements = nextElements;
      this.handleElementsChange(nextElements, lastElements);
    });
  }

  /**
   * 检查 elements 的内容是否有变化（深度比较，不依赖引用）
   * 用于检测当引用没变但内容可能变化的情况
   *
   * @param prev - 之前的 elements
   * @param next - 最新的 elements
   * @returns 是否有内容变化
   */
  private hasElementsContentChanged(prev: ElementsState, next: ElementsState): boolean {
    // 检查键的数量
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);

    if (prevKeys.length !== nextKeys.length) {
      return true;
    }

    // 检查每个元素是否有变化
    for (const key of nextKeys) {
      const prevElement = prev[key];
      const nextElement = next[key];

      if (!prevElement) {
        // 新增元素
        return true;
      }

      // 使用已有的 diffElement 方法检查元素是否有变化
      if (this.diffElement(prevElement, nextElement) !== null) {
        return true;
      }
    }

    // 检查是否有删除的元素
    for (const key of prevKeys) {
      if (!next[key]) {
        return true;
      }
    }

    return false;
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
    console.log('%c [ 触发变化 ]-139', 'font-size:13px; background:pink; color:#bf2c9f;');
    const commands: AllRenderCommand[] = [];
    const state = this.store.getState();
    const selectedElementIds = state.selectedElementIds;
    let shouldUpdateSelection = false;

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

        // 如果更新的元素是被选中的，标记需要更新选择框
        if (selectedElementIds.includes(nextElement.id)) {
          shouldUpdateSelection = true;
        }
      }
    });

    // 如果有选中的元素被更新，需要更新选择框
    if (shouldUpdateSelection && selectedElementIds.length > 0) {
      commands.push({
        type: 'UPDATE_SELECTION',
        selectedElementIds: selectedElementIds,
        priority: RenderPriority.NORMAL,
      });
    }

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
    const isEqual = this.arraysEqual(next, prev);
    console.log('[CanvasBridge.handleSelectionChange] 选中状态变化', {
      next: [...next], // 展开数组以便查看内容
      prev: [...prev], // 展开数组以便查看内容
      nextLength: next.length,
      prevLength: prev.length,
      arraysEqual: isEqual,
      nextIds: next.join(','),
      prevIds: prev.join(','),
    });

    // 如果选中状态没有变化，直接返回
    if (isEqual) {
      console.log('[CanvasBridge.handleSelectionChange] 选中状态没有变化，跳过');
      return;
    }

    // 生成 UPDATE_SELECTION 命令
    const command: UpdateSelectionCommand = {
      type: 'UPDATE_SELECTION',
      selectedElementIds: next,
      priority: RenderPriority.HIGH, // 选中状态变化需要高优先级渲染
    };

    console.log('[CanvasBridge.handleSelectionChange] 生成 UPDATE_SELECTION 命令', command);

    // 将命令加入队列，而不是立即执行
    // 这样优先级排序才能生效，确保 CREATE_ELEMENT 在 UPDATE_SELECTION 之前执行
    this.enqueueCommands([command]);
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
    const command = {
      type: 'UPDATE_VIEWPORT' as const,
      viewport: next,
      priority: RenderPriority.NORMAL,
    };
    this.enqueueCommands([command]);
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
      // 检查命令是否有 elementId 字段
      // 有 elementId 的命令（CREATE_ELEMENT、UPDATE_ELEMENT、DELETE_ELEMENT）使用 mergeCommand
      // 没有 elementId 的命令（UPDATE_SELECTION、BATCH_*、UPDATE_VIEWPORT）使用特殊 key
      if ('elementId' in command && command.elementId) {
        // 有 elementId 的命令，使用 mergeCommand 处理合并逻辑
        this.mergeCommand(command);
      } else {
        // 没有 elementId 的命令，使用命令类型作为 key，确保同类型命令会被覆盖（只保留最新的）
        const specialKey = `__${command.type}__`;
        this.pendingCommands.set(specialKey, command);
      }
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
   * 获取命令类型的排序值
   * 用于在同优先级时确定命令执行顺序
   *
   * @param commandType - 命令类型
   * @returns 排序值，数值越小优先级越高
   */
  private getCommandTypeOrder(commandType: AllRenderCommand['type']): number {
    switch (commandType) {
      case 'DELETE_ELEMENT':
        return 0;
      case 'CREATE_ELEMENT':
        return 1;
      case 'UPDATE_ELEMENT':
        return 2;
      case 'UPDATE_SELECTION':
        return 3;
      case 'BATCH_DELETE_ELEMENTS':
        return 4;
      case 'BATCH_UPDATE_ELEMENTS':
        return 5;
      case 'UPDATE_VIEWPORT':
        return 6;
      default:
        // 未知类型放在最后
        return 999;
    }
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

    // 按优先级和类型排序：DELETE > CREATE > UPDATE > UPDATE_SELECTION
    // 确保命令执行顺序正确
    // 注意：CREATE_ELEMENT 必须在 UPDATE_SELECTION 之前执行，即使 UPDATE_SELECTION 优先级更高
    const sortedCommands = [...commands].sort((a, b) => {
      // 特殊规则：确保元素更新在选择更新之前执行
      if (
        (a.type === 'CREATE_ELEMENT' && b.type === 'UPDATE_SELECTION') ||
        (a.type === 'UPDATE_ELEMENT' && b.type === 'UPDATE_SELECTION')
      ) {
        return -1;
      }
      if (
        (a.type === 'UPDATE_SELECTION' && b.type === 'CREATE_ELEMENT') ||
        (a.type === 'UPDATE_SELECTION' && b.type === 'UPDATE_ELEMENT')
      ) {
        return 1;
      }

      // 优先级高的先执行
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      // 同优先级时，按类型排序：DELETE > CREATE > UPDATE > UPDATE_SELECTION
      return this.getCommandTypeOrder(a.type) - this.getCommandTypeOrder(b.type);
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
