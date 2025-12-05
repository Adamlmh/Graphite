/**
 * 工具栏定位配置
 */
export interface ToolbarConfig {
  width: number;
  height: number;
  gap?: number;
  viewportPadding?: number;
}

/**
 * 位置坐标
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * 可用空间信息
 */
interface AvailableSpace {
  above: number;
  below: number;
  left: number;
  right: number;
}

/**
 * 计算工具栏在目标元素周围的最佳位置
 *
 * 算法优先级：上方 > 下方 > 左侧 > 右侧 > 最大空间
 *
 * @param targetRect - 目标元素的边界矩形（通常是选中文本的容器）
 * @param config - 工具栏配置（宽度、高度、间距等）
 * @returns 工具栏的屏幕坐标位置
 *
 * @example
 * ```ts
 * const containerRect = element.getBoundingClientRect();
 * const position = calculateToolbarPosition(containerRect, {
 *   width: 280,
 *   height: 60,
 *   gap: 8,
 *   viewportPadding: 16
 * });
 * // position: { x: 100, y: 50 }
 * ```
 */
export function calculateToolbarPosition(targetRect: DOMRect, config: ToolbarConfig): Position {
  const { width: toolbarWidth, height: toolbarHeight, gap = 8, viewportPadding = 16 } = config;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 计算四周可用空间
  const availableSpace: AvailableSpace = {
    above: targetRect.top - viewportPadding,
    below: viewportHeight - targetRect.bottom - viewportPadding,
    left: targetRect.left - viewportPadding,
    right: viewportWidth - targetRect.right - viewportPadding,
  };

  // 策略 1: 优先尝试放在上方
  if (availableSpace.above >= toolbarHeight + gap) {
    return calculatePositionAbove(
      targetRect,
      toolbarWidth,
      toolbarHeight,
      gap,
      viewportWidth,
      viewportPadding,
    );
  }

  // 策略 2: 尝试放在下方
  if (availableSpace.below >= toolbarHeight + gap) {
    return calculatePositionBelow(
      targetRect,
      toolbarWidth,
      toolbarHeight,
      gap,
      viewportWidth,
      viewportPadding,
    );
  }

  // 策略 3: 尝试放在左侧
  if (availableSpace.left >= toolbarWidth + gap) {
    return calculatePositionLeft(
      targetRect,
      toolbarWidth,
      toolbarHeight,
      gap,
      viewportHeight,
      viewportPadding,
    );
  }

  // 策略 4: 尝试放在右侧
  if (availableSpace.right >= toolbarWidth + gap) {
    return calculatePositionRight(
      targetRect,
      toolbarWidth,
      toolbarHeight,
      gap,
      viewportHeight,
      viewportPadding,
    );
  }

  // 策略 5: 都放不下，选择最大空间的方向
  return calculatePositionFallback(
    targetRect,
    availableSpace,
    toolbarWidth,
    toolbarHeight,
    gap,
    viewportWidth,
    viewportHeight,
    viewportPadding,
  );
}

/**
 * 计算工具栏在目标元素上方的位置
 */
function calculatePositionAbove(
  targetRect: DOMRect,
  toolbarWidth: number,
  toolbarHeight: number,
  gap: number,
  viewportWidth: number,
  viewportPadding: number,
): Position {
  const y = targetRect.top - toolbarHeight - gap;
  const x = calculateCenteredX(targetRect, toolbarWidth, viewportWidth, viewportPadding);

  return { x, y };
}

/**
 * 计算工具栏在目标元素下方的位置
 */
function calculatePositionBelow(
  targetRect: DOMRect,
  toolbarWidth: number,
  toolbarHeight: number,
  gap: number,
  viewportWidth: number,
  viewportPadding: number,
): Position {
  const y = targetRect.bottom + gap;
  const x = calculateCenteredX(targetRect, toolbarWidth, viewportWidth, viewportPadding);

  return { x, y };
}

/**
 * 计算工具栏在目标元素左侧的位置
 */
function calculatePositionLeft(
  targetRect: DOMRect,
  toolbarWidth: number,
  toolbarHeight: number,
  gap: number,
  viewportHeight: number,
  viewportPadding: number,
): Position {
  const x = targetRect.left - toolbarWidth - gap;
  const y = calculateCenteredY(targetRect, toolbarHeight, viewportHeight, viewportPadding);

  return { x, y };
}

/**
 * 计算工具栏在目标元素右侧的位置
 */
function calculatePositionRight(
  targetRect: DOMRect,
  toolbarWidth: number,
  toolbarHeight: number,
  gap: number,
  viewportHeight: number,
  viewportPadding: number,
): Position {
  const x = targetRect.right + gap;
  const y = calculateCenteredY(targetRect, toolbarHeight, viewportHeight, viewportPadding);

  return { x, y };
}

/**
 * 回退策略：选择最大空间的方向
 */
function calculatePositionFallback(
  targetRect: DOMRect,
  availableSpace: AvailableSpace,
  toolbarWidth: number,
  toolbarHeight: number,
  gap: number,
  viewportWidth: number,
  viewportHeight: number,
  viewportPadding: number,
): Position {
  const maxSpace = Math.max(
    availableSpace.above,
    availableSpace.below,
    availableSpace.left,
    availableSpace.right,
  );

  if (maxSpace === availableSpace.above) {
    // 放在上方，但需要边界约束
    const y = Math.max(viewportPadding, targetRect.top - toolbarHeight - gap);
    const x = calculateCenteredX(targetRect, toolbarWidth, viewportWidth, viewportPadding);
    return { x, y };
  }

  if (maxSpace === availableSpace.below) {
    // 放在下方，但需要边界约束
    const y = Math.min(targetRect.bottom + gap, viewportHeight - viewportPadding - toolbarHeight);
    const x = calculateCenteredX(targetRect, toolbarWidth, viewportWidth, viewportPadding);
    return { x, y };
  }

  // 默认放在上方（即使空间不足）
  const x = calculateCenteredX(targetRect, toolbarWidth, viewportWidth, viewportPadding);
  const y = targetRect.top - toolbarHeight - gap;
  return { x, y };
}

/**
 * 计算水平居中的 X 坐标（带边界约束）
 */
function calculateCenteredX(
  targetRect: DOMRect,
  toolbarWidth: number,
  viewportWidth: number,
  viewportPadding: number,
): number {
  // 基础居中位置
  const centeredX = targetRect.left + targetRect.width / 2 - toolbarWidth / 2;

  // 应用边界约束
  return Math.max(
    viewportPadding,
    Math.min(centeredX, viewportWidth - viewportPadding - toolbarWidth),
  );
}

/**
 * 计算垂直居中的 Y 坐标（带边界约束）
 */
function calculateCenteredY(
  targetRect: DOMRect,
  toolbarHeight: number,
  viewportHeight: number,
  viewportPadding: number,
): number {
  // 基础居中位置
  const centeredY = targetRect.top + targetRect.height / 2 - toolbarHeight / 2;

  // 应用边界约束
  return Math.max(
    viewportPadding,
    Math.min(centeredY, viewportHeight - viewportPadding - toolbarHeight),
  );
}
