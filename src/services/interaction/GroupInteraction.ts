// interactions/GroupInteraction.ts
import { useCanvasStore } from '../../stores/canvas-store';
import type { Element, GroupElement } from '../../types/index';
import { isGroupElement } from '../../types/index';
import { eventBus } from '../../lib/eventBus';
import { GroupCommand, UngroupCommand } from '../command/HistoryCommand';
import type { HistoryService } from '../HistoryService';
import { groupElements, ungroup } from '../group-service';
import { computeElementsBounds } from '../GroupService';
import { ElementFactory } from '../element-factory';

export class GroupInteraction {
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
   * 打组选中的元素
   */
  async groupSelectedElements(): Promise<void> {
    const state = this.canvasStore.getState();
    const selectedElementIds = state.selectedElementIds;

    // 至少需要2个元素才能打组
    if (selectedElementIds.length < 2) {
      console.warn('打组需要至少选择2个元素');
      return;
    }

    // 过滤掉组合元素（不能将组合元素作为子元素）
    const elements = selectedElementIds
      .map((id) => state.elements[id])
      .filter((element): element is Element => {
        if (!element) return false;
        // 排除组合元素
        if (isGroupElement(element)) {
          return false;
        }
        return true;
      });

    if (elements.length < 2) {
      console.warn('打组需要至少2个非组合元素');
      return;
    }

    const elementIds = elements.map((el) => el.id);

    // 如果有历史服务，使用命令模式
    if (this.historyService) {
      await this.groupElementsWithHistory(elementIds, selectedElementIds);
    } else {
      // 否则直接打组
      const group = groupElements(elementIds);
      this.canvasStore.getState().setSelectedElements([group.id]);
    }

    // 发出打组完成事件
    eventBus.emit('elements:grouped', {
      elementIds,
    });
  }

  /**
   * 使用历史服务打组元素
   */
  private async groupElementsWithHistory(
    elementIds: string[],
    previousSelection: string[],
  ): Promise<void> {
    if (!this.historyService) {
      return;
    }

    try {
      const state = this.canvasStore.getState();
      const elements = elementIds
        .map((id) => state.elements[id])
        .filter((el): el is Element => el !== undefined);

      // 计算整体边界
      const bounds = computeElementsBounds(elements);
      if (!bounds) {
        throw new Error('无法组合：无法计算元素边界');
      }

      // 获取共同父ID
      const commonParentId = elements[0]?.parentId ?? null;

      // 创建新的组合元素
      const group = ElementFactory.createGroup(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        elementIds,
      );

      // 创建打组命令
      const command = new GroupCommand(elementIds, group, elements, previousSelection, {
        addElement: (element: Element) => this.canvasStore.getState().addElement(element),
        deleteElement: (id: string) => this.canvasStore.getState().deleteElement(id),
        updateElement: (id: string, updates: Partial<Element>) =>
          this.canvasStore.getState().updateElement(id, updates),
        setSelectedElements: (ids: string[]) =>
          this.canvasStore.getState().setSelectedElements(ids),
      });

      // 通过历史服务执行命令
      await this.historyService.executeCommand(command);
    } catch (error) {
      console.error('通过历史服务打组元素失败:', error);
      // 降级处理：直接打组
      const group = groupElements(elementIds);
      this.canvasStore.getState().setSelectedElements([group.id]);
    }
  }

  /**
   * 解组选中的组合元素
   */
  async ungroupSelectedElements(): Promise<void> {
    const state = this.canvasStore.getState();
    const selectedElementIds = state.selectedElementIds;

    if (selectedElementIds.length === 0) {
      return;
    }

    // 只处理第一个选中的组合元素
    const groupId = selectedElementIds[0];
    const group = state.elements[groupId];

    if (!group || !isGroupElement(group)) {
      console.warn('解组需要选中一个组合元素');
      return;
    }

    // 获取子元素
    const childElements = group.children
      .map((id) => state.elements[id])
      .filter((el): el is Element => el !== undefined);

    if (childElements.length === 0) {
      console.warn('组合元素没有子元素');
      return;
    }

    // 如果有历史服务，使用命令模式
    if (this.historyService) {
      await this.ungroupElementWithHistory(group, childElements, selectedElementIds);
    } else {
      // 否则直接解组
      ungroup(groupId);
      const childIds = group.children.filter(
        (id) => this.canvasStore.getState().elements[id] !== undefined,
      );
      this.canvasStore.getState().setSelectedElements(childIds);
    }

    // 发出解组完成事件
    eventBus.emit('elements:ungrouped', {
      groupId,
      childIds: group.children,
    });
  }

  /**
   * 使用历史服务解组元素
   */
  private async ungroupElementWithHistory(
    group: GroupElement,
    childElements: Element[],
    previousSelection: string[],
  ): Promise<void> {
    if (!this.historyService) {
      return;
    }

    try {
      // 创建解组命令
      const command = new UngroupCommand(group, childElements, previousSelection, {
        addElement: (element: Element) => this.canvasStore.getState().addElement(element),
        deleteElement: (id: string) => this.canvasStore.getState().deleteElement(id),
        updateElement: (id: string, updates: Partial<Element>) =>
          this.canvasStore.getState().updateElement(id, updates),
        setSelectedElements: (ids: string[]) =>
          this.canvasStore.getState().setSelectedElements(ids),
      });

      // 通过历史服务执行命令
      await this.historyService.executeCommand(command);
    } catch (error) {
      console.error('通过历史服务解组元素失败:', error);
      // 降级处理：直接解组
      ungroup(group.id);
      const childIds = group.children.filter(
        (id) => this.canvasStore.getState().elements[id] !== undefined,
      );
      this.canvasStore.getState().setSelectedElements(childIds);
    }
  }

  /**
   * 检查是否可以打组（至少选中2个非组合元素）
   */
  canGroup(): boolean {
    const state = this.canvasStore.getState();
    const selectedElementIds = state.selectedElementIds;

    if (selectedElementIds.length < 2) {
      return false;
    }

    // 检查是否有至少2个非组合元素
    const nonGroupElements = selectedElementIds
      .map((id) => state.elements[id])
      .filter((element): element is Element => {
        if (!element) return false;
        return !isGroupElement(element);
      });

    return nonGroupElements.length >= 2;
  }

  /**
   * 检查是否可以解组（选中1个组合元素）
   */
  canUngroup(): boolean {
    const state = this.canvasStore.getState();
    const selectedElementIds = state.selectedElementIds;

    if (selectedElementIds.length !== 1) {
      return false;
    }

    const element = state.elements[selectedElementIds[0]];
    return element !== undefined && isGroupElement(element);
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 目前没有需要清理的资源
  }
}
