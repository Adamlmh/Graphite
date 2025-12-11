// interactions/DeleteInteraction.ts
import { useCanvasStore } from '../../stores/canvas-store';
import type { Element } from '../../types/index';
import { eventBus } from '../../lib/eventBus';
import { DeleteCommand, BatchDeleteCommand } from '../command/HistoryCommand';
import type { HistoryService } from '../HistoryService';

export class DeleteInteraction {
  private canvasStore: typeof useCanvasStore;
  private historyService: HistoryService | null = null;

  constructor(historyService?: HistoryService) {
    this.canvasStore = useCanvasStore;
    if (historyService) {
      this.historyService = historyService;
    }
  }

  /**
   * 设置历史服务
   */
  setHistoryService(historyService: HistoryService): void {
    this.historyService = historyService;
  }

  /**
   * 删除选中的元素
   */
  async deleteSelectedElements(): Promise<void> {
    const state = this.canvasStore.getState();
    const selectedElementIds = state.selectedElementIds;

    if (selectedElementIds.length === 0) {
      return;
    }

    // 获取选中的元素
    const selectedElements = selectedElementIds
      .map((id) => state.elements[id])
      .filter((element): element is Element => element !== undefined);

    if (selectedElements.length === 0) {
      return;
    }

    // 如果有历史服务，使用命令模式
    if (this.historyService) {
      await this.deleteElementsWithHistory(selectedElements, selectedElementIds);
    } else {
      // 否则直接删除
      selectedElementIds.forEach((elementId) => {
        this.canvasStore.getState().deleteElement(elementId);
      });
    }

    // 发出删除完成事件
    eventBus.emit('elements:deleted', {
      deletedElementIds: selectedElementIds,
      deletedElements: selectedElements,
    });
  }

  /**
   * 使用历史服务删除元素
   */
  private async deleteElementsWithHistory(
    elements: Element[],
    elementIds: string[],
  ): Promise<void> {
    if (!this.historyService) {
      return;
    }

    try {
      // 创建删除命令
      const command = new DeleteCommand(
        elements,
        elementIds, // 之前的选中状态
        {
          addElement: (element: Element) => this.canvasStore.getState().addElement(element),
          deleteElement: (id: string) => this.canvasStore.getState().deleteElement(id),
          setSelectedElements: (ids: string[]) =>
            this.canvasStore.getState().setSelectedElements(ids),
        },
      );

      // 通过历史服务执行命令
      await this.historyService.executeCommand(command);
    } catch (error) {
      console.error('通过历史服务删除元素失败:', error);
      // 降级处理：直接删除元素
      elementIds.forEach((elementId) => {
        this.canvasStore.getState().deleteElement(elementId);
      });
    }
  }

  /**
   * 删除指定元素
   */
  async deleteElement(elementId: string): Promise<void> {
    const element = this.canvasStore.getState().elements[elementId];

    if (!element) {
      return;
    }

    // 如果有历史服务，使用命令模式
    if (this.historyService) {
      const state = this.canvasStore.getState();
      const previousSelection = state.selectedElementIds;

      await this.deleteElementsWithHistory([element], previousSelection);
    } else {
      // 否则直接删除
      this.canvasStore.getState().deleteElement(elementId);
    }

    // 发出删除完成事件
    eventBus.emit('elements:deleted', {
      deletedElementIds: [elementId],
      deletedElements: [{ id: elementId, element }],
    });
  }

  /**
   * 批量删除元素
   */
  async deleteElements(elementIds: string[]): Promise<void> {
    if (elementIds.length === 0) {
      return;
    }

    const state = this.canvasStore.getState();
    const elements = elementIds
      .map((id) => state.elements[id])
      .filter((element): element is Element => element !== undefined);

    if (elements.length === 0) {
      return;
    }

    // 如果有历史服务，使用命令模式
    if (this.historyService) {
      const previousSelection = state.selectedElementIds;

      try {
        const command = new BatchDeleteCommand(elements, previousSelection, {
          addElement: (element: Element) => this.canvasStore.getState().addElement(element),
          deleteElement: (id: string) => this.canvasStore.getState().deleteElement(id),
          setSelectedElements: (ids: string[]) =>
            this.canvasStore.getState().setSelectedElements(ids),
        });

        await this.historyService.executeCommand(command);
      } catch (error) {
        console.error('通过历史服务批量删除元素失败:', error);
        // 降级处理：直接删除元素
        elementIds.forEach((elementId) => {
          this.canvasStore.getState().deleteElement(elementId);
        });
      }
    } else {
      // 否则直接删除
      elementIds.forEach((elementId) => {
        this.canvasStore.getState().deleteElement(elementId);
      });
    }

    // 发出删除完成事件
    eventBus.emit('elements:deleted', {
      deletedElementIds: elementIds,
      deletedElements: elements.map((element, index) => ({
        id: elementIds[index],
        element,
      })),
    });
  }

  /**
   * 检查是否有选中的元素
   */
  hasSelectedElements(): boolean {
    return this.canvasStore.getState().selectedElementIds.length > 0;
  }

  /**
   * 获取选中的元素数量
   */
  getSelectedElementCount(): number {
    return this.canvasStore.getState().selectedElementIds.length;
  }

  /**
   * 获取选中的元素信息
   */
  getSelectedElementsInfo(): Array<{ id: string; type: string }> {
    const state = this.canvasStore.getState();
    return state.selectedElementIds.map((id) => {
      const element = state.elements[id];
      return {
        id,
        type: element?.type || 'unknown',
      };
    });
  }

  /**
   * 安全删除 - 检查是否在输入框中，避免误删
   */
  async safeDeleteSelectedElements(event?: KeyboardEvent): Promise<boolean> {
    // 如果提供了事件，检查是否在输入框中
    if (event && this.isTypingInInput(event)) {
      return false;
    }

    await this.deleteSelectedElements();
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
   * 清理资源
   */
  dispose(): void {
    // 目前没有需要清理的资源
  }
}
