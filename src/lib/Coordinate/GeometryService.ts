/**
 * 几何计算模块（GeometryService）
 *
 * 职责：
 * 1. 元素世界边界框计算（Bounds）
 * 2. 点是否在元素内部（命中检测）
 * 3. 元素之间距离计算
 *
 * todo 元素间的距离需要修改，可能要多种情况下分别进行计算
 *
 */

import type { CoordinateTransformer, IElementProvider, LocalPoint } from './CoordinateTransformer';
import type { Point } from '../../types';
import type { Bounds } from './ViewportManager';

export class GeometryService {
  private coordinateTransformer: CoordinateTransformer;

  /**
   * 构造函数
   * @param coordinateTransformer 坐标转换器（用于 worldToLocal 和 localToWorld）
   */
  constructor(coordinateTransformer: CoordinateTransformer) {
    this.coordinateTransformer = coordinateTransformer;
  }

  /**
   * 计算元素的世界边界框（Bounds）
   *
   * @param element 元素提供者
   * @returns 元素的世界边界框
   */
  public getElementBoundsWorld(element: IElementProvider): Bounds {
    const position = element.getPosition();
    const size = element.getSize();
    const rotation = element.getRotation();
    const scale = element.getScale();

    // 无旋转情况：直接计算
    if (rotation === 0 || rotation % 360 === 0) {
      return {
        x: position.x,
        y: position.y,
        width: size.width * scale.scaleX,
        height: size.height * scale.scaleY,
      };
    }

    // 有旋转情况：通过四个角点计算 AABB
    // 获取元素的局部四个角点
    const corners = [
      { x: 0, y: 0 }, // 左上角
      { x: size.width, y: 0 }, // 右上角
      { x: size.width, y: size.height }, // 右下角
      { x: 0, y: size.height }, // 左下角
    ];

    // 将四个角点转换为世界坐标
    const worldCorners = corners.map((corner) =>
      this.coordinateTransformer.localToWorld(corner.x, corner.y, element),
    );

    // 计算最小外接矩形（AABB）
    const minX = Math.min(...worldCorners.map((p) => p.x));
    const maxX = Math.max(...worldCorners.map((p) => p.x));
    const minY = Math.min(...worldCorners.map((p) => p.y));
    const maxY = Math.max(...worldCorners.map((p) => p.y));

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * 判断点是否在元素内部（命中检测）
   *
   * @param worldPoint 世界坐标点
   * @param element 元素提供者
   * @returns 如果点在元素内部返回 true，否则返回 false
   */
  public isPointInElement(worldPoint: Point, element: IElementProvider): boolean {
    // 将世界坐标转换为元素局部坐标
    const localPoint = this.coordinateTransformer.worldToLocal(worldPoint.x, worldPoint.y, element);

    const size = element.getSize();
    const type = element.getType();

    switch (type) {
      case 'circle':
        return this.isPointInCircle(localPoint, size);
      case 'triangle':
        return this.isPointInTriangle(localPoint, size, element);
      default:
        return this.isPointInRect(localPoint, size);
    }
  }

  private isPointInRect(localPoint: LocalPoint, size: { width: number; height: number }): boolean {
    if (size.width === 0 || size.height === 0) return false;

    return (
      localPoint.x >= 0 &&
      localPoint.x <= size.width &&
      localPoint.y >= 0 &&
      localPoint.y <= size.height
    );
  }

  /**
   * 判断点是否在圆形内部
   *
   * @param localPoint 局部坐标点
   * @param size 圆形尺寸
   */
  private isPointInCircle(
    localPoint: LocalPoint,
    size: { width: number; height: number },
  ): boolean {
    const radiusX = size.width / 2;
    const radiusY = size.height / 2;
    if (radiusX <= 0 || radiusY <= 0) return false;

    // 计算离心率 小于1则点在圆形内部
    const normalized =
      Math.pow((localPoint.x - radiusX) / radiusX, 2) +
      Math.pow((localPoint.y - radiusY) / radiusY, 2);

    return normalized <= 1;
  }

  /**
   * 判断点是否在三角形内部
   *
   * @param localPoint 局部坐标点
   * @param size 三角形尺寸
   */
  private isPointInTriangle(
    localPoint: LocalPoint,
    size: { width: number; height: number },
    element: IElementProvider,
  ): boolean {
    const points = element.getLocalPoints?.();
    if (Array.isArray(points) && points.length === 3) {
      const [a, b, c] = points;
      return this.hitTriangleUsingBarycentric(localPoint, a, b, c);
    }

    if (size.width === 0 || size.height === 0) return false;

    const top: LocalPoint = { x: size.width / 2, y: 0 };
    const bottomRight: LocalPoint = { x: size.width, y: size.height };
    const bottomLeft: LocalPoint = { x: 0, y: size.height };

    return this.hitTriangleUsingBarycentric(localPoint, top, bottomRight, bottomLeft);
  }

  /**
   * 判断点是否在三角形内部 使用重心坐标法
   *
   * @param localPoint 局部坐标点
   * @param a 三角形顶点A
   * @param b 三角形顶点B
   * @param c 三角形顶点C
   */
  private hitTriangleUsingBarycentric(
    localPoint: LocalPoint,
    a: LocalPoint,
    b: LocalPoint,
    c: LocalPoint,
  ): boolean {
    const denom = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
    if (denom === 0) {
      return false;
    }

    const u = ((localPoint.y - a.y) * (c.x - a.x) - (localPoint.x - a.x) * (c.y - a.y)) / denom;
    const v = ((localPoint.y - a.y) * (b.x - a.x) - (localPoint.x - a.x) * (b.y - a.y)) / denom;

    return u >= 0 && v >= 0 && u + v <= 1;
  }

  /**
   * 计算两个元素之间的距离
   *
   * @param elA 元素 A 提供者
   * @param elB 元素 B 提供者
   * @returns 两个元素中心点之间的欧氏距离
   */
  public getDistanceBetweenElements(elA: IElementProvider, elB: IElementProvider): number {
    // 获取两个元素的边界框
    const boundsA = this.getElementBoundsWorld(elA);
    const boundsB = this.getElementBoundsWorld(elB);

    // 计算各自边界框的中心点
    const centerA = {
      x: boundsA.x + boundsA.width / 2,
      y: boundsA.y + boundsA.height / 2,
    };

    const centerB = {
      x: boundsB.x + boundsB.width / 2,
      y: boundsB.y + boundsB.height / 2,
    };

    const dx = centerB.x - centerA.x;
    const dy = centerB.y - centerA.y;

    return Math.sqrt(dx * dx + dy * dy);
  }
}
