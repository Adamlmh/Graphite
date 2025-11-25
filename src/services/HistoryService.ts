// historyservice.ts
import { compress, decompress } from 'lz-string';
import { v4 as uuidv4 } from 'uuid';
import { StoreApi, Unsubscribe } from 'zustand';
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
  metadata?: {
    elementCount: number;
    memoryUsage: number;
    compressedSize: number;
  };
}

// 命令接口
export interface Command {
  id: string;
  type: string;
  timestamp: number;
  execute(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  merge?(previousCommand: Command): boolean;
  serialize(): string;
}

// 持久化元素类型（排除运行时字段）
type PersistedElement = Omit<Element, 'cacheKey' | 'visibility' | 'lastRenderedAt'>;

// 持久化视口状态
interface PersistedViewport {
  zoom: number;
  offset: { x: number; y: number };
  canvasSize?: { width: number; height: number };
  snapping?: {
    enabled: boolean;
    threshold: number;
    showGuidelines: boolean;
    snapToElements: boolean;
    snapToCanvas: boolean;
  };
}

// 持久化选择状态
interface PersistedSelection {
  selectedElementIds: string[];
}

// 持久化工具状态
interface PersistedTool {
  activeTool: string;
}

// 画布元数据
interface CanvasMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  settings?: {
    grid?: {
      enabled: boolean;
      size: number;
      color: string;
    };
  };
}

// 持久化画布状态
interface PersistedCanvasState {
  elements: Record<string, PersistedElement>;
  viewport: PersistedViewport;
  selection?: PersistedSelection;
  tool?: PersistedTool;
  metadata: CanvasMetadata;
  version: string;
  schemaVersion: number;
}

// 保存状态类型
export enum SaveStatus {
  IDLE = 'idle',
  SAVING = 'saving',
  SAVED = 'saved',
  ERROR = 'error',
}

// 性能监控指标
interface PerformanceMetrics {
  saveDuration: number;
  compressionRatio: number;
  memoryUsage: number;
  operationCount: number;
}

export class HistoryService {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private snapshots: Snapshot[] = [];
  private currentVersion: number = 0;
  private unsubscribe: Unsubscribe | null = null;
  private store: typeof useCanvasStore; // 直接使用 store 类型

  constructor(store: typeof useCanvasStore) {
    this.store = store;
  }
  // 自动保存相关
  private autoSaveTimeout: number | NodeJS.Timeout | null = null;
  private lastSaveTime: number = 0;
  private saveStatus: SaveStatus = SaveStatus.IDLE;
  private saveError: Error | null = null;
  private lastSavedVersion: number = 0;
  private hasUnsavedChanges: boolean = false;
  private autoSaveEnabled: boolean = true;
  private autoSaveInterval: number = 10000; // 10秒自动保存间隔

  constructor() {
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  // 性能监控
  private performanceMetrics: PerformanceMetrics = {
    saveDuration: 0,
    compressionRatio: 0,
    memoryUsage: 0,
    operationCount: 0,
  };

  // 配置
  private config = {
    autoSaveDelay: 1000, // 1秒防抖
    maxSnapshots: 100,
    maxUndoSteps: 50,
    fullSnapshotInterval: 10, // 每10个操作创建一个完整快照
    compressionEnabled: true,
  };

  constructor(store: StoreApi<typeof useCanvasStore>) {
    this.store = store;
    this.setupAutoSave();
    this.setupPageUnloadListener();
  }

  /**
   * 设置自动保存监听
   */
  private setupAutoSave(): void {
    this.unsubscribe = this.store.subscribe((state, previousState) => {
      // 检查是否有意义的变更
      if (this.hasMeaningfulChange(state, previousState)) {
        this.scheduleAutoSave();
      }
    });

    // 设置定时保存
    setInterval(() => {
      if (this.shouldAutoSave()) {
        this.createSnapshot(false);
      }
    }, 30000); // 30秒定时保存
  }

  /**
   * 设置页面卸载监听
   */
  private setupPageUnloadListener(): void {
    window.addEventListener('beforeunload', (event) => {
      if (this.saveStatus === SaveStatus.SAVING) {
        event.preventDefault();
        event.returnValue = '正在保存数据，请稍候...';
        this.forceSave().catch(console.error);
      }
    });
  }

  /**
   * 检查是否有意义的变更
   */
  private hasMeaningfulChange(current: unknown, previous: unknown): boolean {
    // 检查元素变化
    if (current.elements !== previous.elements) {
      return true;
    }

    // 检查视口变化
    if (
      current.viewport.zoom !== previous.viewport.zoom ||
      current.viewport.offset.x !== previous.viewport.offset.x ||
      current.viewport.offset.y !== previous.viewport.offset.y
    ) {
      return true;
    }

    // 检查选择变化
    if (
      JSON.stringify(current.selectedElementIds) !== JSON.stringify(previous.selectedElementIds)
    ) {
      return true;
    }

    return false;
  }

  /**
   * 调度自动保存
   */
  private scheduleAutoSave(): void {
    // 清理定时器
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout as number); // 强制类型转换
      this.autoSaveTimeout = null;
    }

    this.autoSaveTimeout = setTimeout(() => {
      this.createSnapshot(false).catch(console.error);
    }, this.config.autoSaveDelay);
  }

  /**
   * 检查是否应该自动保存
   */
  private shouldAutoSave(): boolean {
    const now = Date.now();
    return now - this.lastSaveTime > this.config.autoSaveDelay * 2;
  }

  /**
   * 强制立即保存
   */
  async forceSave(): Promise<void> {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout as number); // 强制类型转换
      this.autoSaveTimeout = null;
    }
    await this.createSnapshot(false);
  }

  /**
   * 序列化需要持久化的状态字段
   */
  private serializeStateForPersistence(state: unknown): string {
    const startTime = performance.now();

    const persistableState: PersistedCanvasState = {
      elements: this.serializeElementsForPersistence(state.elements),
      viewport: {
        zoom: state.viewport.zoom,
        offset: state.viewport.offset,
        canvasSize: state.viewport.canvasSize,
        snapping: state.viewport.snapping
          ? {
              enabled: state.viewport.snapping.enabled,
              threshold: state.viewport.snapping.threshold,
              showGuidelines: state.viewport.snapping.showGuidelines,
              snapToElements: state.viewport.snapping.snapToElements,
              snapToCanvas: state.viewport.snapping.snapToCanvas,
            }
          : undefined,
      },
      selection: {
        selectedElementIds: state.selectedElementIds,
      },
      tool: {
        activeTool: state.tool.activeTool,
      },
      metadata: {
        id: state.metadata?.id || 'canvas-id',
        title: state.metadata?.title || 'Untitled',
        createdAt: state.metadata?.createdAt || Date.now(),
        updatedAt: Date.now(),
        createdBy: state.metadata?.createdBy || 'user',
        settings: state.metadata?.settings,
      },
      version: '1.0',
      schemaVersion: 1,
    };

    const jsonString = JSON.stringify(persistableState);
    const compressedData = this.config.compressionEnabled ? compress(jsonString) : jsonString;

    // 更新性能指标
    const endTime = performance.now();
    this.performanceMetrics.saveDuration = endTime - startTime;
    this.performanceMetrics.compressionRatio = compressedData.length / jsonString.length;

    return compressedData;
  }

  /**
   * 序列化元素字典用于持久化
   */
  private serializeElementsForPersistence(
    elements: Record<string, Element>,
  ): Record<string, PersistedElement> {
    const serialized: Record<string, PersistedElement> = {};

    Object.entries(elements).forEach(([id, element]) => {
      // 排除运行时字段
      //const { cacheKey, visibility, lastRenderedAt, ...persistedElement } = element;
      const { ...persistedElement } = element;
      serialized[id] = persistedElement as PersistedElement;
    });

    return serialized;
  }

  /**
   * 反序列化持久化的状态
   */
  private deserializeStateFromPersistence(compressedData: string): Partial<unknown> {
    try {
      const jsonString = this.config.compressionEnabled
        ? decompress(compressedData)
        : compressedData;

      if (!jsonString) {
        throw new Error('Failed to decompress state data');
      }

      const parsedData: PersistedCanvasState = JSON.parse(jsonString);

      return {
        elements: this.deserializeElementsFromPersistence(parsedData.elements || {}),
        selectedElementIds: parsedData.selection?.selectedElementIds || [],
        viewport: {
          zoom: parsedData.viewport.zoom,
          offset: parsedData.viewport.offset,
          canvasSize: parsedData.viewport.canvasSize || { width: 3000, height: 2000 },
          contentBounds: { x: 0, y: 0, width: 3000, height: 2000 },
          snapping: {
            enabled: parsedData.viewport.snapping?.enabled ?? true,
            threshold: parsedData.viewport.snapping?.threshold ?? 5,
            showGuidelines: parsedData.viewport.snapping?.showGuidelines ?? true,
            snapToElements: parsedData.viewport.snapping?.snapToElements ?? true,
            snapToCanvas: parsedData.viewport.snapping?.snapToCanvas ?? true,
            guidelines: [],
          },
        },
        tool: {
          activeTool: parsedData.tool?.activeTool || 'select',
          drawing: false,
          isCreating: false,
        },
        metadata: parsedData.metadata,
      };
    } catch (error) {
      console.error('Failed to deserialize state:', error);
      throw this.createRecoveryError(error);
    }
  }

  /**
   * 创建恢复错误
   */
  private createRecoveryError(originalError: unknown): Error {
    const recoveryError = new Error(`Data recovery failed: ${originalError.message}`);
    recoveryError.cause = originalError;
    return recoveryError;
  }

  /**
   * 反序列化元素字典
   */
  private deserializeElementsFromPersistence(
    elementsData: Record<string, PersistedElement>,
  ): Record<string, Element> {
    const elements: Record<string, Element> = {};

    Object.entries(elementsData).forEach(([id, elementData]) => {
      try {
        elements[id] = this.deserializeElementFromPersistence(elementData);
      } catch (error) {
        console.warn(`Failed to deserialize element ${id}:`, error);
        // 跳过损坏的元素，继续恢复其他元素
      }
    });

    return elements;
  }

  /**
   * 反序列化单个元素
   */
  private deserializeElementFromPersistence(elementData: PersistedElement): Element {
    // 使用ElementFactory确保正确的结构
    const baseElement = ElementFactory.createBaseElement(
      elementData.type,
      elementData.x || 0,
      elementData.y || 0,
      elementData.width || 100,
      elementData.height || 100,
    );

    // 应用所有序列化的字段并添加运行时字段
    const elementWithData = {
      ...baseElement,
      ...elementData,
      cacheKey: uuidv4(),
      visibility: true,
      lastRenderedAt: Date.now(),
    };

    return elementWithData as Element;
  }

  /**
   * 创建快照
   */
  async createSnapshot(isFullSnapshot: boolean = false): Promise<Snapshot> {
    if (this.saveStatus === SaveStatus.SAVING) {
      throw new Error('Another save operation is in progress');
    }

    this.saveStatus = SaveStatus.SAVING;

    try {
      const currentState = this.store.getState();
      const snapshotData = this.serializeStateForPersistence(currentState);

      const snapshot: Snapshot = {
        id: uuidv4(),
        timestamp: Date.now(),
        data: snapshotData,
        version: this.currentVersion,
        isFullSnapshot: isFullSnapshot || this.shouldCreateFullSnapshot(),
        metadata: {
          elementCount: Object.keys(currentState.elements).length,
          memoryUsage: new Blob([snapshotData]).size,
          compressedSize: snapshotData.length,
        },
      };

      this.snapshots.push(snapshot);
      this.lastSaveTime = Date.now();

      // 清理旧的快照
      this.cleanupOldSnapshots();

      this.saveStatus = SaveStatus.SAVED;
      this.saveError = null;

      return snapshot;
    } catch (error) {
      this.saveStatus = SaveStatus.ERROR;
      this.saveError = error as Error;
      throw error;
    }
  }

  /**
   * 检查是否应该创建完整快照
   */
  private shouldCreateFullSnapshot(): boolean {
    return this.snapshots.length % this.config.fullSnapshotInterval === 0;
  }

  /**
   * 清理旧快照
   */
  private cleanupOldSnapshots(): void {
    if (this.snapshots.length > this.config.maxSnapshots) {
      // 保留最近的完整快照和增量快照
      const fullSnapshots = this.snapshots.filter((s) => s.isFullSnapshot);
      const lastFullSnapshot = fullSnapshots[fullSnapshots.length - 1];

      this.snapshots = this.snapshots.filter((s) => s.timestamp >= lastFullSnapshot.timestamp);
    }

    // 清理撤销栈
    if (this.undoStack.length > this.config.maxUndoSteps) {
      this.undoStack = this.undoStack.slice(-this.config.maxUndoSteps);
    }
  }

  /**
   * 恢复到指定快照
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    try {
      const stateData = this.deserializeStateFromPersistence(snapshot.data);
      this.store.setState((prevState) => ({
        ...prevState,
        ...stateData,
      }));

      this.currentVersion = snapshot.version;
    } catch (error) {
      // 尝试从最近的快照恢复
      await this.tryRecoveryFromBackup(error as Error);
      throw error;
    }
  }

  /**
   * 尝试从备份恢复
   */
  private async tryRecoveryFromBackup(error: Error): Promise<void> {
    console.warn('Attempting recovery from backup due to:', error);

    // 尝试最近的几个快照
    const recentSnapshots = this.snapshots.slice(-3).reverse();

    for (const snapshot of recentSnapshots) {
      try {
        const stateData = this.deserializeStateFromPersistence(snapshot.data);
        this.store.setState((prevState) => ({
          ...prevState,
          ...stateData,
        }));
        console.log('Recovery successful from snapshot:', snapshot.id);
        return;
      } catch (recoveryError) {
        console.warn('Recovery attempt failed:', recoveryError);
      }
    }

    throw new Error('All recovery attempts failed');
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
      this.performanceMetrics.operationCount++;

      // 根据操作频率调整快照间隔
      this.adjustSnapshotInterval();

      // 创建快照
      await this.createSnapshot(false);
    } catch (error) {
      console.error('Failed to execute command:', error);
      throw error;
    }
  }

  /**
   * 调整快照间隔
   */
  private adjustSnapshotInterval(): void {
    const opsPerMinute =
      (this.performanceMetrics.operationCount / (Date.now() - this.lastSaveTime)) * 60000;

    if (opsPerMinute > 60) {
      // 高频操作，缩短间隔
      this.config.autoSaveDelay = 500;
      this.config.fullSnapshotInterval = 5;
    } else if (opsPerMinute < 10) {
      // 低频操作，延长间隔
      this.config.autoSaveDelay = 2000;
      this.config.fullSnapshotInterval = 20;
    }
  }

  /**
   * 获取保存状态
   */
  getSaveStatus(): { status: SaveStatus; error: Error | null; lastSaveTime: number } {
    return {
      status: this.saveStatus,
      error: this.saveError,
      lastSaveTime: this.lastSaveTime,
    };
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * 导出历史数据
   */
  exportHistory(): string {
    const historyData = {
      version: 1,
      timestamp: Date.now(),
      snapshots: this.snapshots.map((snapshot) => ({
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        version: snapshot.version,
        data: snapshot.data,
        metadata: snapshot.metadata,
      })),
      currentVersion: this.currentVersion,
      undoStack: this.undoStack.length,
      redoStack: this.redoStack.length,
    };

    return JSON.stringify(historyData, null, 2);
  }

  /**
   * 导入历史数据
   */
  async importHistory(data: string): Promise<void> {
    try {
      const parsedData = JSON.parse(data);

      // 验证数据格式
      if (!parsedData || typeof parsedData !== 'object') {
        throw new Error('Invalid history data format');
      }

      if (!Array.isArray(parsedData.snapshots)) {
        throw new Error('Missing or invalid snapshots array');
      }

      // 验证快照数据
      const validSnapshots = parsedData.snapshots.filter(
        (s: unknown) => s && s.id && s.timestamp && s.data && s.version !== undefined,
      );

      if (validSnapshots.length === 0) {
        throw new Error('No valid snapshots found in history data');
      }

      // 清空当前历史记录
      this.snapshots = [];
      this.undoStack = [];
      this.redoStack = [];

      // 导入快照
      this.snapshots = validSnapshots;
      this.currentVersion = parsedData.currentVersion || 0;

      // 恢复到最新的快照
      const latestSnapshot = this.snapshots[this.snapshots.length - 1];
      if (latestSnapshot) {
        await this.restoreSnapshot(latestSnapshot.id);
      }

      // 重置保存状态
      this.lastSavedVersion = this.currentVersion;
      this.hasUnsavedChanges = false;

      console.log('History imported successfully:', {
        snapshots: this.snapshots.length,
        currentVersion: this.currentVersion,
      });
    } catch (error) {
      console.error('Failed to import history:', error);
      throw new Error(`History import failed: ${error.message}`);
    }
  }

  /**
   * 页面卸载前的处理
   */
  private handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges && this.autoSaveEnabled) {
      // 尝试最后一次保存
      this.forceSave();

      // 提示用户有未保存的更改
      event.preventDefault();
      event.returnValue = '您有未保存的更改，确定要离开吗？';
    }
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
