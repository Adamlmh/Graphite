// commands/HistoryCommand.ts
import { v4 as uuidv4 } from 'uuid';
import type { Command } from '../HistoryService';
import type { Element, Point } from '../../types/index';
// import { useCanvasStore } from '../../stores/canvas-store';

/**
 * 创建元素命令
 * 符合 HistoryService 调用模板规范
 */
export class CreateCommand implements Command {
  id: string;
  type: string = 'create-element';
  timestamp: number;

  private element: Element;

  // 使用泛型参数来避免 any 类型
  private canvasStore: {
    addElement: (element: Element) => void;
    deleteElement: (id: string) => void;
  };

  constructor(
    element: Element,
    canvasStore: {
      addElement: (element: Element) => void;
      deleteElement: (id: string) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.element = JSON.parse(JSON.stringify(element)); // 深拷贝
    this.canvasStore = canvasStore;
  }

  /**
   * 执行命令 - 添加元素到画布
   */
  async execute(): Promise<void> {
    this.canvasStore.addElement(this.element);
    return Promise.resolve();
  }

  /**
   * 撤销命令 - 从画布移除元素
   */
  async undo(): Promise<void> {
    this.canvasStore.deleteElement(this.element.id);
    return Promise.resolve();
  }

  /**
   * 重做命令 - 重新添加元素到画布
   */
  async redo(): Promise<void> {
    this.canvasStore.addElement(this.element);
    return Promise.resolve();
  }

  /**
   * 序列化命令
   */
  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      element: this.element,
    });
  }

  /**
   * 获取命令关联的元素
   */
  getElement(): Element {
    return { ...this.element };
  }

  /**
   * 获取元素ID
   */
  getElementId(): string {
    return this.element.id;
  }
}

/**
 * 创建图片元素命令
 */
export class ImageCommand implements Command {
  id: string;
  type: string = 'create-image';
  timestamp: number;

  private element: Element;

  private canvasStore: {
    addElement: (element: Element) => void;
    deleteElement: (id: string) => void;
  };

  constructor(
    element: Element,
    canvasStore: {
      addElement: (element: Element) => void;
      deleteElement: (id: string) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.element = JSON.parse(JSON.stringify(element)); // 深拷贝
    this.canvasStore = canvasStore;
  }

  /**
   * 执行命令 - 添加图片元素到画布
   */
  async execute(): Promise<void> {
    this.canvasStore.addElement(this.element);
    return Promise.resolve();
  }

  /**
   * 撤销命令 - 从画布移除图片元素
   */
  async undo(): Promise<void> {
    this.canvasStore.deleteElement(this.element.id);
    return Promise.resolve();
  }

  /**
   * 重做命令 - 重新添加图片元素到画布
   */
  async redo(): Promise<void> {
    this.canvasStore.addElement(this.element);
    return Promise.resolve();
  }

  /**
   * 序列化命令
   */
  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      element: this.element,
    });
  }

  /**
   * 获取命令关联的元素
   */
  getElement(): Element {
    return { ...this.element };
  }

  /**
   * 获取元素ID
   */
  getElementId(): string {
    return this.element.id;
  }
}
/**
 * 剪切元素命令
 */
export class CutCommand implements Command {
  id: string;
  type: string = 'cut-elements';
  timestamp: number;

  private elements: Element[];
  private canvasStore: {
    deleteElement: (id: string) => void;
    addElement: (element: Element) => void;
    setSelectedElements: (ids: string[]) => void;
  };
  private previousSelection: string[];

  constructor(
    elements: Element[],
    previousSelection: string[],
    canvasStore: {
      deleteElement: (id: string) => void;
      addElement: (element: Element) => void;
      setSelectedElements: (ids: string[]) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.elements = elements.map((element) => JSON.parse(JSON.stringify(element))); // 深拷贝
    this.previousSelection = [...previousSelection];
    this.canvasStore = canvasStore;
  }

  /**
   * 执行命令 - 剪切元素（删除原元素）
   */
  async execute(): Promise<void> {
    console.log(`CutCommand: 执行剪切命令，删除 ${this.elements.length} 个元素`);

    // 删除原元素
    this.elements.forEach((element) => {
      console.log(`CutCommand: 删除元素 ${element.id}`);
      this.canvasStore.deleteElement(element.id);
    });

    // 清空选中状态
    this.canvasStore.setSelectedElements([]);

    console.log('CutCommand: 剪切命令执行完成');
    return Promise.resolve();
  }

  /**
   * 撤销命令 - 恢复被剪切的元素
   */
  async undo(): Promise<void> {
    console.log(`CutCommand: 撤销剪切命令，恢复 ${this.elements.length} 个元素`);

    // 恢复元素
    this.elements.forEach((element) => {
      console.log(`CutCommand: 恢复元素 ${element.id}`);
      this.canvasStore.addElement(element);
    });

    // 恢复选中状态
    this.canvasStore.setSelectedElements(this.previousSelection);

    console.log('CutCommand: 剪切命令撤销完成');
    return Promise.resolve();
  }

  /**
   * 重做命令 - 重新剪切元素
   */
  async redo(): Promise<void> {
    console.log(`CutCommand: 重做剪切命令，重新剪切 ${this.elements.length} 个元素`);
    await this.execute();
    return Promise.resolve();
  }

  /**
   * 序列化命令
   */
  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      elementCount: this.elements.length,
      previousSelection: this.previousSelection,
    });
  }

  // ... 其他方法保持不变 ...
}

/**
 * 粘贴元素命令
 * 符合 HistoryService 调用模板规范
 */
export class PasteCommand implements Command {
  id: string;
  type: string = 'paste-elements';
  timestamp: number;

  private elements: Element[];
  private originalClipboard: Element[]; // 原始剪贴板内容
  private canvasStore: {
    addElement: (element: Element) => void;
    deleteElement: (id: string) => void;
    setSelectedElements: (ids: string[]) => void;
    clearSelection: () => void;
  };
  private pastePosition: { x: number; y: number };

  constructor(
    elements: Element[],
    originalClipboard: Element[],
    pastePosition: { x: number; y: number },
    canvasStore: {
      addElement: (element: Element) => void;
      deleteElement: (id: string) => void;
      setSelectedElements: (ids: string[]) => void;
      clearSelection: () => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.elements = elements.map((element) => JSON.parse(JSON.stringify(element))); // 深拷贝
    this.originalClipboard = originalClipboard.map((element) =>
      JSON.parse(JSON.stringify(element)),
    ); // 深拷贝
    this.pastePosition = { ...pastePosition };
    this.canvasStore = canvasStore;
  }

  /**
   * 执行命令 - 粘贴元素
   */
  async execute(): Promise<void> {
    console.log(`PasteCommand: 执行粘贴命令，添加 ${this.elements.length} 个元素`);

    // 添加新元素
    this.elements.forEach((element) => {
      console.log(`PasteCommand: 添加元素 ${element.id} (x: ${element.x}, y: ${element.y})`);
      this.canvasStore.addElement(element);
    });

    // 选中新粘贴的元素
    const newElementIds = this.elements.map((element) => element.id);
    this.canvasStore.setSelectedElements(newElementIds);

    console.log('PasteCommand: 粘贴命令执行完成');
    return Promise.resolve();
  }

  /**
   * 撤销命令 - 删除粘贴的元素
   */
  async undo(): Promise<void> {
    console.log(`PasteCommand: 撤销粘贴命令，删除 ${this.elements.length} 个元素`);

    // 删除粘贴的元素
    this.elements.forEach((element) => {
      console.log(`PasteCommand: 删除元素 ${element.id}`);
      this.canvasStore.deleteElement(element.id);
    });

    // 清空选中状态
    this.canvasStore.clearSelection();

    console.log('PasteCommand: 粘贴命令撤销完成');
    return Promise.resolve();
  }

  /**
   * 重做命令 - 重新粘贴元素
   */
  async redo(): Promise<void> {
    console.log(`PasteCommand: 重做粘贴命令，重新粘贴 ${this.elements.length} 个元素`);
    await this.execute();
    return Promise.resolve();
  }

  /**
   * 序列化命令
   */
  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      elementCount: this.elements.length,
      pastePosition: this.pastePosition,
    });
  }
}

export class DeleteCommand implements Command {
  id: string;
  type: string = 'delete-elements';
  timestamp: number;

  private elements: Element[];
  private canvasStore: {
    addElement: (element: Element) => void;
    deleteElement: (id: string) => void;
    setSelectedElements: (ids: string[]) => void;
  };
  private previousSelection: string[];

  constructor(
    elements: Element[],
    previousSelection: string[],
    canvasStore: {
      addElement: (element: Element) => void;
      deleteElement: (id: string) => void;
      setSelectedElements: (ids: string[]) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.elements = elements.map((element) => JSON.parse(JSON.stringify(element))); // 深拷贝
    this.previousSelection = [...previousSelection];
    this.canvasStore = canvasStore;
  }

  /**
   * 执行命令 - 删除元素
   */
  async execute(): Promise<void> {
    // 删除元素
    this.elements.forEach((element) => {
      this.canvasStore.deleteElement(element.id);
    });

    // 清空选中状态
    this.canvasStore.setSelectedElements([]);
    return Promise.resolve();
  }

  /**
   * 撤销命令 - 恢复被删除的元素
   */
  async undo(): Promise<void> {
    // 恢复元素
    this.elements.forEach((element) => {
      this.canvasStore.addElement(element);
    });

    // 恢复选中状态
    this.canvasStore.setSelectedElements(this.previousSelection);
    return Promise.resolve();
  }

  /**
   * 重做命令 - 重新删除元素
   */
  async redo(): Promise<void> {
    await this.execute();
    return Promise.resolve();
  }

  /**
   * 序列化命令
   */
  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      elementCount: this.elements.length,
      previousSelection: this.previousSelection,
    });
  }

  /**
   * 获取被删除的元素
   */
  getElements(): Element[] {
    return this.elements.map((element) => ({ ...element }));
  }
}

/**
 * 批量删除命令
 */
export class BatchDeleteCommand implements Command {
  id: string;
  type: string = 'batch-delete-elements';
  timestamp: number;

  private deleteOperations: Array<{
    element: Element;
    originalIndex?: number;
  }>;
  private canvasStore: {
    addElement: (element: Element) => void;
    deleteElement: (id: string) => void;
    setSelectedElements: (ids: string[]) => void;
  };
  private previousSelection: string[];

  constructor(
    elements: Element[],
    previousSelection: string[],
    canvasStore: {
      addElement: (element: Element) => void;
      deleteElement: (id: string) => void;
      setSelectedElements: (ids: string[]) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.deleteOperations = elements.map((element) => ({
      element: JSON.parse(JSON.stringify(element)), // 深拷贝
    }));
    this.previousSelection = [...previousSelection];
    this.canvasStore = canvasStore;
  }

  async execute(): Promise<void> {
    // 删除所有元素
    this.deleteOperations.forEach((operation) => {
      this.canvasStore.deleteElement(operation.element.id);
    });

    // 清空选中状态
    this.canvasStore.setSelectedElements([]);
    return Promise.resolve();
  }

  async undo(): Promise<void> {
    // 恢复所有元素
    this.deleteOperations.forEach((operation) => {
      this.canvasStore.addElement(operation.element);
    });

    // 恢复选中状态
    this.canvasStore.setSelectedElements(this.previousSelection);
    return Promise.resolve();
  }

  async redo(): Promise<void> {
    await this.execute();
    return Promise.resolve();
  }

  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      operationCount: this.deleteOperations.length,
      previousSelection: this.previousSelection,
    });
  }
}
export class MoveCommand implements Command {
  id: string;
  type: string = 'move-elements';
  timestamp: number;

  private elementMovements: Array<{
    elementId: string;
    oldPosition: Point;
    newPosition: Point;
  }>;

  private canvasStore: {
    updateElement: (id: string, updates: Partial<Element>) => void;
    updateElements: (updates: Array<{ id: string; updates: Partial<Element> }>) => void;
  };

  constructor(
    elementMovements: Array<{
      elementId: string;
      oldPosition: Point;
      newPosition: Point;
    }>,
    canvasStore: {
      updateElement: (id: string, updates: Partial<Element>) => void;
      updateElements: (updates: Array<{ id: string; updates: Partial<Element> }>) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.elementMovements = JSON.parse(JSON.stringify(elementMovements)); // 深拷贝
    this.canvasStore = canvasStore;
  }

  /**
   * 执行命令 - 移动元素到新位置
   */
  async execute(): Promise<void> {
    const updates = this.elementMovements.map((movement) => ({
      id: movement.elementId,
      updates: {
        x: movement.newPosition.x,
        y: movement.newPosition.y,
      },
    }));

    if (updates.length > 0) {
      this.canvasStore.updateElements(updates);
    }

    return Promise.resolve();
  }

  /**
   * 撤销命令 - 移动元素回原始位置
   */
  async undo(): Promise<void> {
    const updates = this.elementMovements.map((movement) => ({
      id: movement.elementId,
      updates: {
        x: movement.oldPosition.x,
        y: movement.oldPosition.y,
      },
    }));

    if (updates.length > 0) {
      this.canvasStore.updateElements(updates);
    }

    return Promise.resolve();
  }

  /**
   * 重做命令 - 重新移动元素
   */
  async redo(): Promise<void> {
    await this.execute();
    return Promise.resolve();
  }

  /**
   * 序列化命令
   */
  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      elementMovements: this.elementMovements,
    });
  }

  /**
   * 获取移动的元素数量
   */
  getMovementCount(): number {
    return this.elementMovements.length;
  }
}

/**
 * 调整大小/旋转命令
 */
export class ResizeCommand implements Command {
  id: string;
  type: string = 'resize-elements';
  timestamp: number;

  private elementResizes: Array<{
    elementId: string;
    oldState: Partial<Element> & {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
    };
    newState: Partial<Element> & {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
    };
  }>;

  private canvasStore: {
    updateElement: (id: string, updates: Partial<Element>) => void;
    updateElements: (updates: Array<{ id: string; updates: Partial<Element> }>) => void;
  };

  constructor(
    elementResizes: Array<{
      elementId: string;
      oldState: Partial<Element> & {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation?: number;
      };
      newState: Partial<Element> & {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation?: number;
      };
    }>,
    canvasStore: {
      updateElement: (id: string, updates: Partial<Element>) => void;
      updateElements: (updates: Array<{ id: string; updates: Partial<Element> }>) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.elementResizes = JSON.parse(JSON.stringify(elementResizes));
    this.canvasStore = canvasStore;
  }

  async execute(): Promise<void> {
    const updates = this.elementResizes.map(({ elementId, newState }) => ({
      id: elementId,
      updates: newState,
    }));
    if (updates.length > 0) {
      this.canvasStore.updateElements(updates);
    }
    return Promise.resolve();
  }

  async undo(): Promise<void> {
    const updates = this.elementResizes.map(({ elementId, oldState }) => ({
      id: elementId,
      updates: oldState,
    }));
    if (updates.length > 0) {
      this.canvasStore.updateElements(updates);
    }
    return Promise.resolve();
  }

  async redo(): Promise<void> {
    await this.execute();
    return Promise.resolve();
  }

  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      elementResizes: this.elementResizes,
    });
  }
}

/**
 * 打组命令
 */
export class GroupCommand implements Command {
  id: string;
  type: string = 'group-elements';
  timestamp: number;

  private elementIds: string[];
  private groupElement: Element;
  private childElements: Element[]; // 保存子元素的原始状态
  private previousSelection: string[];
  private canvasStore: {
    addElement: (element: Element) => void;
    deleteElement: (id: string) => void;
    updateElement: (id: string, updates: Partial<Element>) => void;
    setSelectedElements: (ids: string[]) => void;
  };

  constructor(
    elementIds: string[],
    groupElement: Element,
    childElements: Element[],
    previousSelection: string[],
    canvasStore: {
      addElement: (element: Element) => void;
      deleteElement: (id: string) => void;
      updateElement: (id: string, updates: Partial<Element>) => void;
      setSelectedElements: (ids: string[]) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.elementIds = [...elementIds];
    this.groupElement = JSON.parse(JSON.stringify(groupElement)); // 深拷贝
    this.childElements = childElements.map((el) => JSON.parse(JSON.stringify(el))); // 深拷贝
    this.previousSelection = [...previousSelection];
    this.canvasStore = canvasStore;
  }

  /**
   * 执行命令 - 打组
   */
  async execute(): Promise<void> {
    // 更新子元素的 parentId
    this.elementIds.forEach((id) => {
      this.canvasStore.updateElement(id, {
        parentId: this.groupElement.id,
      });
    });

    // 添加组合元素
    this.canvasStore.addElement(this.groupElement);

    // 选中组合元素
    this.canvasStore.setSelectedElements([this.groupElement.id]);

    return Promise.resolve();
  }

  /**
   * 撤销命令 - 解组
   */
  async undo(): Promise<void> {
    // 恢复子元素的 parentId
    this.childElements.forEach((child) => {
      this.canvasStore.updateElement(child.id, {
        parentId: child.parentId,
      });
    });

    // 删除组合元素
    this.canvasStore.deleteElement(this.groupElement.id);

    // 恢复选中状态
    this.canvasStore.setSelectedElements(this.previousSelection);

    return Promise.resolve();
  }

  /**
   * 重做命令 - 重新打组
   */
  async redo(): Promise<void> {
    await this.execute();
    return Promise.resolve();
  }

  /**
   * 序列化命令
   */
  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      elementIds: this.elementIds,
      groupElementId: this.groupElement.id,
      childCount: this.childElements.length,
      previousSelection: this.previousSelection,
    });
  }
}

/**
 * 解组命令
 */
export class UngroupCommand implements Command {
  id: string;
  type: string = 'ungroup-elements';
  timestamp: number;

  private groupElement: Element;
  private childElements: Element[]; // 保存子元素的原始状态（包含 parentId）
  private previousSelection: string[];
  private canvasStore: {
    addElement: (element: Element) => void;
    deleteElement: (id: string) => void;
    updateElement: (id: string, updates: Partial<Element>) => void;
    setSelectedElements: (ids: string[]) => void;
  };

  constructor(
    groupElement: Element,
    childElements: Element[],
    previousSelection: string[],
    canvasStore: {
      addElement: (element: Element) => void;
      deleteElement: (id: string) => void;
      updateElement: (id: string, updates: Partial<Element>) => void;
      setSelectedElements: (ids: string[]) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.groupElement = JSON.parse(JSON.stringify(groupElement)); // 深拷贝
    this.childElements = childElements.map((el) => JSON.parse(JSON.stringify(el))); // 深拷贝
    this.previousSelection = [...previousSelection];
    this.canvasStore = canvasStore;
  }

  /**
   * 执行命令 - 解组
   */
  async execute(): Promise<void> {
    // 恢复子元素的 parentId
    this.childElements.forEach((child) => {
      this.canvasStore.updateElement(child.id, {
        parentId: child.parentId,
      });
    });

    // 删除组合元素
    this.canvasStore.deleteElement(this.groupElement.id);

    // 选中子元素
    const childIds = this.childElements.map((child) => child.id);
    this.canvasStore.setSelectedElements(childIds);

    return Promise.resolve();
  }

  /**
   * 撤销命令 - 重新打组
   */
  async undo(): Promise<void> {
    // 恢复子元素的 parentId 为 groupId
    this.childElements.forEach((child) => {
      this.canvasStore.updateElement(child.id, {
        parentId: this.groupElement.id,
      });
    });

    // 恢复组合元素
    this.canvasStore.addElement(this.groupElement);

    // 恢复选中状态
    this.canvasStore.setSelectedElements(this.previousSelection);

    return Promise.resolve();
  }

  /**
   * 重做命令 - 重新解组
   */
  async redo(): Promise<void> {
    await this.execute();
    return Promise.resolve();
  }

  /**
   * 序列化命令
   */
  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      groupElementId: this.groupElement.id,
      childCount: this.childElements.length,
      previousSelection: this.previousSelection,
    });
  }
}

export class AttributeChangeCommand implements Command {
  id: string;
  type: string = 'attribute-change';
  timestamp: number;

  private targetId: string;
  private attributeName: string;
  private oldValue: unknown;
  private newValue: unknown;

  private canvasStore: {
    updateElement: (id: string, updates: Partial<Element>) => void;
  };

  constructor(
    targetId: string,
    attributeName: string,
    oldValue: unknown,
    newValue: unknown,
    canvasStore: {
      updateElement: (id: string, updates: Partial<Element>) => void;
    },
  ) {
    this.id = uuidv4();
    this.timestamp = Date.now();
    this.targetId = targetId;
    this.attributeName = attributeName;
    this.oldValue = JSON.parse(JSON.stringify(oldValue));
    this.newValue = JSON.parse(JSON.stringify(newValue));
    this.canvasStore = canvasStore;
  }

  async execute(): Promise<void> {
    this.canvasStore.updateElement(this.targetId, {
      [this.attributeName]: this.newValue,
    } as Partial<Element>);
    return Promise.resolve();
  }

  async undo(): Promise<void> {
    this.canvasStore.updateElement(this.targetId, {
      [this.attributeName]: this.oldValue,
    } as Partial<Element>);
    return Promise.resolve();
  }

  async redo(): Promise<void> {
    await this.execute();
    return Promise.resolve();
  }

  serialize(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      targetId: this.targetId,
      attributeName: this.attributeName as string,
    });
  }

  // === 提供合并支持的辅助方法 ===
  getTargetId(): string {
    return this.targetId;
  }

  getAttributeName(): string {
    return this.attributeName;
  }

  getNewValue(): unknown {
    return this.newValue;
  }

  setNewValue(value: unknown): void {
    this.newValue = JSON.parse(JSON.stringify(value));
  }
}
