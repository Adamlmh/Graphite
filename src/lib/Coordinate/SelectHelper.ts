import type { Point } from '../../types';
import type { Bounds } from './ViewportManager';
import { GeometryService } from './GeometryService';
import { ElementProvider } from './providers/ElementProvider';
import { useCanvasStore } from '../../stores/canvas-store';

/**
 * 选择辅助类 - 提供框选区域查询功能
 *
 * 职责：
 * 1. 接收框选区域（世界坐标）
 * 2. 返回命中的元素 ID 列表
 *
 * 这是纯查询逻辑，不修改交互层，也不修改几何层
 */
export class SelectHelper {
  private geometryService: GeometryService;

  /**
   * 构造函数
   * @param geometryService 几何服务实例（可选，默认创建新的）
   */
  constructor(geometryService?: GeometryService) {
    this.geometryService = geometryService || new GeometryService();
  }

  /**
   * 获取框选区域内的元素 ID 列表
   *
   * @param worldTopLeft 框选区域左上角坐标（世界坐标）
   * @param worldBottomRight 框选区域右下角坐标（世界坐标）
   * @returns 命中的元素 ID 数组
   */
  public getElementsInSelectionBox(worldTopLeft: Point, worldBottomRight: Point): string[] {
    // 1. 根据传入坐标构建 Bounds
    const selectionBox: Bounds = {
      x: Math.min(worldTopLeft.x, worldBottomRight.x),
      y: Math.min(worldTopLeft.y, worldBottomRight.y),
      width: Math.abs(worldBottomRight.x - worldTopLeft.x),
      height: Math.abs(worldBottomRight.y - worldTopLeft.y),
    };

    // 2. 从 useCanvasStore 获取元素列表
    const state = useCanvasStore.getState();
    const elementList = Object.values(state.elements || {});

    const selectedElementIds: string[] = [];

    // 3. 遍历每个元素进行检测
    for (const element of elementList) {
      // 跳过隐藏的元素
      if (element.visibility === 'hidden') {
        continue;
      }

      // 4. 为每个元素构造 ElementProvider
      const elementProvider = new ElementProvider(element.id);

      // 5. 调用 geometry.getElementBoundsWorld(provider) 获取元素世界边界框
      const elementBounds = this.geometryService.getElementBoundsWorld(elementProvider);

      // 6. 调用 geometry.rectIntersect(selectionBox, elementBounds) 判断是否相交
      if (this.geometryService.rectIntersect(selectionBox, elementBounds)) {
        // 命中则加入结果数组
        selectedElementIds.push(element.id);
      }
    }

    // 7. 返回最终元素 ID 列表
    return selectedElementIds;
  }
}
