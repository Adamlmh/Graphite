/**
 * 组合元素服务
 *
 * 提供组合元素的创建、取消组合、边界计算等功能
 * 维护 parentId 与 group.children 的一致性
 */

import type { Element, GroupElement, CanvasState, Bounds } from '../types/index';
import { isGroupElement } from '../types/index';
import { ElementFactory } from './element-factory';

/**
 * 计算多个元素的整体边界框
 * 支持旋转元素的边界计算
 *
 * @param elements 元素数组
 * @returns 边界框，如果元素数组为空则返回 null
 */
export function computeElementsBounds(elements: Element[]): Bounds | null {
  if (elements.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  elements.forEach((element) => {
    const { x, y, width, height, rotation = 0 } = element;

    // 如果元素有旋转，需要计算旋转后的四个顶点
    if (rotation !== 0 && rotation % 360 !== 0) {
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      // 四个角点（相对于中心）
      const corners = [
        { x: -width / 2, y: -height / 2 },
        { x: width / 2, y: -height / 2 },
        { x: width / 2, y: height / 2 },
        { x: -width / 2, y: height / 2 },
      ];

      // 旋转后的角点
      const rotatedCorners = corners.map((corner) => ({
        x: centerX + corner.x * cos - corner.y * sin,
        y: centerY + corner.x * sin + corner.y * cos,
      }));

      // 更新边界
      rotatedCorners.forEach((corner) => {
        minX = Math.min(minX, corner.x);
        minY = Math.min(minY, corner.y);
        maxX = Math.max(maxX, corner.x);
        maxY = Math.max(maxY, corner.y);
      });
    } else {
      // 无旋转情况，直接计算
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * 检查是否存在循环引用
 *
 * 检查如果让 childId 成为 parentId 的子元素，是否会创建循环引用
 * 循环引用是指：如果 A 是 B 的父元素，而 B 又是 A 的父元素（直接或间接）
 *
 * 检测逻辑：
 * 1. 如果 childId === parentId，直接返回 true
 * 2. 检查 parentId 的所有祖先链中是否包含 childId
 *    如果包含，则 childId -> ... -> parentId -> childId 形成循环
 *
 * @param state 画布状态
 * @param childId 子元素ID
 * @param parentId 父元素ID
 * @returns 如果存在循环引用返回 true
 */
function wouldCreateCycle(state: CanvasState, childId: string, parentId: string): boolean {
  // 如果子元素就是父元素，则存在循环
  if (childId === parentId) {
    return true;
  }

  // 检查 parentId 的所有祖先链中是否包含 childId
  // 如果包含，则 childId -> ... -> parentId -> childId 形成循环
  let currentParentId: string | null | undefined = parentId;
  const visited = new Set<string>();

  while (currentParentId) {
    // 检测到循环引用（已访问过的节点）
    if (visited.has(currentParentId)) {
      return true;
    }
    visited.add(currentParentId);

    // 如果父元素的某个祖先是子元素，则存在循环
    if (currentParentId === childId) {
      return true;
    }

    const parent: Element | undefined = state.elements[currentParentId];
    currentParentId = parent?.parentId;
  }

  return false;
}

/**
 * 验证元素存在且 parentId 一致
 *
 * @param state 画布状态
 * @param elementIds 元素ID数组
 * @returns 验证通过的元素数组
 * @throws 如果元素不存在或 parentId 不一致
 */
function validateElementsForGrouping(state: CanvasState, elementIds: string[]): Element[] {
  if (elementIds.length === 0) {
    throw new Error('无法组合：元素ID数组为空');
  }

  const elements: Element[] = [];
  let commonParentId: string | null | undefined = undefined;

  for (const id of elementIds) {
    const element = state.elements[id];
    if (!element) {
      throw new Error(`无法组合：元素 ${id} 不存在`);
    }

    // 不能组合组合元素本身（但可以组合组合元素的子元素）
    // 这个限制可以放宽，允许组合组合元素
    // if (isGroupElement(element)) {
    //   throw new Error(`无法组合：元素 ${id} 是组合元素，不能直接组合`);
    // }

    // 检查 parentId 是否一致
    const parentId = element.parentId ?? null;
    if (commonParentId === undefined) {
      commonParentId = parentId;
    } else if (commonParentId !== parentId) {
      throw new Error(
        `无法组合：元素 ${id} 的 parentId (${parentId}) 与其他元素不一致 (${commonParentId})`,
      );
    }

    elements.push(element);
  }

  return elements;
}

/**
 * 组合多个元素为一个组合元素
 *
 * 功能：
 * 1. 校验元素存在 & parentId 一致
 * 2. 计算这些元素的整体 bounds
 * 3. 创建一个新的 GroupElement
 * 4. 更新子元素的 parentId 为新 groupId
 * 5. 更新 state.elements 和 state.selectedElementIds
 *
 * @param state 画布状态
 * @param elementIds 要组合的元素ID数组
 * @returns 更新后的画布状态
 */
export function groupElements(state: CanvasState, elementIds: string[]): CanvasState {
  // 1. 验证元素
  const elements = validateElementsForGrouping(state, elementIds);

  // 2. 计算整体边界
  const bounds = computeElementsBounds(elements);
  if (!bounds) {
    throw new Error('无法组合：无法计算元素边界');
  }

  // 3. 获取共同父ID
  const commonParentId = elements[0]?.parentId ?? null;

  // 4. 创建新的组合元素ID
  const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 5. 检查循环引用：检查每个子元素是否会导致循环
  for (const id of elementIds) {
    if (wouldCreateCycle(state, id, groupId)) {
      throw new Error(`无法组合：元素 ${id} 会导致循环引用`);
    }
  }

  // 6. 创建新的组合元素
  const group: GroupElement = {
    ...ElementFactory.createGroup(bounds.x, bounds.y, bounds.width, bounds.height, elementIds),
    id: groupId,
    parentId: commonParentId ?? undefined,
  };

  // 6. 更新子元素的 parentId
  const updatedElements: Record<string, Element> = { ...state.elements };
  elementIds.forEach((id) => {
    const element = { ...updatedElements[id] };
    element.parentId = groupId;
    updatedElements[id] = element;
  });

  // 7. 添加组合元素
  updatedElements[groupId] = group;

  // 8. 更新选中状态
  const newSelectedElementIds = [groupId];

  return {
    ...state,
    elements: updatedElements,
    selectedElementIds: newSelectedElementIds,
  };
}

/**
 * 取消组合
 *
 * 功能：
 * 1. 找到 group，确保 type === 'group'
 * 2. 把所有子元素的 parentId 改为 group.parentId
 * 3. 从 state.elements 删除这个 group
 * 4. 更新选中状态（把选中从 groupId 换成它的 children）
 *
 * @param state 画布状态
 * @param groupId 组合元素ID
 * @returns 更新后的画布状态
 */
export function ungroupElement(state: CanvasState, groupId: string): CanvasState {
  const group = state.elements[groupId];
  if (!group) {
    throw new Error(`无法取消组合：组合元素 ${groupId} 不存在`);
  }

  if (!isGroupElement(group)) {
    throw new Error(`无法取消组合：元素 ${groupId} 不是组合元素`);
  }

  const parentId = group.parentId ?? null;

  // 更新子元素的 parentId
  const updatedElements: Record<string, Element> = { ...state.elements };
  group.children.forEach((childId) => {
    const child = updatedElements[childId];
    if (child) {
      updatedElements[childId] = {
        ...child,
        parentId: parentId ?? undefined,
      };
    }
  });

  // 删除组合元素
  delete updatedElements[groupId];

  // 更新选中状态：选中子元素
  const newSelectedElementIds = group.children.filter((id) => updatedElements[id] !== undefined);

  let newState: CanvasState = {
    ...state,
    elements: updatedElements,
    selectedElementIds: newSelectedElementIds,
  };

  // 更新父组合的边界（如果存在）
  if (parentId) {
    newState = bubbleUpdateGroupBounds(newState, parentId);
  }

  return newState;
}

/**
 * 重新计算组合元素的边界
 *
 * 根据 group.children 找到所有子元素，使用 computeElementsBounds 计算 bounds，
 * 然后写回 group 的 x, y, width, height
 *
 * @param state 画布状态
 * @param groupId 组合元素ID
 * @returns 更新后的画布状态
 */
export function recomputeGroupBounds(state: CanvasState, groupId: string): CanvasState {
  const group = state.elements[groupId];
  if (!group) {
    throw new Error(`无法重新计算边界：组合元素 ${groupId} 不存在`);
  }

  if (!isGroupElement(group)) {
    throw new Error(`无法重新计算边界：元素 ${groupId} 不是组合元素`);
  }

  // 获取所有子元素
  const children = group.children
    .map((id) => state.elements[id])
    .filter((el): el is Element => el !== undefined);

  if (children.length === 0) {
    // 如果没有子元素，保持原有边界
    return state;
  }

  // 计算边界
  const bounds = computeElementsBounds(children);
  if (!bounds) {
    return state;
  }

  // 更新组合元素的边界
  const updatedElements: Record<string, Element> = { ...state.elements };
  updatedElements[groupId] = {
    ...group,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };

  return {
    ...state,
    elements: updatedElements,
  };
}

/**
 * 向上递归更新所有父组合的边界
 *
 * 当子元素发生几何变化时，需要调用此函数来更新所有父组合的边界
 *
 * @param state 画布状态
 * @param elementId 发生变化的元素ID
 * @returns 更新后的画布状态
 */
export function bubbleUpdateGroupBounds(state: CanvasState, elementId: string): CanvasState {
  const element = state.elements[elementId];
  if (!element) {
    return state;
  }

  let currentParentId: string | null | undefined = element.parentId;
  let currentState = state;

  // 向上递归更新所有父组合
  while (currentParentId) {
    const parent = currentState.elements[currentParentId];
    if (!parent || !isGroupElement(parent)) {
      break;
    }

    // 重新计算父组合的边界
    currentState = recomputeGroupBounds(currentState, currentParentId);

    // 继续向上查找
    currentParentId = currentState.elements[currentParentId]?.parentId;
  }

  return currentState;
}

/**
 * 移动组合元素及其所有子元素
 *
 * 当对 group 进行移动（dx, dy）时：
 * 1. group 自己的 x, y 加上 dx, dy
 * 2. 它的所有子元素的 x, y 同样加上 dx, dy（递归对嵌套元素生效）
 * 3. 最后调用 bubbleUpdateGroupBounds(groupId)
 *
 * @param state 画布状态
 * @param groupId 组合元素ID
 * @param dx X方向偏移量
 * @param dy Y方向偏移量
 * @returns 更新后的画布状态
 */
export function moveGroup(
  state: CanvasState,
  groupId: string,
  dx: number,
  dy: number,
): CanvasState {
  const group = state.elements[groupId];
  if (!group) {
    throw new Error(`无法移动组合：组合元素 ${groupId} 不存在`);
  }

  if (!isGroupElement(group)) {
    throw new Error(`无法移动组合：元素 ${groupId} 不是组合元素`);
  }

  const updatedElements: Record<string, Element> = { ...state.elements };

  // 递归移动元素及其所有子元素（包括嵌套组合）
  const moveElementRecursive = (elementId: string, deltaX: number, deltaY: number) => {
    const element = updatedElements[elementId];
    if (!element) return;

    // 移动元素本身
    updatedElements[elementId] = {
      ...element,
      x: element.x + deltaX,
      y: element.y + deltaY,
    };

    // 如果是组合元素，递归移动其所有子元素
    if (isGroupElement(element)) {
      element.children.forEach((childId) => {
        moveElementRecursive(childId, deltaX, deltaY);
      });
    }
  };

  // 移动组合元素本身
  updatedElements[groupId] = {
    ...group,
    x: group.x + dx,
    y: group.y + dy,
  };

  // 移动所有直接子元素（递归函数会处理嵌套组合）
  group.children.forEach((childId) => {
    moveElementRecursive(childId, dx, dy);
  });

  let newState: CanvasState = {
    ...state,
    elements: updatedElements,
  };

  // 先重新计算当前组合的边界（因为移动了子元素和组合本身）
  newState = recomputeGroupBounds(newState, groupId);

  // 然后向上更新所有父组合的边界
  newState = bubbleUpdateGroupBounds(newState, groupId);

  return newState;
}

/**
 * 缩放组合元素
 *
 * 以 group 的中心点作为 pivot，对每个子元素进行几何变换
 *
 * @param state 画布状态
 * @param groupId 组合元素ID
 * @param scaleX X方向缩放比例
 * @param scaleY Y方向缩放比例
 * @returns 更新后的画布状态
 */
export function scaleGroup(
  state: CanvasState,
  groupId: string,
  scaleX: number,
  scaleY: number,
): CanvasState {
  const group = state.elements[groupId];
  if (!group) {
    throw new Error(`无法缩放组合：组合元素 ${groupId} 不存在`);
  }

  if (!isGroupElement(group)) {
    throw new Error(`无法缩放组合：元素 ${groupId} 不是组合元素`);
  }

  // 计算组合中心点
  const centerX = group.x + group.width / 2;
  const centerY = group.y + group.height / 2;

  const updatedElements: Record<string, Element> = { ...state.elements };

  // 递归缩放元素及其所有子元素（包括嵌套组合）
  const scaleElementRecursive = (elementId: string, scaleX: number, scaleY: number) => {
    const element = updatedElements[elementId];
    if (!element) return;

    // 计算元素相对于组合中心的偏移
    const offsetX = element.x - centerX;
    const offsetY = element.y - centerY;

    // 应用缩放
    updatedElements[elementId] = {
      ...element,
      x: centerX + offsetX * scaleX,
      y: centerY + offsetY * scaleY,
      width: element.width * scaleX,
      height: element.height * scaleY,
    };

    // 如果是组合元素，递归缩放其所有子元素
    if (isGroupElement(element)) {
      element.children.forEach((childId) => {
        scaleElementRecursive(childId, scaleX, scaleY);
      });
    }
  };

  // 缩放所有直接子元素（递归函数会处理嵌套组合）
  group.children.forEach((childId) => {
    scaleElementRecursive(childId, scaleX, scaleY);
  });

  let newState: CanvasState = {
    ...state,
    elements: updatedElements,
  };

  // 重新计算组合边界（因为子元素位置和尺寸都变了）
  // 这会自动更新组合元素的 x, y, width, height
  newState = recomputeGroupBounds(newState, groupId);

  // 更新父组合的边界
  newState = bubbleUpdateGroupBounds(newState, groupId);

  return newState;
}

/**
 * 旋转组合元素
 *
 * 以 group 的中心点作为 pivot，对每个子元素进行旋转变换
 *
 * @param state 画布状态
 * @param groupId 组合元素ID
 * @param rotationDelta 旋转角度增量（度）
 * @returns 更新后的画布状态
 */
export function rotateGroup(
  state: CanvasState,
  groupId: string,
  rotationDelta: number,
): CanvasState {
  const group = state.elements[groupId];
  if (!group) {
    throw new Error(`无法旋转组合：组合元素 ${groupId} 不存在`);
  }

  if (!isGroupElement(group)) {
    throw new Error(`无法旋转组合：元素 ${groupId} 不是组合元素`);
  }

  // 计算组合中心点
  const centerX = group.x + group.width / 2;
  const centerY = group.y + group.height / 2;

  // 转换为弧度
  const rad = (rotationDelta * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const updatedElements: Record<string, Element> = { ...state.elements };

  // 递归旋转元素及其所有子元素（包括嵌套组合）
  const rotateElementRecursive = (elementId: string, rotationDelta: number) => {
    const element = updatedElements[elementId];
    if (!element) return;

    // 计算元素中心相对于组合中心的偏移
    const elementCenterX = element.x + element.width / 2;
    const elementCenterY = element.y + element.height / 2;
    const offsetX = elementCenterX - centerX;
    const offsetY = elementCenterY - centerY;

    // 应用旋转变换
    const newOffsetX = offsetX * cos - offsetY * sin;
    const newOffsetY = offsetX * sin + offsetY * cos;

    // 更新元素的位置和旋转角度（不改变 width/height，因为 bounding box 由 computeElementsBounds 处理）
    updatedElements[elementId] = {
      ...element,
      x: centerX + newOffsetX - element.width / 2,
      y: centerY + newOffsetY - element.height / 2,
      rotation: element.rotation + rotationDelta,
    };

    // 如果是组合元素，递归旋转其所有子元素
    if (isGroupElement(element)) {
      element.children.forEach((childId) => {
        rotateElementRecursive(childId, rotationDelta);
      });
    }
  };

  // 旋转所有直接子元素（递归函数会处理嵌套组合）
  group.children.forEach((childId) => {
    rotateElementRecursive(childId, rotationDelta);
  });

  // 更新组合元素的旋转角度
  updatedElements[groupId] = {
    ...group,
    rotation: group.rotation + rotationDelta,
  };

  let newState: CanvasState = {
    ...state,
    elements: updatedElements,
  };

  // 重新计算组合边界（因为子元素位置和旋转都变了）
  newState = recomputeGroupBounds(newState, groupId);

  // 更新父组合的边界
  newState = bubbleUpdateGroupBounds(newState, groupId);

  return newState;
}
