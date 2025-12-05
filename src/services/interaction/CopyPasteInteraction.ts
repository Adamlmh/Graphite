// interactions/CopyPasteInteraction.ts
import { ElementFactory } from '../element-factory';
import { useCanvasStore } from '../../stores/canvas-store';
import type { CanvasState } from '../../stores/canvas-store';
import type { Element, Point } from '../../types/index';
import { eventBus } from '../../lib/eventBus';
import type { CanvasEvent } from '../../lib/EventBridge';
import type { HistoryService } from '../HistoryService';
import { CutCommand, PasteCommand } from '../command/HistoryCommand';
import { historyService } from '../../services/instances';

export class CopyPasteInteraction {
  private canvasStore: typeof useCanvasStore;
  private clipboard: Element[] = []; // 剪贴板，存储复制的元素
  private pasteOffset: number = 10; // 粘贴时的偏移量，避免完全重叠
  private lastMousePosition: Point | null = null; // 记录鼠标位置
  private hasMouseClick: boolean = false; // 标记是否有鼠标点击
  private historyService: HistoryService | null = null;

  constructor(historyService?: HistoryService) {
    this.canvasStore = useCanvasStore;
    this.historyService = historyService || null;

    console.log('CopyPasteInteraction: 构造函数被调用', {
      hasHistoryService: !!historyService,
      historyService: historyService,
      instance: this,
    });

    this.setupEventListeners();
  }

  /**
   * 设置历史服务
   */
  setHistoryService(historyService: HistoryService): void {
    this.historyService = historyService;
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听鼠标移动和点击事件
    eventBus.on('pointermove', this.handlePointerMove as (payload: unknown) => void);
    eventBus.on('pointerdown', this.handlePointerDown as (payload: unknown) => void);
  }

  /**
   * 处理鼠标移动事件
   */
  private handlePointerMove = (event: CanvasEvent): void => {
    // 记录鼠标位置（世界坐标）
    this.lastMousePosition = {
      x: event.world.x,
      y: event.world.y,
    };
  };

  /**
   * 处理鼠标点击事件
   */
  private handlePointerDown = (event: CanvasEvent): void => {
    // 标记有鼠标点击
    this.hasMouseClick = true;

    // 更新鼠标位置
    this.lastMousePosition = {
      x: event.world.x,
      y: event.world.y,
    };
  };

  /**
   * 复制选中的元素到剪贴板
   */
  copySelectedElements(): void {
    const state = this.canvasStore.getState();
    const selectedElementIds = state.selectedElementIds;

    if (selectedElementIds.length === 0) {
      console.log('CopyPasteInteraction: 没有选中的元素可复制');
      return;
    }

    // 深拷贝选中的元素到剪贴板
    this.clipboard = selectedElementIds.map((id) => {
      const element = state.elements[id];
      return JSON.parse(JSON.stringify(element)); // 简单深拷贝
    });

    console.log('CopyPasteInteraction: 复制了', this.clipboard.length, '个元素到剪贴板');

    // 发出复制完成事件
    eventBus.emit('elements:copied', {
      copiedElementIds: selectedElementIds,
      copiedCount: this.clipboard.length,
    });
  }

  /**
   * 剪切选中的元素到剪贴板
   */
  /**
   * 剪切选中的元素到剪贴板
   */
  async cutSelectedElements(): Promise<void> {
    const state = this.canvasStore.getState();
    const selectedElementIds = state.selectedElementIds;

    if (selectedElementIds.length === 0) {
      console.log('CopyPasteInteraction: 没有选中的元素可剪切');
      return;
    }

    // 获取要剪切的元素（深拷贝）
    const elementsToCut = selectedElementIds.map((id) => {
      const element = state.elements[id];
      return JSON.parse(JSON.stringify(element));
    });

    // 记录当前的选中状态
    const previousSelection = [...selectedElementIds];

    // 复制到剪贴板
    this.clipboard = [...elementsToCut];

    // 如果有历史服务，使用命令模式
    if (this.historyService) {
      try {
        // 创建剪切命令
        const command = new CutCommand(elementsToCut, previousSelection, {
          // getState: () => this.canvasStore.getState(),
          deleteElement: (id: string) => this.canvasStore.getState().deleteElement(id),
          addElement: (element: Element) => this.canvasStore.getState().addElement(element),
          setSelectedElements: (ids: string[]) =>
            this.canvasStore.getState().setSelectedElements(ids),
        });

        console.log('CopyPasteInteraction: 准备执行剪切命令，元素数量:', elementsToCut.length);

        // 通过历史服务执行命令
        await this.historyService.executeCommand(command);

        console.log('CopyPasteInteraction: 剪切命令执行成功');
      } catch (error) {
        console.error('通过历史服务剪切元素失败:', error);
        // 降级处理：直接剪切
        console.log('CopyPasteInteraction: 使用降级处理，直接剪切');
        selectedElementIds.forEach((elementId) => {
          this.canvasStore.getState().deleteElement(elementId);
        });
      }
    } else {
      // 没有历史服务，直接操作
      console.log('CopyPasteInteraction: 没有历史服务，直接剪切');
      selectedElementIds.forEach((elementId) => {
        this.canvasStore.getState().deleteElement(elementId);
      });
    }

    console.log('CopyPasteInteraction: 剪切了', selectedElementIds.length, '个元素');

    // 发出剪切完成事件
    eventBus.emit('elements:cut', {
      cutElementIds: selectedElementIds,
      cutCount: selectedElementIds.length,
    });
  }

  /**
   * 从剪贴板粘贴元素
   */
  async pasteElements(): Promise<void> {
    if (this.clipboard.length === 0) {
      console.log('CopyPasteInteraction: 剪贴板为空，无法粘贴');
      return;
    }

    // 计算粘贴位置
    const pastePosition = this.calculatePastePosition();

    // 创建要粘贴的元素
    const newElements: Element[] = this.createPasteElements(pastePosition);

    if (newElements.length === 0) {
      console.log('CopyPasteInteraction: 创建粘贴元素失败');
      return;
    }

    console.log(
      'CopyPasteInteraction: 准备粘贴',
      newElements.length,
      '个元素到位置',
      pastePosition,
    );

    // 如果有历史服务，使用命令模式
    if (this.historyService) {
      try {
        // 创建粘贴命令
        const command = new PasteCommand(newElements, this.clipboard, pastePosition, {
          // getState: () => this.canvasStore.getState(),
          addElement: (element: Element) => this.canvasStore.getState().addElement(element),
          deleteElement: (id: string) => this.canvasStore.getState().deleteElement(id),
          setSelectedElements: (ids: string[]) =>
            this.canvasStore.getState().setSelectedElements(ids),
          clearSelection: () => this.canvasStore.getState().clearSelection(),
        });

        console.log('CopyPasteInteraction: 准备执行粘贴命令');

        // 通过历史服务执行命令
        await this.historyService.executeCommand(command);

        console.log('CopyPasteInteraction: 粘贴命令执行成功');
      } catch (error) {
        console.error('通过历史服务粘贴元素失败:', error);
        // 降级处理：直接粘贴
        console.log('CopyPasteInteraction: 使用降级处理，直接粘贴');
        this.pasteElementsDirectly(newElements, pastePosition);
      }
    } else {
      // 没有历史服务，直接粘贴
      console.log('CopyPasteInteraction: 没有历史服务，直接粘贴');
      this.pasteElementsDirectly(newElements, pastePosition);
    }

    // 重置鼠标点击标记
    this.hasMouseClick = false;
  }

  /**
   * 直接粘贴元素（无历史记录）
   */
  private pasteElementsDirectly(newElements: Element[], pastePosition: Point): void {
    // 批量添加新元素
    newElements.forEach((element) => {
      this.canvasStore.getState().addElement(element);
    });

    // 选中新粘贴的元素
    const newElementIds = newElements.map((element) => element.id);
    this.canvasStore.getState().setSelectedElements(newElementIds);

    console.log('CopyPasteInteraction: 粘贴了', newElements.length, '个元素到位置', pastePosition);

    // 发出粘贴完成事件
    eventBus.emit('elements:pasted', {
      pastedElementIds: newElementIds,
      pastedCount: newElements.length,
      sourceElementIds: this.clipboard.map((el) => el.id),
      pastePosition: pastePosition,
    });
  }

  /**
   * 计算粘贴位置
   */
  private calculatePastePosition(): Point {
    // 如果有鼠标点击，使用鼠标位置
    if (this.hasMouseClick && this.lastMousePosition) {
      console.log('CopyPasteInteraction: 使用鼠标点击位置粘贴');
      return this.lastMousePosition;
    }

    // 否则基于选中元素的位置偏移
    const state = this.canvasStore.getState();

    if (state.selectedElementIds.length > 0) {
      const lastSelectedId = state.selectedElementIds[state.selectedElementIds.length - 1];
      const lastElement = state.elements[lastSelectedId];
      if (lastElement) {
        console.log('CopyPasteInteraction: 使用选中元素偏移位置粘贴');
        return {
          x: lastElement.x + this.pasteOffset,
          y: lastElement.y + this.pasteOffset,
        };
      }
    }

    // 最后使用视口中心
    const viewport = state.viewport;
    console.log('CopyPasteInteraction: 使用视口中心位置粘贴');
    return {
      x: -viewport.offset.x / viewport.zoom + this.pasteOffset,
      y: -viewport.offset.y / viewport.zoom + this.pasteOffset,
    };
  }

  /**
   * 创建粘贴元素（复制并生成新ID）
   */
  private createPasteElements(basePosition: Point): Element[] {
    const newElements: Element[] = [];

    // 获取剪贴板内容的中心点
    const clipboardCenter = this.getClipboardCenter();

    this.clipboard.forEach((originalElement, index) => {
      try {
        // 计算这个元素相对于原组的位置偏移
        const offsetX = originalElement.x - clipboardCenter.x;
        const offsetY = originalElement.y - clipboardCenter.y;

        // 创建新元素，使用新的ID
        const newElement = {
          ...originalElement,
          id: ElementFactory['generateId'](), // 使用元素工厂的ID生成方法
          x: basePosition.x + offsetX,
          y: basePosition.y + offsetY,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        };

        newElements.push(newElement);
      } catch (error) {
        console.error('CopyPasteInteraction: 创建粘贴元素失败', error, originalElement);
      }
    });

    return newElements;
  }

  /**
   * 获取剪贴板内容的中心点
   */
  private getClipboardCenter(): Point {
    if (this.clipboard.length === 0) {
      return { x: 0, y: 0 };
    }

    const sumX = this.clipboard.reduce((sum, element) => sum + element.x, 0);
    const sumY = this.clipboard.reduce((sum, element) => sum + element.y, 0);

    return {
      x: sumX / this.clipboard.length,
      y: sumY / this.clipboard.length,
    };
  }

  /**
   * 复制指定元素（不选中）
   */
  copyElements(elementIds: string[]): void {
    const state = this.canvasStore.getState();

    if (elementIds.length === 0) {
      return;
    }

    this.clipboard = elementIds.map((id) => {
      const element = state.elements[id];
      return JSON.parse(JSON.stringify(element));
    });

    console.log('CopyPasteInteraction: 复制了指定元素', this.clipboard.length, '个');
  }

  /**
   * 检查剪贴板是否有内容
   */
  hasClipboardContent(): boolean {
    return this.clipboard.length > 0;
  }

  /**
   * 获取剪贴板内容信息
   */
  getClipboardInfo(): { count: number; types: string[] } {
    const types = this.clipboard.map((element) => element.type);
    const uniqueTypes = Array.from(new Set(types));

    return {
      count: this.clipboard.length,
      types: uniqueTypes,
    };
  }

  /**
   * 清空剪贴板
   */
  clearClipboard(): void {
    this.clipboard = [];
    this.hasMouseClick = false;
    console.log('CopyPasteInteraction: 剪贴板已清空');
  }

  /**
   * 检查是否有选中的元素可复制
   */
  hasSelectedElements(): boolean {
    return this.canvasStore.getState().selectedElementIds.length > 0;
  }

  /**
   * 获取选中元素数量
   */
  getSelectedElementCount(): number {
    return this.canvasStore.getState().selectedElementIds.length;
  }

  /**
   * 设置鼠标位置（供外部调用）
   */
  setMousePosition(position: Point): void {
    this.lastMousePosition = position;
  }

  /**
   * 标记鼠标点击
   */
  markMouseClick(position: Point): void {
    this.hasMouseClick = true;
    this.lastMousePosition = position;
  }

  /**
   * 安全复制 - 检查是否在输入框中
   */
  safeCopySelectedElements(event?: KeyboardEvent): boolean {
    if (event && this.isTypingInInput(event)) {
      console.log('CopyPasteInteraction: 在输入框中，不执行复制');
      return false;
    }

    this.copySelectedElements();
    return true;
  }

  /**
   * 安全剪切 - 检查是否在输入框中
   */
  async safeCutSelectedElements(event?: KeyboardEvent): Promise<boolean> {
    if (event && this.isTypingInInput(event)) {
      console.log('CopyPasteInteraction: 在输入框中，不执行剪切');
      return false;
    }

    await this.cutSelectedElements();
    return true;
  }

  /**
   * 安全粘贴 - 检查是否在输入框中
   */
  async safePasteElements(event?: KeyboardEvent): Promise<boolean> {
    if (event && this.isTypingInInput(event)) {
      console.log('CopyPasteInteraction: 在输入框中，不执行粘贴');
      return false;
    }

    await this.pasteElements();
    return true;
  }

  /**
   * 检查是否在输入框中
   */
  private isTypingInInput(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    if (!target) return false;

    const tagName = target.tagName.toLowerCase();
    const isInput = tagName === 'input' || tagName === 'textarea';
    const isContentEditable = target.getAttribute('contenteditable') === 'true';

    return isInput || isContentEditable;
  }

  /**
   * 获取当前鼠标位置
   */
  getLastMousePosition(): Point | null {
    return this.lastMousePosition;
  }

  /**
   * 检查是否有鼠标点击
   */
  hasMouseClickOccurred(): boolean {
    return this.hasMouseClick;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.clearClipboard();
    eventBus.off('pointermove', this.handlePointerMove as (payload: unknown) => void);
    eventBus.off('pointerdown', this.handlePointerDown as (payload: unknown) => void);
  }
}
