// historyservice.ts
import { decompress } from 'lz-string';
import { v4 as uuidv4 } from 'uuid';
//import type { StoreApi} from 'zustand';
//import { useCanvasStore } from '../stores/canvas-store';
import type { Tool, Guideline } from '../types/index.ts';
import type { Element } from './element-factory';
import ElementFactory from './element-factory';
import type { CanvasState } from '../stores/canvas-store';
import HistoryWorker from '../workers/history.worker.ts?worker';
import type { WorkerSaveResponse } from '../workers/history.worker';
//import {Point} from "../types/index.ts"; // 直接导入接口
//type CanvasState = ReturnType<typeof useCanvasStore>;

/*
// 协同操作类型定义
export interface Operation {
  id: string;
  type: string;
  timestamp: number;
  data: unknown;
  version: number;
  dependencies?: string[];
}
*/

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
    guidelines: Guideline[];
  };
  contentBounds: { x: number; y: number; width: number; height: number };
}

// 持久化选择状态
interface PersistedSelection {
  selectedElementIds: string[];
}

// 持久化工具状态
interface PersistedTool {
  activeTool: Tool;
  drawing: boolean;
  isCreating: boolean;
}

/*
// 画布元数据
interface CanvasMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  settings: {
    grid: {
      enabled: boolean;
      size: number;
      color: string;
    };
  };
}

 */

// 持久化画布状态
interface PersistedCanvasState {
  elements: Record<string, PersistedElement>;
  viewport: PersistedViewport;
  selection: PersistedSelection;
  tool: PersistedTool;
  //metadata: CanvasMetadata;
  version: string;
  schemaVersion: number;
  lastModified: number;
}

// 保存状态类型
export const SaveStatus = {
  IDLE: 'idle',
  SAVING: 'saving',
  SAVED: 'saved',
  ERROR: 'error',
} as const;
export type SaveStatus = (typeof SaveStatus)[keyof typeof SaveStatus];

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
  //private unsubscribe: (() => void) | null = null;
  //private store: typeof useCanvasStore; // 直接使用 store 类型
  private store: {
    getState: () => CanvasState;
    setState: (
      state: Partial<CanvasState> | ((state: CanvasState) => Partial<CanvasState>),
    ) => void;
  };
  private worker = new HistoryWorker();
  private pendingSnapshotIds = new Set<string>(); // 跟踪正在 Worker 中处理的快照 ID

  constructor(store: {
    getState: () => CanvasState;
    setState: (
      state: Partial<CanvasState> | ((state: CanvasState) => Partial<CanvasState>),
    ) => void;
  }) {
    this.store = store;
    // 加载持久化偏好设置
    this.config.persistenceEnabled = this.loadPersistencePreference();
    // 初始化时先禁用自动保存
    this.autoSaveEnabled = false;
    this.setupPageUnloadListener();
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    // 设置 worker 回调
    this.worker.onmessage = (e: MessageEvent<WorkerSaveResponse>) => {
      const { snapshotId, compressed } = e.data;

      // 将 worker 的结果写入快照记录
      const snapshot = this.snapshots.find((s) => s.id === snapshotId);
      if (snapshot) {
        snapshot.data = compressed;
        snapshot.metadata = {
          elementCount: snapshot.metadata?.elementCount || 0,
          memoryUsage: snapshot.metadata?.memoryUsage || 0,
          compressedSize: compressed.length,
        };

        // 最终写入 IndexedDB【仍由主线程负责】
        // 保存到持久化存储（仅在完整快照或间隔到达时）
        // 检查是否启用持久化
        if (this.config.persistenceEnabled && this.config.autoSaveToDB) {
          const shouldPersist = snapshot.isFullSnapshot || Date.now() - this.lastDBSaveTime > 60000;
          if (shouldPersist) {
            this.saveSnapshotToDB(snapshot)
              .then(() => {
                this.lastDBSaveTime = Date.now();
                console.log('保存到持久化存储');
                // 标记快照已完成处理
                this.pendingSnapshotIds.delete(snapshotId);
                // 检查是否所有快照都已完成
                this.updateSaveStatus();
              })
              .catch((error) => {
                console.error('保存到持久化存储失败:', error);
                // 即使失败也标记为已完成（避免永久阻塞）
                this.pendingSnapshotIds.delete(snapshotId);
                this.updateSaveStatus();
              });
          } else {
            // 即使不持久化，也标记为已完成
            this.pendingSnapshotIds.delete(snapshotId);
            this.updateSaveStatus();
          }
        } else {
          // 如果未启用持久化或自动保存，也标记为已完成
          this.pendingSnapshotIds.delete(snapshotId);
          this.updateSaveStatus();
        }
      } else {
        // 如果快照不存在，也继续处理
        this.pendingSnapshotIds.delete(snapshotId);
        this.updateSaveStatus();
      }
    };
    // 初始化 IndexedDB
    this.initIndexedDB()
      .then(() => {
        // 关键：初始化完成后立刻加载
        return this.loadFromStorage();
      })
      .then(() => {
        // 加载完快照后，恢复到最新状态
        if (this.snapshots.length > 0) {
          const latest = this.snapshots[this.snapshots.length - 1];
          return this.restoreSnapshot(latest.id); // 不抛错，让页面能继续用
        }
      })
      .then(() => {
        this.autoSaveEnabled = true; // 恢复完成后再启用
        this.setupAutoSave();
      })
      .catch((e) => {
        console.warn('[HistoryService] 未能从持久化存储恢复', e);
        // 可以在这里给一个“新建空白画布”的默认状态
      });
  }
  // 自动保存相关
  private autoSaveTimeout: number | null = null;
  private lastSaveTime: number = 0;
  private saveStatus: SaveStatus = SaveStatus.IDLE;
  private saveError: Error | null = null;
  private lastSavedVersion: number = 0; //待确认
  private hasUnsavedChanges: boolean = false;
  private autoSaveEnabled: boolean = true;
  private lastDBSaveTime: number = 0;
  //private autoSaveInterval: number = 10000; // 10秒自动保存间隔

  // IndexedDB 相关属性
  private dbName = 'CanvasHistoryDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;
  private isDBReady = false;

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
    storageBackend: 'indexeddb' as 'indexeddb' | 'localstorage', // 存储后端选择
    maxDBRecords: 1000, // 最大存储记录数
    autoSaveToDB: true, // 是否自动保存到数据库
    maxDBAge: 30 * 24 * 60 * 60 * 1000, // 默认保留30天
    persistenceEnabled: true, // 是否启用持久化（用户可控制），在构造函数中初始化
  };

  /**
   * 从 localStorage 加载持久化偏好设置
   */
  private loadPersistencePreference(): boolean {
    try {
      const saved = localStorage.getItem('canvas-persistence-enabled');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch (error) {
      console.warn('Failed to load persistence preference:', error);
    }
    return true; // 默认启用
  }

  /**
   * 保存持久化偏好设置到 localStorage
   */
  private savePersistencePreference(enabled: boolean): void {
    try {
      localStorage.setItem('canvas-persistence-enabled', String(enabled));
    } catch (error) {
      console.warn('Failed to save persistence preference:', error);
    }
  }

  /**
   * 初始化 IndexedDB
   */
  private async initIndexedDB(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, falling back to localStorage');
        this.config.storageBackend = 'localstorage';
        resolve();
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        this.config.storageBackend = 'localstorage';
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isDBReady = true;
        console.log('IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建对象存储
        if (!db.objectStoreNames.contains('snapshots')) {
          const store = db.createObjectStore('snapshots', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('version', 'version', { unique: false });
        }

        if (!db.objectStoreNames.contains('history')) {
          db.createObjectStore('history', { keyPath: 'id' });
        }

        console.log('IndexedDB schema upgraded to version', this.dbVersion);
      };
    });
  }

  /**
   * 保存快照到 IndexedDB
   */
  private async saveSnapshotToDB(snapshot: Snapshot): Promise<void> {
    if (!this.isDBReady || this.config.storageBackend !== 'indexeddb') {
      await this.saveSnapshotToLocalStorage(snapshot);
      return;
    }

    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction(['snapshots'], 'readwrite');
      const store = transaction.objectStore('snapshots');

      const dbSnapshot = {
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        version: snapshot.version,
        data: snapshot.data,
        isFullSnapshot: snapshot.isFullSnapshot,
        metadata: snapshot.metadata,
      };

      const request = store.put(dbSnapshot);

      request.onsuccess = () => {
        // 清理旧记录
        this.cleanupOldDBRecords();
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 保存到 localStorage（降级方案）
   */
  private async saveSnapshotToLocalStorage(snapshot: Snapshot): Promise<void> {
    try {
      const key = `canvas-snapshot-${snapshot.id}`;
      localStorage.setItem(key, JSON.stringify(snapshot));

      // 保存索引
      const index = JSON.parse(localStorage.getItem('canvas-snapshots-index') || '[]');
      index.push({ id: snapshot.id, timestamp: snapshot.timestamp });
      index.sort((a: { timestamp: number }, b: { timestamp: number }) => b.timestamp - a.timestamp);
      index.splice(this.config.maxDBRecords); // 保留最新的
      localStorage.setItem('canvas-snapshots-index', JSON.stringify(index));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }

  /**
   * 从持久化存储加载快照
   */
  async loadFromStorage(): Promise<void> {
    // 如果未启用持久化，跳过加载
    if (!this.config.persistenceEnabled) {
      console.log('持久化已禁用，跳过加载');
      return;
    }
    if (this.config.storageBackend === 'indexeddb' && this.isDBReady) {
      await this.loadFromIndexedDB();
    } else {
      await this.loadFromLocalStorage();
    }
  }

  /**
   * 从 IndexedDB 加载
   */
  private async loadFromIndexedDB(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction(['snapshots'], 'readonly');
      const store = transaction.objectStore('snapshots');
      const index = store.index('timestamp');
      // 构造空的 IDBKeyRange，明确匹配所有记录
      const emptyRange = IDBKeyRange.lowerBound(0, true);
      // 显式指定 openCursor 的返回类型为 IDBRequest<IDBCursorWithValue | null>
      const request = index.openCursor(emptyRange, 'prev') as IDBRequest<IDBCursorWithValue | null>;

      const snapshots: Snapshot[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          snapshots.push(cursor.value as Snapshot);
          cursor.continue();
        } else {
          // 修复：直接处理快照，不再调用 restoreFromSnapshots（避免循环）
          if (snapshots.length === 0) {
            console.log('📊 IndexedDB 中无快照数据');
            this.snapshots = [];
            resolve();
            return;
          }

          // 按时间戳排序
          snapshots.sort((a, b) => a.timestamp - b.timestamp);

          // 修复：添加空值检查
          const lastFullSnapshotIndex = Math.max(snapshots.length - this.config.maxSnapshots, 0);

          // 保留最新的快照
          this.snapshots = snapshots.slice(lastFullSnapshotIndex);
          console.log('📦 从 IndexedDB 加载的快照数量:', this.snapshots.length);
          resolve();
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 从 localStorage 加载（降级方案）
   */
  private async loadFromLocalStorage(): Promise<void> {
    try {
      const index = JSON.parse(localStorage.getItem('canvas-snapshots-index') || '[]');
      const snapshots: Snapshot[] = [];

      for (const item of index) {
        const data = localStorage.getItem(`canvas-snapshot-${item.id}`);
        if (data) {
          snapshots.push(JSON.parse(data));
        }
      }

      await this.restoreFromSnapshots(snapshots);
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
      throw error;
    }
  }

  /**
   * 手动保存到持久化存储
   */
  async saveToStorage(): Promise<void> {
    // 如果未启用持久化，跳过保存
    if (!this.config.persistenceEnabled) {
      console.log('持久化已禁用，跳过保存');
      return;
    }
    const snapshot = await this.createSnapshot(true); // 创建完整快照
    if (this.config.storageBackend === 'indexeddb') {
      await this.saveSnapshotToDB(snapshot);
    } else {
      await this.saveSnapshotToLocalStorage(snapshot);
    }
  }

  /**
   * 获取存储后端信息
   */
  getStorageInfo(): { backend: string; ready: boolean; recordCount: number } {
    return {
      backend: this.config.storageBackend,
      ready: this.isDBReady,
      recordCount: this.snapshots.length,
    };
  }

  /**
   * 清理旧的数据库记录
   */
  private cleanupOldDBRecords(): void {
    if (!this.db || !this.isDBReady) return;

    const transaction = this.db.transaction(['snapshots'], 'readwrite');
    const store = transaction.objectStore('snapshots');
    const index = store.index('timestamp');

    // 设置默认值，比如默认保留30天
    const maxDBAge = this.config.maxDBAge || 30 * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxDBAge;

    const range = IDBKeyRange.upperBound(cutoffTime);
    const request = index.openCursor(range);

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  }

  /**
   * 从快照数组恢复
   */
  private async restoreFromSnapshots(snapshots: Snapshot[]): Promise<void> {
    if (snapshots.length === 0) {
      console.log('restoreFromSnapshots: 传入快照为空');
      return;
    }

    // 按时间戳排序
    snapshots.sort((a, b) => a.timestamp - b.timestamp);

    // 恢复到最新的快照
    const latestSnapshot = snapshots[snapshots.length - 1];
    try {
      await this.restoreSnapshot(latestSnapshot.id);
    } catch (error) {
      console.warn('恢复最新快照失败，使用默认状态:', error);
    }

    // 保留最新的快照
    const lastFullSnapshotIndex = Math.max(snapshots.length - this.config.maxSnapshots, 0);

    this.snapshots = snapshots.slice(lastFullSnapshotIndex);
    console.log('📦 最终保留的快照数量:', this.snapshots.length);
  }

  /**
   * 设置自动保存监听
   */
  private setupAutoSave(): void {
    // 设置定时保存
    setInterval(() => {
      if (this.hasUnsavedChanges && this.shouldAutoSave()) {
        this.createSnapshot(false).catch(console.error);
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

  //检查是否有意义的变更
  private hasMeaningfulChange(current: string, previous: string): boolean {
    try {
      // 解析 JSON 字符串为对象
      const currentObj = JSON.parse(current) as CanvasState;
      const previousObj = JSON.parse(previous) as CanvasState;

      // 1. 检查元素变化
      if (JSON.stringify(currentObj.elements) !== JSON.stringify(previousObj.elements)) {
        return true;
      }

      // 2. 检查视口变化
      /*
      if (
        currentObj.viewport.zoom !== previousObj.viewport.zoom ||
        currentObj.viewport.offset.x !== previousObj.viewport.offset.x ||
        currentObj.viewport.offset.y !== previousObj.viewport.offset.y
      ) {
        return true;
      }
       */

      if (currentObj.viewport.zoom !== previousObj.viewport.zoom) {
        return true;
      }

      // 3. 检查选择变化
      if (
        JSON.stringify(currentObj.selectedElementIds) !==
        JSON.stringify(previousObj.selectedElementIds)
      ) {
        return true;
      }

      // 4. 检查工具状态变化（关键变更）
      if (currentObj.tool.activeTool !== previousObj.tool.activeTool) {
        return true;
      }

      return false;
    } catch {
      // 如果解析失败，认为有变化
      return true;
    }
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
      this.autoSaveTimeout = null;
      this.createSnapshot(false).catch(console.error);
    }, this.config.autoSaveDelay);
  }

  /**
   * 取消待处理的自动保存
   * 用于在操作完成时立即保存，而不是等待防抖延迟
   */
  private cancelPendingAutoSave(): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout as number);
      this.autoSaveTimeout = null;
    }
  }

  /**
   * 检查是否应该自动保存
   */
  private shouldAutoSave(): boolean {
    const now = Date.now();
    return now - this.lastSaveTime > this.config.autoSaveDelay * 2;
  }

  /**
   * 更新保存状态
   * 当所有待处理的快照都完成后，才设置为 SAVED
   */
  private updateSaveStatus(): void {
    // 如果还有待处理的快照，保持 SAVING 状态
    if (this.pendingSnapshotIds.size > 0) {
      this.saveStatus = SaveStatus.SAVING;
      return;
    }

    // 所有快照都已完成，更新状态
    this.saveStatus = SaveStatus.SAVED;
    this.saveError = null;
    this.lastSavedVersion = this.currentVersion;
    this.hasUnsavedChanges = false;
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
   * 生成需要持久化的状态对象（同步、无 JSON.stringify、无 compress、无 Blob 转换）
   * Blob URL 转 base64 的操作在 Worker 中完成
   */
  private generatePersistableState(state: CanvasState): PersistedCanvasState {
    // 显式声明类型并按正确顺序构造
    const persistableState: PersistedCanvasState = {
      elements: this.serializeElementsForPersistence(state.elements),
      viewport: {
        zoom: state.viewport.zoom,
        offset: state.viewport.offset,
        canvasSize: state.viewport.canvasSize,
        snapping: state.viewport.snapping
          ? {
              enabled: state.viewport.snapping.enabled,
              threshold: state.viewport.snapping.threshold || 5,
              showGuidelines: state.viewport.snapping.showGuidelines || true,
              snapToElements: state.viewport.snapping.snapToElements || true,
              snapToCanvas: state.viewport.snapping.snapToCanvas || true,
              guidelines: state.viewport.snapping.guidelines || [],
            }
          : undefined,
        contentBounds: state.viewport.contentBounds || { x: 0, y: 0, width: 3000, height: 2000 },
      },
      selection: {
        selectedElementIds: state.selectedElementIds,
      },
      tool: {
        activeTool: state.tool.activeTool,
        drawing: state.tool.drawing || false,
        isCreating: state.tool.isCreating || false,
      },
      /*
      metadata: {
        id: state.metadata?.id || 'canvas-id',
        title: state.metadata?.title || 'Untitled',
        createdAt: state.metadata?.createdAt || Date.now(),
        updatedAt: Date.now(),
        createdBy: state.metadata?.createdBy || 'user',
        settings: {
          grid: {
            enabled: state.metadata?.settings?.grid?.enabled ?? true,
            size: state.metadata?.settings?.grid?.size ?? 20,
            color: state.metadata?.settings?.grid?.color ?? '#e0e0e0',
          },
        },
      },
      */
      version: '1.0',
      schemaVersion: 1,
      lastModified: Date.now(),
    };

    return persistableState;
  }

  /**
   * 序列化元素字典用于持久化
   * 保留所有字段，只排除运行时字段（cacheKey, visibility, lastRenderedAt）
   * 注意：Blob URL 转 base64 的操作在 Worker 中完成，不在这里处理
   */
  private serializeElementsForPersistence(
    elements: Record<string, Element>,
  ): Record<string, PersistedElement> {
    const serialized: Record<string, PersistedElement> = {};

    // 同步处理所有元素，不做任何异步操作（Blob 转换在 Worker 中完成）
    Object.entries(elements).forEach(([id, element]) => {
      // 显式创建持久化元素，保留所有字段，只排除运行时字段
      const persistedElement: PersistedElement = {
        // 基础字段
        id: element.id,
        type: element.type,
        zIndex: element.zIndex,
        // 几何属性
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        // 样式
        style: element.style,
        // 通用属性
        opacity: element.opacity,
        // 变换系统
        transform: {
          scaleX: element.transform.scaleX,
          scaleY: element.transform.scaleY,
          pivotX: element.transform.pivotX,
          pivotY: element.transform.pivotY,
        },
        // 元数据
        version: element.version,
        createdAt: element.createdAt,
        updatedAt: element.updatedAt,
        // 类型特定的扩展字段
        ...(element.type === 'text' && {
          content: (element as import('../types/index').TextElement).content,
          textStyle: (element as import('../types/index').TextElement).textStyle,
          richText: (element as import('../types/index').TextElement).richText,
          selectionRange: (element as import('../types/index').TextElement).selectionRange,
        }),
        ...(element.type === 'image' && {
          src: (element as import('../types/index').ImageElement).src,
          naturalWidth: (element as import('../types/index').ImageElement).naturalWidth,
          naturalHeight: (element as import('../types/index').ImageElement).naturalHeight,
          adjustments: (element as import('../types/index').ImageElement).adjustments,
        }),
        ...(element.type === 'group' && {
          children: (element as import('../types/index').GroupElement).children,
        }),
      } as PersistedElement;

      serialized[id] = persistedElement;
    });

    return serialized;
  }

  /**
   * 反序列化持久化的状态
   */
  private deserializeStateFromPersistence(compressedData: string): Partial<CanvasState> {
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
            guidelines: parsedData.viewport.snapping?.guidelines ?? [],
          },
        },
        tool: {
          activeTool: (parsedData.tool?.activeTool as Tool) ?? 'select',
          drawing: false,
          isCreating: false,
        },
        //metadata: parsedData.metadata,
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
    const errorMessage =
      originalError instanceof Error ? originalError.message : String(originalError);

    const recoveryError = new Error(`Data recovery failed: ${errorMessage}`);
    if (originalError instanceof Error) {
      recoveryError.cause = originalError;
    }
    return recoveryError;
  }

  /**
   * 反序列化元素字典
   */
  private deserializeElementsFromPersistence(
    elementsData: Record<string, PersistedElement>,
  ): Record<string, Element> {
    const elements: Record<string, Element> = {};

    console.log('反序列化元素:', {
      elementsDataCount: Object.keys(elementsData).length,
      elementsDataKeys: Object.keys(elementsData),
    });

    Object.entries(elementsData).forEach(([id, elementData]) => {
      try {
        const element = this.deserializeElementFromPersistence(elementData);
        elements[id] = element;
        console.log(`✅ 成功反序列化元素 ${id}:`, { type: element.type });
      } catch (error) {
        console.error(`❌ 反序列化元素失败 ${id}:`, error, elementData);
        // 跳过损坏的元素，继续恢复其他元素
      }
    });

    console.log('反序列化完成:', {
      successCount: Object.keys(elements).length,
      successKeys: Object.keys(elements),
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
      visibility: 'visible' as const,
      lastRenderedAt: Date.now(),
    };

    // 检查图片元素的 src 格式
    if (elementData.type === 'image') {
      const imageElement = elementWithData as unknown as import('../types/index').ImageElement;
      const src = imageElement.src;
      if (typeof src === 'string' && src.startsWith('blob:')) {
        console.warn('⚠️ 恢复的图片元素包含 Blob URL，这可能在页面刷新后失效:', {
          elementId: elementData.id,
          srcPreview: src.substring(0, 50),
        });
        // Blob URL 在页面刷新后失效，无法恢复
        // 这通常意味着持久化时转换失败，或者这是旧数据
      }
    }

    return elementWithData as Element;
  }

  /**
   * 创建快照
   */
  async createSnapshot(isFullSnapshot: boolean = false): Promise<Snapshot> {
    console.log('尝试创建快照');
    if (this.saveStatus === SaveStatus.SAVING) {
      throw new Error('Another save operation is in progress');
    }

    this.saveStatus = SaveStatus.SAVING;

    let snapshot: Snapshot | null = null;
    try {
      const currentState = this.store.getState();
      const state = this.generatePersistableState(currentState); // 同步生成对象，不做 stringify/compress/Blob 转换

      snapshot = {
        id: uuidv4(),
        timestamp: Date.now(),
        data: '', // 先留空，worker 会填充
        isFullSnapshot: isFullSnapshot || this.shouldCreateFullSnapshot(),
        version: this.currentVersion,
        metadata: {
          elementCount: Object.keys(state.elements).length,
          compressedSize: 0,
          memoryUsage: 0,
        },
      };

      this.snapshots.push(snapshot);
      this.lastSaveTime = Date.now();

      // 如果禁用持久化，跳过 worker 处理，直接标记为完成
      if (!this.config.persistenceEnabled) {
        // 标记快照为已完成（不发送到 worker）
        this.pendingSnapshotIds.delete(snapshot.id);
        this.updateSaveStatus();
        // 清理旧的快照
        this.cleanupOldSnapshots();
        return snapshot;
      }

      // 标记快照为待处理状态
      this.pendingSnapshotIds.add(snapshot.id);

      // 把耗时操作完全交给 Worker
      this.worker.postMessage({
        type: 'save',
        snapshotId: snapshot.id,
        state,
        isFullSnapshot: snapshot.isFullSnapshot,
      });

      // 清理旧的快照
      this.cleanupOldSnapshots();

      // 注意：不在这里设置 SAVED，等待 Worker 完成后再更新状态
      // 这样可以避免 race condition：用户刷新时数据还未真正保存
      // 状态会在 Worker 的 onmessage 回调中更新

      return snapshot;
    } catch (error) {
      // 如果出错，清理待处理状态
      if (snapshot) {
        this.pendingSnapshotIds.delete(snapshot.id);
      }
      this.saveStatus = SaveStatus.ERROR;
      this.saveError = error as Error;
      this.updateSaveStatus(); // 更新状态
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

    // 新增：清理持久化存储中的旧记录
    this.cleanupOldDBRecords();

    // 清理撤销栈
    if (this.undoStack.length > this.config.maxUndoSteps) {
      this.undoStack = this.undoStack.slice(-this.config.maxUndoSteps);
    }
  }

  /**
   * 恢复到指定快照
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    this.autoSaveEnabled = false; // 临时禁用自动保存

    // 只从内存中查找快照，不再调用 loadFromStorage（避免循环）
    const snapshot = this.snapshots.find((s) => s.id === snapshotId);

    if (!snapshot) {
      console.warn(`快照 ${snapshotId} 未在内存中找到`);
      this.autoSaveEnabled = true;
      return;
    }

    try {
      const stateData = this.deserializeStateFromPersistence(snapshot.data) as Partial<CanvasState>;
      console.log('恢复历史数据：', stateData);

      // 检查图片元素的 src 格式
      if (stateData.elements) {
        Object.values(stateData.elements).forEach((element) => {
          if (element.type === 'image') {
            const imageElement = element as import('../types/index').ImageElement;
            const src = imageElement.src;
            console.log('📷 恢复的图片元素:', {
              id: element.id,
              srcType:
                typeof src === 'string'
                  ? src.startsWith('blob:')
                    ? 'Blob URL'
                    : src.startsWith('data:')
                      ? 'DataURL'
                      : 'Other'
                  : 'Unknown',
              srcPreview: typeof src === 'string' ? src.substring(0, 100) : src,
            });
          }
        });
      }

      const currentState = this.store.getState();
      console.log('📝 恢复前的状态:', {
        elementsCount: Object.keys(currentState.elements || {}).length,
        currentVersion: this.currentVersion,
      });

      this.currentVersion = snapshot.version;

      // 确保使用新的对象引用，触发订阅
      const prevStateBeforeRestore = this.store.getState();
      console.log('恢复前状态:', {
        elementsCount: Object.keys(prevStateBeforeRestore.elements || {}).length,
        elementsRef: prevStateBeforeRestore.elements,
      });

      // 检查恢复的数据
      console.log('恢复的数据 stateData:', {
        hasElements: !!stateData.elements,
        elementsCount: stateData.elements ? Object.keys(stateData.elements).length : 0,
        elementsKeys: stateData.elements ? Object.keys(stateData.elements) : [],
        stateDataKeys: Object.keys(stateData),
      });

      // 使用函数式更新，确保创建新的对象引用
      this.store.setState((prevState: CanvasState) => {
        const newElements = stateData.elements ? { ...stateData.elements } : prevState.elements;
        console.log('setState 回调中:', {
          prevElementsCount: Object.keys(prevState.elements || {}).length,
          stateDataElementsCount: stateData.elements ? Object.keys(stateData.elements).length : 0,
          newElementsCount: Object.keys(newElements || {}).length,
          newElementsKeys: Object.keys(newElements || {}),
        });

        return {
          ...prevState,
          ...stateData,
          // 确保 elements 是新对象
          elements: newElements,
        };
      });

      // 延迟检查新状态
      setTimeout(() => {
        const newState = this.store.getState();
        console.log('✅ 延迟检查新状态:', {
          elementsCount: Object.keys(newState.elements || {}).length,
          newVersion: snapshot.version,
          stateKeys: Object.keys(newState),
          elementsRef: newState.elements,
        });
      }, 100);
    } catch (error) {
      console.error('恢复快照失败:', error);
      // 不再尝试从备份恢复（避免进一步循环）
    } finally {
      this.autoSaveEnabled = true;
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
        this.store.setState((prevState: CanvasState) => {
          return Object.assign({} as CanvasState, prevState, stateData as Partial<CanvasState>);
        });
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

      // 标记有未保存的更改
      this.hasUnsavedChanges = true;

      // 取消之前的自动保存定时器，确保保存的是最新状态
      this.cancelPendingAutoSave();

      // 重新调度自动保存（防抖）
      this.scheduleAutoSave();
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
   * 检查是否有待处理的快照
   */
  hasPendingSnapshots(): boolean {
    return this.pendingSnapshotIds.size > 0;
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
   * 导出所有历史数据（包括持久化存储中的）
   */
  async exportFullHistory(): Promise<string> {
    await this.loadFromStorage(); // 确保加载了所有数据
    return this.exportHistory();
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
        (s: Snapshot) => s && s.id && s.timestamp && s.data && s.version !== undefined,
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
      // 读取 / 使用 lastSavedVersion，例如打印 /通知 /存储 UI 状态
      console.log(`[HistoryService] lastSavedVersion set to ${this.lastSavedVersion}`);
    } catch (error) {
      console.error('Failed to import history:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`History import failed: ${errorMessage}`);
    }
  }

  /**
   * 页面卸载前的处理
   */
  private handleBeforeUnload(event: BeforeUnloadEvent): void {
    // 如果未启用持久化，不阻止页面关闭
    if (!this.config.persistenceEnabled) {
      return;
    }
    // 如果有待处理的快照或未保存的更改，阻止页面关闭
    if ((this.pendingSnapshotIds.size > 0 || this.hasUnsavedChanges) && this.autoSaveEnabled) {
      // 尝试最后一次保存
      this.forceSave();

      // 提示用户有未保存的更改
      event.preventDefault();
      event.returnValue = '正在保存数据，请稍候...';
    }
  }

  /*
  //序列化用于协同编辑的状态字段
  private serializeStateForCollaboration(state: CanvasState): string {
    const collaborationState = {
      elements: this.serializeElementsForCollaboration(state.elements),
      selectedElementIds: state.selectedElementIds,
      version: this.currentVersion,
      timestamp: Date.now(),
    };

    return JSON.stringify(collaborationState);
  }
  */

  /*
  //序列化元素字典用于协同编辑
  private serializeElementsForCollaboration(
    elements: Record<string, Element>,
  ): Record<string, unknown> {
    const serialized: Record<string, unknown> = {};

    Object.entries(elements).forEach(([id, element]) => {
      serialized[id] = this.serializeElementForCollaboration(element);
    });

    return serialized;
  }
  */

  /*
  //序列化单个元素用于协同编辑
  private serializeElementForCollaboration(element: Element): any {
    // 只包含协同编辑需要的字段
    const result: any = {
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
    };
      // 类型特定的协同字段
    if (element.type === 'text') {
      result.content = (element as any).content;
    } else if (element.type === 'image') {
      result.src = (element as any).src;
    } else if (element.type === 'group') {
      result.children = (element as any).children;
    }
    return result;
  }
  */

  /*
  //处理协同编辑操作
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
  */

  /*
  //合并协同编辑的变更
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
  */

  /*
  //从协同数据创建元素
  private createElementFromCollaborationData(data: any): Element {
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
  */

  /*
   // 过滤只允许协同编辑的字段
   private filterCollaborationFields(data: any): any {
    const filtered: any = {};

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
  */

  /*
  //检查操作依赖是否满足
  private areDependenciesSatisfied(dependencies: string[]): boolean {
    return dependencies.every((depId) => this.snapshots.some((snapshot) => snapshot.id === depId));
  }
   */

  /**
   * 撤销操作
   */
  async undo(): Promise<void> {
    if (this.undoStack.length === 0) {
      console.log('撤销栈为空，无法执行撤销操作');
      return;
    }

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
    if (this.redoStack.length === 0) {
      console.log('重做栈为空，无法执行重做操作');
      return;
    }

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
   * 删除所有持久化存储的数据
   */
  async clearHistory(): Promise<void> {
    try {
      // 清空内存中的快照
      this.snapshots = [];
      this.undoStack = [];
      this.redoStack = [];
      this.currentVersion = 0;

      // 清空 IndexedDB
      if (this.isDBReady && this.config.storageBackend === 'indexeddb' && this.db) {
        const transaction = this.db.transaction(['snapshots'], 'readwrite');
        const store = transaction.objectStore('snapshots');
        await store.clear();
        console.log('IndexedDB storage cleared');
      }

      // 清空 localStorage
      if (this.config.storageBackend === 'localstorage') {
        const index = JSON.parse(localStorage.getItem('canvas-snapshots-index') || '[]');
        index.forEach((item: { id: string }) => {
          localStorage.removeItem(`canvas-snapshot-${item.id}`);
        });
        localStorage.removeItem('canvas-snapshots-index');
        console.log('localStorage cleared');
      }

      // 重置状态
      this.lastSaveTime = 0;
      this.saveStatus = SaveStatus.IDLE;
      this.saveError = null;
      this.lastSavedVersion = 0;
      this.hasUnsavedChanges = false;

      console.log('All persistent storage cleared successfully');
    } catch (error) {
      console.error('Failed to clear persistent storage:', error);
      throw error;
    }
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

  /**
   * 设置是否启用持久化
   */
  setPersistenceEnabled(enabled: boolean): void {
    this.config.persistenceEnabled = enabled;
    this.savePersistencePreference(enabled);
    console.log(`持久化已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 获取持久化状态
   */
  isPersistenceEnabled(): boolean {
    return this.config.persistenceEnabled;
  }

  // 暴露快捷键入口
  public async run(commandId: 'undo' | 'redo' | 'save'): Promise<void> {
    let cmd: Command;
    switch (commandId) {
      case 'undo':
        return this.undo(); // 已有方法
      case 'redo':
        return this.redo();
      case 'save':
        return this.forceSave();
      default:
        throw new Error(`unknown command ${commandId}`);
    }
    return this.executeCommand(cmd);
  }
}
