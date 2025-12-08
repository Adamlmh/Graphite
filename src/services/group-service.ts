/**
 * 组合服务 - GroupElement MVP 实现
 *
 * 提供组合元素的创建、取消组合、移动、边界计算等功能
 * 维护 parentId 与 group.children 的双向一致性
 */

import { useCanvasStore } from '../stores/canvas-store';
import type { Element, GroupElement, Bounds, Point } from '../types/index';
import { isGroupElement } from '../types/index';
import { ElementFactory } from './element-factory';
import { computeElementsBounds } from './GroupService';

/**
 * 组合多个元素为一个组合元素
 *
 * @param elementIds 要组合的元素ID数组
 * @returns 创建的 GroupElement
 */
export function groupElements(elementIds: string[]): GroupElement {
  const state = useCanvasStore.getState();
  const elements = elementIds
    .map((id) => state.elements[id])
    .filter((el): el is Element => el !== undefined);

  if (elements.length === 0) {
    throw new Error('无法组合：元素ID数组为空或元素不存在');
  }

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

  // 更新子元素的 parentId
  elementIds.forEach((id) => {
    const element = state.elements[id];
    if (element) {
      useCanvasStore.getState().updateElement(id, {
        parentId: group.id,
      });
    }
  });

  // 设置 group 的 parentId
  if (commonParentId) {
    useCanvasStore.getState().updateElement(group.id, {
      parentId: commonParentId,
    });
  }

  // 添加组合元素到 store
  useCanvasStore.getState().addElement(group);

  return group;
}

/**
 * 取消组合
 *
 * @param groupId 组合元素ID
 */
export function ungroup(groupId: string): void {
  const state = useCanvasStore.getState();
  const group = state.elements[groupId];

  if (!group) {
    throw new Error(`无法取消组合：组合元素 ${groupId} 不存在`);
  }

  if (!isGroupElement(group)) {
    throw new Error(`无法取消组合：元素 ${groupId} 不是组合元素`);
  }

  const parentId = group.parentId ?? null;

  // 更新子元素的 parentId
  group.children.forEach((childId) => {
    const child = state.elements[childId];
    if (child) {
      useCanvasStore.getState().updateElement(childId, {
        parentId: parentId ?? undefined,
      });
    }
  });

  // 删除组合元素
  useCanvasStore.getState().deleteElement(groupId);
}

/**
 * 移动组合元素及其所有子元素
 *
 * @param groupId 组合元素ID
 * @param dx X方向偏移量
 * @param dy Y方向偏移量
 */
export function moveGroup(groupId: string, dx: number, dy: number): void {
  const state = useCanvasStore.getState();
  const group = state.elements[groupId];

  if (!group) {
    throw new Error(`无法移动组合：组合元素 ${groupId} 不存在`);
  }

  if (!isGroupElement(group)) {
    throw new Error(`无法移动组合：元素 ${groupId} 不是组合元素`);
  }

  // 获取所有深度子元素（包括嵌套组合）
  const allChildren = getGroupDeepChildren(groupId);

  // 移动所有子元素
  const updates: Array<{ id: string; updates: Partial<Element> }> = [];

  allChildren.forEach((childId) => {
    const child = state.elements[childId];
    if (child) {
      updates.push({
        id: childId,
        updates: {
          x: child.x + dx,
          y: child.y + dy,
        },
      });
    }
  });

  if (updates.length > 0) {
    useCanvasStore.getState().updateElements(updates);

    // 重新计算组合边界（group 的位置应该由子元素的边界决定）
    const newState = useCanvasStore.getState();
    const updatedGroup = newState.elements[groupId];
    if (updatedGroup && isGroupElement(updatedGroup)) {
      const bounds = computeGroupBounds(groupId);
      if (bounds) {
        useCanvasStore.getState().updateElement(groupId, {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });
      }
    }
  }

  console.log(`[moveGroup] moved dx=${dx}, dy=${dy}, children count=${allChildren.length}`);
}

/**
 * 计算组合元素的边界框
 *
 * @param groupId 组合元素ID
 * @returns 边界框，如果组合不存在或没有子元素则返回 null
 */
export function computeGroupBounds(groupId: string): Bounds | null {
  const state = useCanvasStore.getState();
  const group = state.elements[groupId];

  if (!group || !isGroupElement(group)) {
    console.log(`[computeGroupBounds] group ${groupId} 不存在或不是 group`);
    return null;
  }

  // 获取所有直接子元素
  const children = group.children
    .map((id) => state.elements[id])
    .filter((el): el is Element => el !== undefined);

  console.log(`[computeGroupBounds] group ${groupId} 的子元素`, {
    childrenIds: group.children,
    foundChildren: children.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
    })),
  });

  if (children.length === 0) {
    console.log(`[computeGroupBounds] group ${groupId} 没有子元素`);
    return null;
  }

  // 使用已有的 computeElementsBounds 计算边界
  const bounds = computeElementsBounds(children);
  console.log(`[computeGroupBounds] group ${groupId} 的边界`, bounds);
  return bounds;
}

/**
 * 深度获取组合的所有后代元素（包括嵌套组合的子元素）
 *
 * @param groupId 组合元素ID
 * @returns 所有后代元素ID数组
 */
export function getGroupDeepChildren(groupId: string): string[] {
  const state = useCanvasStore.getState();
  const group = state.elements[groupId];

  if (!group || !isGroupElement(group)) {
    return [];
  }

  const result: string[] = [];

  // 递归收集所有子元素
  const collectChildren = (id: string) => {
    const element = state.elements[id];
    if (element && isGroupElement(element)) {
      element.children.forEach((childId) => {
        result.push(childId);
        collectChildren(childId); // 递归处理嵌套组合
      });
    }
  };

  // 收集直接子元素
  group.children.forEach((childId) => {
    result.push(childId);
    collectChildren(childId);
  });

  return result;
}

/**
 * 检测点击是否命中 group
 *
 * @param worldPoint 世界坐标点
 * @param elements 所有元素列表
 * @returns 命中的 group ID，如果没有命中则返回 null
 */
export function hitTestGroups(worldPoint: Point, elements: Element[]): string | null {
  // 获取所有 group 元素
  const groups = elements.filter((el): el is GroupElement => isGroupElement(el));

  console.log('[GROUP_DEBUG] [hitTestGroups] 开始检测组合元素', {
    clickWorldPoint: worldPoint,
    groupsCount: groups.length,
    groupIds: groups.map((g) => g.id),
    allGroupsInfo: groups.map((g) => ({
      id: g.id,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      zIndex: g.zIndex,
      children: g.children,
    })),
  });

  if (groups.length === 0) {
    console.log('[GROUP_DEBUG] [hitTestGroups] 没有组合元素');
    return null;
  }

  // 按 zIndex 从高到低排序（简单版：按插入顺序反转）
  const sortedGroups = [...groups].sort((a, b) => b.zIndex - a.zIndex);

  // 从前到后遍历所有 group
  for (const group of sortedGroups) {
    // 跳过隐藏的 group
    if (group.visibility === 'hidden') {
      console.log(`[GROUP_DEBUG] [hitTestGroups] 跳过隐藏的组合元素: ${group.id}`);
      continue;
    }

    // 计算 group 的边界
    const bounds = computeGroupBounds(group.id);
    console.log(`[GROUP_DEBUG] [hitTestGroups] 检测组合元素`, {
      groupId: group.id,
      groupInfo: {
        id: group.id,
        x: group.x,
        y: group.y,
        width: group.width,
        height: group.height,
        zIndex: group.zIndex,
        children: group.children,
      },
      computedBounds: bounds,
      clickWorldPoint: worldPoint,
    });

    if (!bounds) {
      console.log(`[GROUP_DEBUG] [hitTestGroups] 组合元素 ${group.id} 没有边界`);
      continue;
    }

    // 检测点是否在边界内
    const isInside =
      worldPoint.x >= bounds.x &&
      worldPoint.x <= bounds.x + bounds.width &&
      worldPoint.y >= bounds.y &&
      worldPoint.y <= bounds.y + bounds.height;

    console.log(`[GROUP_DEBUG] [hitTestGroups] 组合元素命中检测结果`, {
      groupId: group.id,
      isHit: isInside,
      clickWorldPoint: worldPoint,
      bounds,
      hitCheck: {
        x: {
          point: worldPoint.x,
          min: bounds.x,
          max: bounds.x + bounds.width,
          check: `${worldPoint.x} >= ${bounds.x} && ${worldPoint.x} <= ${bounds.x + bounds.width}`,
          result: worldPoint.x >= bounds.x && worldPoint.x <= bounds.x + bounds.width,
        },
        y: {
          point: worldPoint.y,
          min: bounds.y,
          max: bounds.y + bounds.height,
          check: `${worldPoint.y} >= ${bounds.y} && ${worldPoint.y} <= ${bounds.y + bounds.height}`,
          result: worldPoint.y >= bounds.y && worldPoint.y <= bounds.y + bounds.height,
        },
      },
    });

    if (isInside) {
      console.log(`[GROUP_DEBUG] [hitTestGroups] ✅ 命中组合元素`, {
        groupId: group.id,
        groupInfo: {
          id: group.id,
          x: group.x,
          y: group.y,
          width: group.width,
          height: group.height,
          zIndex: group.zIndex,
          children: group.children,
        },
        bounds,
        clickWorldPoint: worldPoint,
      });
      return group.id;
    }
  }

  console.log('[GROUP_DEBUG] [hitTestGroups] ❌ 没有命中任何组合元素');
  return null;
}
