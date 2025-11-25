// historyservice.ts
import { compress, decompress } from 'lz-string';
import { v4 as uuidv4 } from 'uuid';
import { StoreApi } from 'zustand';
import { useCanvasStore } from '../stores/canvas-store';
import ElementFactory, { Element } from './element-factory';

// 操作类型定义
export interface Operation {
  id: string;
  type: string;
  timestamp: number;
  data: unknown;
  version: number;
  dependencies?: string[];
}

// 快照接口
export interface Snapshot {
  id: string;
  timestamp: number;
  data: string; // 压缩后的状态数据
  version: number;
  isFullSnapshot: boolean;
  baseSnapshotId?: string;
}

// 命令接口
export interface Command {
  id: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  merge?(previousCommand: Command): boolean;
}

export class HistoryService {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private snapshots: Snapshot[] = [];
  private currentVersion: number = 0;
  private store: StoreApi<useCanvasStore>;

  constructor(store: StoreApi<useCanvasStore>) {
    this.store = store;
  }

  private store: typeof useCanvasStore; // 直接使用 store 类型

  constructor(store: typeof useCanvasStore) {
    this.store = store;
  }

  /**
   * 序列化需要持久化的状态字段
   */
  private serializeStateForPersistence(state: useCanvasStore): string {
    const persistableState = {
      elements: this.serializeElementsForPersistence(state.elements),
      selectedElementIds: state.selectedElementIds,
      viewport: state.viewport,
      tool: state.tool,
      lastModified: Date.now(),
    };

    const jsonString = JSON.stringify(persistableState);
    return compress(jsonString);
  }

  /**
   * 序列化元素字典用于持久化
   */
  private serializeElementsForPersistence(
    elements: Record<string, Element>,
  ): Record<string, unknown> {
    const serialized: Record<string, unknown> = {};

    Object.entries(elements).forEach(([id, element]) => {
      serialized[id] = this.serializeElementForPersistence(element);
    });

    return serialized;
  }

  /**
   * 序列化单个元素用于持久化
   */
  private serializeElementForPersistence(element: Element): unknown {
    return {
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
      opacity: element.opacity,
      transform: element.transform,
      version: element.version,
      createdAt: element.createdAt,
      updatedAt: element.updatedAt,
      visibility: element.visibility,
      lastRenderedAt: element.lastRenderedAt,
      style: element.style,
      // 类型特定的字段
      ...(element.type === 'text' && {
        content: (element as unknown).content,
        textStyle: (element as unknown).textStyle,
        richText: (element as unknown).richText,
      }),
      ...(element.type === 'image' && {
        src: (element as unknown).src,
        naturalWidth: (element as unknown).naturalWidth,
        naturalHeight: (element as unknown).naturalHeight,
      }),
      ...(element.type === 'group' && {
        children: (element as unknown).children,
      }),
    };
  }

  /**
   * 反序列化持久化的状态
   */
  private deserializeStateFromPersistence(compressedData: string): Partial<useCanvasStore> {
    const jsonString = decompress(compressedData);
    if (!jsonString) {
      throw new Error('Failed to decompress state data');
    }

    const parsedData = JSON.parse(jsonString);

    return {
      elements: this.deserializeElementsFromPersistence(parsedData.elements || {}),
      selectedElementIds: parsedData.selectedElementIds || [],
      viewport: parsedData.viewport || {
        zoom: 1,
        offset: { x: 0, y: 0 },
        canvasSize: { width: 3000, height: 2000 },
        contentBounds: { x: 0, y: 0, width: 3000, height: 2000 },
        snapping: {
          enabled: true,
          guidelines: [],
          threshold: 5,
          showGuidelines: true,
          snapToElements: true,
          snapToCanvas: true,
        },
      },
      tool: parsedData.tool || {
        activeTool: 'select',
        drawing: false,
        isCreating: false,
      },
    };
  }

  /**
   * 反序列化元素字典
   */
  private deserializeElementsFromPersistence(
    elementsData: Record<string, unknown>,
  ): Record<string, Element> {
    const elements: Record<string, Element> = {};

    Object.entries(elementsData).forEach(([id, elementData]) => {
      elements[id] = this.deserializeElementFromPersistence(elementData);
    });

    return elements;
  }

  /**
   * 反序列化单个元素
   */
  private deserializeElementFromPersistence(elementData: unknown): Element {
    // 使用ElementFactory确保正确的结构
    const baseElement = ElementFactory.createBaseElement(
      elementData.type,
      elementData.x || 0,
      elementData.y || 0,
      elementData.width || 100,
      elementData.height || 100,
    );

    // 应用所有序列化的字段
    const elementWithData = {
      ...baseElement,
      ...elementData,
    };

    return elementWithData as Element;
  }

  /**
   * 序列化用于协同编辑的状态字段
   */
  private serializeStateForCollaboration(state: useCanvasStore): string {
    const collaborationState = {
      elements: this.serializeElementsForCollaboration(state.elements),
      selectedElementIds: state.selectedElementIds,
      version: this.currentVersion,
      timestamp: Date.now(),
    };

    return JSON.stringify(collaborationState);
  }

  /**
   * 序列化元素字典用于协同编辑
   */
  private serializeElementsForCollaboration(
    elements: Record<string, Element>,
  ): Record<string, unknown> {
    const serialized: Record<string, unknown> = {};

    Object.entries(elements).forEach(([id, element]) => {
      serialized[id] = this.serializeElementForCollaboration(element);
    });

    return serialized;
  }

  /**
   * 序列化单个元素用于协同编辑
   */
  private serializeElementForCollaboration(element: Element): unknown {
    // 只包含协同编辑需要的字段
    return {
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
      opacity: element.opacity,
      transform: element.transform,
      version: element.version,
      // 类型特定的协同字段
      ...(element.type === 'text' && {
        content: (element as unknown).content,
      }),
      ...(element.type === 'image' && {
        src: (element as unknown).src,
      }),
      ...(element.type === 'group' && {
        children: (element as unknown).children,
      }),
    };
  }

  /**
   * 处理协同编辑操作
   */
  async applyCollaborationOperation(operation: Operation): Promise<void> {
    if (operation.dependencies && !this.areDependenciesSatisfied(operation.dependencies)) {
      throw new Error(`Operation dependencies not satisfied: ${operation.dependencies.join(', ')}`);
    }

    const currentState = this.store.getState();
    const updatedElements = this.mergeCollaborationChanges(
      currentState.elements,
      operation.data.elements,
    );

    this.store.setState({
      elements: updatedElements,
      selectedElementIds: operation.data.selectedElementIds || currentState.selectedElementIds,
      lastModified: Date.now(),
    });

    this.currentVersion = Math.max(this.currentVersion, operation.version) + 1;
  }

  /**
   * 合并协同编辑的变更
   */
  private mergeCollaborationChanges(
    localElements: Record<string, Element>,
    remoteChanges: Record<string, unknown>,
  ): Record<string, Element> {
    const result = { ...localElements };

    Object.entries(remoteChanges).forEach(([id, change]) => {
      if (result[id]) {
        // 合并现有元素
        result[id] = {
          ...result[id],
          ...this.filterCollaborationFields(change),
        };
      } else if (change.id && change.type) {
        // 创建新元素，使用ElementFactory确保正确的结构
        const newElement = this.createElementFromCollaborationData(change);
        result[id] = newElement;
      }
    });

    return result;
  }

  /**
   * 从协同数据创建元素
   */
  private createElementFromCollaborationData(data: unknown): Element {
    const baseElement = ElementFactory.createBaseElement(
      data.type,
      data.x || 0,
      data.y || 0,
      data.width || 100,
      data.height || 100,
    );

    // 应用协同数据中的字段
    const elementWithData = {
      ...baseElement,
      ...this.filterCollaborationFields(data),
    };

    return elementWithData as Element;
  }

  /**
   * 过滤只允许协同编辑的字段
   */
  private filterCollaborationFields(data: unknown): unknown {
    const filtered: unknown = {};

    // 基础字段
    const collaborationFields = [
      'x',
      'y',
      'width',
      'height',
      'rotation',
      'opacity',
      'transform',
      'version',
      'content',
      'src',
      'children',
    ];

    collaborationFields.forEach((field) => {
      if (data[field] !== undefined) {
        filtered[field] = data[field];
      }
    });

    return filtered;
  }

  /**
   * 检查操作依赖是否满足
   */
  private areDependenciesSatisfied(dependencies: string[]): boolean {
    return dependencies.every((depId) => this.snapshots.some((snapshot) => snapshot.id === depId));
  }

  /**
   * 创建快照
   */
  createSnapshot(isFullSnapshot: boolean = false): Snapshot {
    const currentState = this.store.getState();
    const snapshot: Snapshot = {
      id: uuidv4(),
      timestamp: Date.now(),
      data: this.serializeStateForPersistence(currentState),
      version: this.currentVersion,
      isFullSnapshot,
    };

    this.snapshots.push(snapshot);

    // 清理旧的快照
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-50);
    }

    return snapshot;
  }

  /**
   * 恢复到指定快照
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    const stateData = this.deserializeStateFromPersistence(snapshot.data);
    this.store.setState((prevState) => ({
      ...prevState,
      ...stateData,
    }));

    this.currentVersion = snapshot.version;
  }

  /**
   * 执行命令并添加到历史记录
   */
  async executeCommand(command: Command): Promise<void> {
    try {
      await command.execute();
      this.undoStack.push(command);
      this.redoStack = [];
      this.currentVersion++;
      this.createSnapshot(false);
    } catch (error) {
      console.error('Failed to execute command:', error);
      throw error;
    }
  }

  /**
   * 撤销操作
   */
  async undo(): Promise<void> {
    if (this.undoStack.length === 0) return;

    const command = this.undoStack.pop()!;
    try {
      await command.undo();
      this.redoStack.push(command);
      this.currentVersion--;
    } catch (error) {
      console.error('Failed to undo command:', error);
      this.undoStack.push(command);
      throw error;
    }
  }

  /**
   * 重做操作
   */
  async redo(): Promise<void> {
    if (this.redoStack.length === 0) return;

    const command = this.redoStack.pop()!;
    try {
      await command.redo();
      this.undoStack.push(command);
      this.currentVersion++;
    } catch (error) {
      console.error('Failed to redo command:', error);
      this.redoStack.push(command);
      throw error;
    }
  }

  /**
   * 获取当前版本号
   */
  getCurrentVersion(): number {
    return this.currentVersion;
  }

  /**
   * 清理历史记录
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.snapshots = [];
    this.currentVersion = 0;
  }

  /**
   * 获取快照列表
   */
  getSnapshots(): Snapshot[] {
    return [...this.snapshots];
  }

  /**
   * 获取撤销栈大小
   */
  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  /**
   * 获取重做栈大小
   */
  getRedoStackSize(): number {
    return this.redoStack.length;
  }

  /**
   * 检查是否可以撤销
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * 检查是否可以重做
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * 获取历史状态统计
   */
  getHistoryStats() {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      snapshotCount: this.snapshots.length,
      currentVersion: this.currentVersion,
    };
  }
}
