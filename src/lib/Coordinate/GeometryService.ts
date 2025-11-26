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

/**
 * 直线定义（两点确定一条直线）
 */
export interface Line {
  start: Point;
  end: Point;
}

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
   * @returns 两个元素之间的最短距离
   */
  public getDistanceBetweenElements(elA: IElementProvider, elB: IElementProvider): number {
    const typeA = elA.getType();
    const typeB = elB.getType();

    // 根据元素类型分发到不同的计算方法
    // 圆形到其他元素
    if (typeA === 'circle') {
      if (typeB === 'circle') {
        return this.getDistanceCircleToCircle(elA, elB);
      } else if (typeB === 'triangle') {
        return this.getDistanceCircleToTriangle(elA, elB);
      } else {
        return this.getDistanceCircleToRect(elA, elB);
      }
    }

    // 三角形到其他元素
    if (typeA === 'triangle') {
      if (typeB === 'circle') {
        return this.getDistanceTriangleToCircle(elA, elB);
      } else if (typeB === 'triangle') {
        return this.getDistanceTriangleToTriangle(elA, elB);
      } else {
        return this.getDistanceTriangleToRect(elA, elB);
      }
    }

    // 矩形/文本/图片/group 到其他元素
    if (typeB === 'circle') {
      return this.getDistanceRectToCircle(elA, elB);
    } else if (typeB === 'triangle') {
      return this.getDistanceRectToTriangle(elA, elB);
    } else {
      return this.getDistanceRectToRect(elA, elB);
    }
  }

  /**
   * 计算元素到直线的距离
   *
   * @param element 元素提供者
   * @param line 直线
   * @returns 元素到直线的最短距离
   */
  public getDistanceElementToLine(element: IElementProvider, line: Line): number {
    const type = element.getType();

    switch (type) {
      case 'circle':
        return this.getDistanceCircleToLine(element, line);
      case 'triangle':
        return this.getDistanceTriangleToLine(element, line);
      default:
        return this.getDistanceRectToLine(element, line);
    }
  }

  // ==================== 圆形距离计算方法 ====================

  /**
   * 计算圆形到圆形的距离
   *
   * 算法：
   * 1. 计算两个圆心的距离
   * 2. 如果圆心距离 <= 两个半径之和，说明相交或包含，距离为 0
   * 3. 否则，距离 = 圆心距离 - (半径A + 半径B)
   */
  private getDistanceCircleToCircle(circleA: IElementProvider, circleB: IElementProvider): number {
    // 获取两个圆的位置和尺寸
    const posA = circleA.getPosition();
    const sizeA = circleA.getSize();
    const posB = circleB.getPosition();
    const sizeB = circleB.getSize();

    // 计算圆心位置（考虑 pivot）
    const pivotA = circleA.getPivot();
    const pivotB = circleB.getPivot();
    const centerA = {
      x: posA.x + sizeA.width * pivotA.pivotX,
      y: posA.y + sizeA.height * pivotA.pivotY,
    };
    const centerB = {
      x: posB.x + sizeB.width * pivotB.pivotX,
      y: posB.y + sizeB.height * pivotB.pivotY,
    };

    // 计算圆心距离
    const dx = centerB.x - centerA.x;
    const dy = centerB.y - centerA.y;
    const centerDistance = Math.sqrt(dx * dx + dy * dy);

    // 计算半径
    const radiusA = sizeA.width / 2;
    const radiusB = sizeB.width / 2;

    // 如果圆心距离小于等于两个半径之和，说明相交或包含
    const sumRadius = radiusA + radiusB;
    if (centerDistance <= sumRadius) {
      return 0;
    }

    // 否则，距离 = 圆心距离 - 两个半径之和
    return centerDistance - sumRadius;
  }

  /**
   * 计算圆形到三角形的距离
   * TODO: 实现具体算法
   */
  private getDistanceCircleToTriangle(
    circle: IElementProvider,
    triangle: IElementProvider,
  ): number {
    void circle;
    void triangle;
    // TODO: 实现圆形到三角形的距离计算
    return 0;
  }

  /**
   * 计算圆形到矩形（包括文本、图片、group）的距离
   * TODO: 实现具体算法
   */
  private getDistanceCircleToRect(circle: IElementProvider, rect: IElementProvider): number {
    void circle;
    void rect;
    // TODO: 实现圆形到矩形的距离计算
    return 0;
  }

  /**
   * 计算圆形到直线的距离
   * TODO: 实现具体算法
   */
  private getDistanceCircleToLine(circle: IElementProvider, line: Line): number {
    void circle;
    void line;
    // TODO: 实现圆形到直线的距离计算
    return 0;
  }

  // ==================== 三角形距离计算方法 ====================

  /**
   * 计算三角形到圆形的距离
   * TODO: 实现具体算法
   */
  private getDistanceTriangleToCircle(
    triangle: IElementProvider,
    circle: IElementProvider,
  ): number {
    void triangle;
    void circle;
    // TODO: 实现三角形到圆形的距离计算
    return 0;
  }

  /**
   * 计算三角形到三角形的距离
   * TODO: 实现具体算法
   */
  private getDistanceTriangleToTriangle(
    triangleA: IElementProvider,
    triangleB: IElementProvider,
  ): number {
    void triangleA;
    void triangleB;
    // TODO: 实现三角形到三角形的距离计算
    return 0;
  }

  /**
   * 计算三角形到矩形（包括文本、图片、group）的距离
   * TODO: 实现具体算法
   */
  private getDistanceTriangleToRect(triangle: IElementProvider, rect: IElementProvider): number {
    void triangle;
    void rect;
    // TODO: 实现三角形到矩形的距离计算
    return 0;
  }

  /**
   * 计算三角形到直线的距离
   * TODO: 实现具体算法
   */
  private getDistanceTriangleToLine(triangle: IElementProvider, line: Line): number {
    void triangle;
    void line;
    // TODO: 实现三角形到直线的距离计算
    return 0;
  }

  // ==================== 矩形距离计算方法 ====================

  /**
   * 计算矩形（包括文本、图片、group）到圆形的距离
   * TODO: 实现具体算法
   */
  private getDistanceRectToCircle(rect: IElementProvider, circle: IElementProvider): number {
    void rect;
    void circle;
    // TODO: 实现矩形到圆形的距离计算
    return 0;
  }

  /**
   * 计算矩形（包括文本、图片、group）到三角形的距离
   * TODO: 实现具体算法
   */
  private getDistanceRectToTriangle(rect: IElementProvider, triangle: IElementProvider): number {
    void rect;
    void triangle;
    // TODO: 实现矩形到三角形的距离计算
    return 0;
  }

  /**
   * 计算矩形（包括文本、图片、group）到矩形的距离
   * TODO: 实现具体算法
   */
  private getDistanceRectToRect(rectA: IElementProvider, rectB: IElementProvider): number {
    void rectA;
    void rectB;
    // TODO: 实现矩形到矩形的距离计算
    return 0;
  }

  /**
   * 计算矩形（包括文本、图片、group）到直线的距离
   * TODO: 实现具体算法
   */
  private getDistanceRectToLine(rect: IElementProvider, line: Line): number {
    void rect;
    void line;
    // TODO: 实现矩形到直线的距离计算
    return 0;
  }
}
