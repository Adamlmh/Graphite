import type { Element } from '../types';
import { CoordinateTransformer } from '../lib/Coordinate/index';

/**
 * 面板定位配置
 */
interface PanelConfig {
  width: number; // 面板宽度
  height: number; // 面板高度
  gap: number; // 与元素的间距
  viewportPadding: number; // 距离视口边缘的最小距离
}

/**
 * 定位结果
 */
export interface PanelPosition {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
}

/**
 * 屏幕空间的矩形边界
 */
interface ScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * 计算旋转后的边界框四个顶点
 */
function getRotatedCorners(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number = 0,
): Array<{ x: number; y: number }> {
  // 如果没有旋转，直接返回矩形四个角
  if (!rotation || rotation === 0) {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }

  // 计算中心点（旋转中心）
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // 旋转角度转弧度
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // 四个角相对于中心的坐标
  const corners = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];

  // 旋转后的四个角
  return corners.map((corner) => ({
    x: centerX + corner.x * cos - corner.y * sin,
    y: centerY + corner.x * sin + corner.y * cos,
  }));
}

/**
 * 计算选中元素的世界坐标边界（支持旋转）
 */
function getElementsWorldBounds(elements: Element[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
} {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  elements.forEach((element) => {
    const { x, y, width, height, rotation = 0 } = element;

    // 计算旋转后的四个顶点
    const corners = getRotatedCorners(x, y, width, height, rotation);

    // 遍历所有顶点，找到最小外接矩形
    corners.forEach((corner) => {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    });
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * 将世界坐标边界转换为屏幕坐标边界
 */
function worldBoundsToScreenBounds(
  worldBounds: ReturnType<typeof getElementsWorldBounds>,
  coordinateTransformer: CoordinateTransformer,
): ScreenBounds {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasDOMProvider = (coordinateTransformer as any).canvasDOMProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewportProvider = (coordinateTransformer as any).viewportProvider;

  const canvasRect = canvasDOMProvider.getCanvasRect();
  const zoom = viewportProvider.getZoom();
  const offset = viewportProvider.getOffset();

  // 世界坐标 → 画布坐标 → 屏幕坐标
  // 注意：根据 CoordinateTransformer.canvasToWorld 的逆变换
  // canvasToWorld: worldX = canvasX / zoom + offset.x
  // 因此反向转换：canvasX = (worldX - offset.x) * zoom
  const worldToScreen = (worldX: number, worldY: number) => {
    // 画布坐标：先减去 offset，再乘以 zoom
    const canvasX = (worldX - offset.x) * zoom;
    const canvasY = (worldY - offset.y) * zoom;
    // 屏幕坐标：画布坐标 + 画布在屏幕上的偏移
    return {
      x: canvasX + canvasRect.left,
      y: canvasY + canvasRect.top,
    };
  };

  const topLeft = worldToScreen(worldBounds.minX, worldBounds.minY);
  const bottomRight = worldToScreen(worldBounds.maxX, worldBounds.maxY);
  const center = worldToScreen(worldBounds.centerX, worldBounds.centerY);

  return {
    left: topLeft.x,
    top: topLeft.y,
    right: bottomRight.x,
    bottom: bottomRight.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
    centerX: center.x,
    centerY: center.y,
  };
}

/**
 * 计算面板的最佳位置
 * 优先级：上方 > 下方 > 左侧 > 右侧
 */
function calculateBestPosition(
  elementBounds: ScreenBounds,
  config: PanelConfig,
  viewportWidth: number,
  viewportHeight: number,
): PanelPosition {
  const { width: panelWidth, height: panelHeight, gap, viewportPadding } = config;

  // 可用空间检测
  const spaceAbove = elementBounds.top - viewportPadding;
  const spaceBelow = viewportHeight - elementBounds.bottom - viewportPadding;
  const spaceLeft = elementBounds.left - viewportPadding;
  const spaceRight = viewportWidth - elementBounds.right - viewportPadding;

  // 1. 尝试放在上方（优先）
  if (spaceAbove >= panelHeight + gap) {
    const position: PanelPosition = {
      bottom: viewportHeight - elementBounds.top + gap,
    };

    // 水平居中，但要避免超出视口
    let left = elementBounds.centerX - panelWidth / 2;

    // 边界检查
    if (left < viewportPadding) {
      left = viewportPadding;
    } else if (left + panelWidth > viewportWidth - viewportPadding) {
      left = viewportWidth - viewportPadding - panelWidth;
    }

    position.left = left;
    return position;
  }

  // 2. 尝试放在下方
  if (spaceBelow >= panelHeight + gap) {
    const position: PanelPosition = {
      top: elementBounds.bottom + gap,
    };

    // 水平居中，但要避免超出视口
    let left = elementBounds.centerX - panelWidth / 2;

    // 边界检查
    if (left < viewportPadding) {
      left = viewportPadding;
    } else if (left + panelWidth > viewportWidth - viewportPadding) {
      left = viewportWidth - viewportPadding - panelWidth;
    }

    position.left = left;
    return position;
  }

  // 3. 尝试放在左侧
  if (spaceLeft >= panelWidth + gap) {
    const position: PanelPosition = {
      right: viewportWidth - elementBounds.left + gap,
    };

    // 垂直居中
    let top = elementBounds.centerY - panelHeight / 2;

    // 边界检查
    if (top < viewportPadding) {
      top = viewportPadding;
    } else if (top + panelHeight > viewportHeight - viewportPadding) {
      top = viewportHeight - viewportPadding - panelHeight;
    }

    position.top = top;
    return position;
  }

  // 4. 尝试放在右侧
  if (spaceRight >= panelWidth + gap) {
    const position: PanelPosition = {
      left: elementBounds.right + gap,
    };

    // 垂直居中
    let top = elementBounds.centerY - panelHeight / 2;

    // 边界检查
    if (top < viewportPadding) {
      top = viewportPadding;
    } else if (top + panelHeight > viewportHeight - viewportPadding) {
      top = viewportHeight - viewportPadding - panelHeight;
    }

    position.top = top;
    return position;
  }

  // 5. 如果四个方向都放不下，智能选择最大空间的方向
  const maxSpace = Math.max(spaceAbove, spaceBelow, spaceLeft, spaceRight);

  if (maxSpace === spaceAbove) {
    // 放在上方，尽可能靠近元素
    let left = elementBounds.centerX - panelWidth / 2;
    left = Math.max(viewportPadding, Math.min(left, viewportWidth - viewportPadding - panelWidth));
    return {
      bottom: viewportHeight - elementBounds.top + gap,
      left,
    };
  } else if (maxSpace === spaceBelow) {
    // 放在下方
    let left = elementBounds.centerX - panelWidth / 2;
    left = Math.max(viewportPadding, Math.min(left, viewportWidth - viewportPadding - panelWidth));
    return {
      top: elementBounds.bottom + gap,
      left,
    };
  } else if (maxSpace === spaceLeft) {
    // 放在左侧
    let top = elementBounds.centerY - panelHeight / 2;
    top = Math.max(viewportPadding, Math.min(top, viewportHeight - viewportPadding - panelHeight));
    return {
      right: viewportWidth - elementBounds.left + gap,
      top,
    };
  } else {
    // 放在右侧
    let top = elementBounds.centerY - panelHeight / 2;
    top = Math.max(viewportPadding, Math.min(top, viewportHeight - viewportPadding - panelHeight));
    return {
      left: elementBounds.right + gap,
      top,
    };
  }
}

/**
 * 检测元素是否在视口可见范围内
 */
function isElementInViewport(
  screenBounds: ScreenBounds,
  viewportWidth: number,
  viewportHeight: number,
  threshold: number = 50, // 允许部分超出的阈值（像素）
): boolean {
  // 元素完全在视口左侧
  if (screenBounds.right < -threshold) {
    return false;
  }

  // 元素完全在视口右侧
  if (screenBounds.left > viewportWidth + threshold) {
    return false;
  }

  // 元素完全在视口上方
  if (screenBounds.bottom < -threshold) {
    return false;
  }

  // 元素完全在视口下方
  if (screenBounds.top > viewportHeight + threshold) {
    return false;
  }

  return true;
}

/**
 * 计算属性面板的动态位置
 *
 * @param elements 选中的元素列表
 * @param panelSize 面板尺寸 { width, height }
 * @param options 可选配置
 * @returns 面板的定位样式对象，如果元素不在视口内则返回 null
 */
export function calculatePanelPosition(
  elements: Element[],
  panelSize: { width: number; height: number } = { width: 280, height: 60 },
  options: Partial<Pick<PanelConfig, 'gap' | 'viewportPadding'>> = {},
): PanelPosition | null {
  if (elements.length === 0) {
    return null;
  }

  // 配置参数
  const config: PanelConfig = {
    width: panelSize.width,
    height: panelSize.height,
    gap: options.gap ?? 12, // 面板与元素的间距
    viewportPadding: options.viewportPadding ?? 20, // 距离视口边缘的最小距离
  };

  // 创建坐标转换器
  const coordinateTransformer = new CoordinateTransformer();

  // 1. 计算选中元素的世界坐标边界
  const worldBounds = getElementsWorldBounds(elements);

  // 2. 转换为屏幕坐标边界
  const screenBounds = worldBoundsToScreenBounds(worldBounds, coordinateTransformer);

  // 3. 获取视口尺寸
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 4. 检测元素是否在视口内
  if (!isElementInViewport(screenBounds, viewportWidth, viewportHeight)) {
    console.log('PanelPositioning: 元素不在视口内，隐藏面板', {
      screenBounds,
      viewport: { width: viewportWidth, height: viewportHeight },
      reason: {
        left: screenBounds.left > viewportWidth + 50 ? '元素在视口右侧外' : null,
        right: screenBounds.right < -50 ? '元素在视口左侧外' : null,
        top: screenBounds.top > viewportHeight + 50 ? '元素在视口下方外' : null,
        bottom: screenBounds.bottom < -50 ? '元素在视口上方外' : null,
      },
    });
    return null;
  }

  // 5. 计算最佳位置
  const position = calculateBestPosition(screenBounds, config, viewportWidth, viewportHeight);

  console.log('PanelPositioning: 计算面板位置', {
    elements: elements.map((e) => ({ id: e.id, x: e.x, y: e.y, width: e.width, height: e.height })),
    worldBounds,
    screenBounds,
    position,
  });

  return position;
}
