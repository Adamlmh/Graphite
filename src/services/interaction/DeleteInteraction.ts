// interactions/DeleteInteraction.ts
import { useCanvasStore } from '../../stores/canvas-store';
// import type { CanvasState } from '../../stores/canvas-store';
// import type { Element } from '../../types/index';
import { eventBus } from '../../lib/eventBus';

export class DeleteInteraction {
  private canvasStore: typeof useCanvasStore;

  constructor() {
    this.canvasStore = useCanvasStore;
  }

  /**
   * 删除选中的元素
   */
  deleteSelectedElements(): void {
    const state = this.canvasStore.getState();
    const selectedElementIds = state.selectedElementIds;

    if (selectedElementIds.length === 0) {
      console.log('DeleteInteraction: 没有选中的元素可删除');
      return;
    }

    console.log('DeleteInteraction: 开始删除选中的元素', selectedElementIds);

    // 保存被删除元素的信息（用于撤销操作）
    const deletedElements = selectedElementIds.map((id) => ({
      id,
      element: state.elements[id],
    }));

    // 批量删除选中的元素
    selectedElementIds.forEach((elementId) => {
      this.canvasStore.getState().deleteElement(elementId);
    });

    console.log('DeleteInteraction: 成功删除', selectedElementIds.length, '个元素');

    // 发出删除完成事件
    eventBus.emit('elements:deleted', {
      deletedElementIds: selectedElementIds,
      deletedElements: deletedElements,
    });
  }

  /**
   * 删除指定元素
   */
  deleteElement(elementId: string): void {
    const element = this.canvasStore.getState().elements[elementId];

    if (!element) {
      console.warn('DeleteInteraction: 要删除的元素不存在', elementId);
      return;
    }

    this.canvasStore.getState().deleteElement(elementId);
    console.log('DeleteInteraction: 删除元素', elementId, element.type);

    // 发出删除完成事件
    eventBus.emit('elements:deleted', {
      deletedElementIds: [elementId],
      deletedElements: [{ id: elementId, element }],
    });
  }

  /**
   * 批量删除元素
   */
  deleteElements(elementIds: string[]): void {
    if (elementIds.length === 0) {
      return;
    }

    console.log('DeleteInteraction: 批量删除元素', elementIds);

    const state = this.canvasStore.getState();
    const deletedElements = elementIds.map((id) => ({
      id,
      element: state.elements[id],
    }));

    elementIds.forEach((elementId) => {
      this.deleteElement(elementId);
    });

    // 发出删除完成事件
    eventBus.emit('elements:deleted', {
      deletedElementIds: elementIds,
      deletedElements: deletedElements,
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
   * 获取选中的元素信息（用于调试）
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
  safeDeleteSelectedElements(event?: KeyboardEvent): boolean {
    // 如果提供了事件，检查是否在输入框中
    if (event && this.isTypingInInput(event)) {
      console.log('DeleteInteraction: 在输入框中，不执行删除');
      return false;
    }

    this.deleteSelectedElements();
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
export const deleteInteraction = new DeleteInteraction();
