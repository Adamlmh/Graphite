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
    const categoryA = this.mapTypeToCategory(typeA);
    const categoryB = this.mapTypeToCategory(typeB);

    if (categoryA === 'circle' && categoryB === 'circle') {
      return this.getDistanceCircleToCircle(elA, elB);
    }

    if (categoryA === 'circle' && categoryB === 'polygon') {
      return this.getDistanceCircleToPolygon(elA, elB);
    }

    if (categoryA === 'polygon' && categoryB === 'circle') {
      return this.getDistanceCircleToPolygon(elB, elA);
    }

    return this.getDistancePolygonToPolygon(elA, elB);
  }

  /**
   * 计算元素到直线的距离
   *
   * @param element 元素提供者
   * @param line 直线
   * @returns 元素到直线的最短距离
   */
  public getDistanceElementToLine(element: IElementProvider, line: Line): number {
    const category = this.mapTypeToCategory(element.getType());

    if (category === 'circle') {
      return this.getDistanceCircleToLine(element, line);
    }

    return this.getDistancePolygonToLine(element, line);
  }

  /**
   * 元素类型 -> 距离计算类别映射
   */
  private mapTypeToCategory(type: string): 'circle' | 'polygon' {
    if (type === 'circle') {
      return 'circle';
    }
    return 'polygon';
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
   * 计算圆形到多边形的距离
   * TODO: 实现具体算法
   *
   * @param circle 圆形
   * @param polygon 多边形
   */
  private getDistanceCircleToPolygon(circle: IElementProvider, polygon: IElementProvider): number {
    const { center, radius } = this.getCircleGeometry(circle);

    // 如果圆心已经在多边形内部，说明相交，距离为 0
    if (this.isPointInElement(center, polygon)) {
      return 0;
    }

    const polygonPoints = this.getPolygonWorldPoints(polygon);
    if (polygonPoints.length === 0) {
      // 没有多边形顶点信息，退化为圆心到元素位置的距离
      const fallbackPoint = polygon.getPosition();
      const distance = this.getDistancePointToPoint(center, fallbackPoint);
      return Math.max(distance - radius, 0);
    }

    let minDistance = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < polygonPoints.length; i++) {
      const current = polygonPoints[i];
      const next = polygonPoints[(i + 1) % polygonPoints.length];
      const distance = this.getDistancePointToSegment(center, current, next);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    return Math.max(minDistance - radius, 0);
  }

  /**
   * 计算圆形到直线的距离
   *
   * @param circle 圆形
   * @param line 直线
   */
  private getDistanceCircleToLine(circle: IElementProvider, line: Line): number {
    const { center, radius } = this.getCircleGeometry(circle);
    const distance = this.getDistancePointToSegment(center, line.start, line.end);
    return Math.max(distance - radius, 0);
  }

  // ==================== 多边形距离计算方法 ====================

  /**
   * 计算多边形到多边形的距离
   */
  private getDistancePolygonToPolygon(
    polygonA: IElementProvider,
    polygonB: IElementProvider,
  ): number {
    const pointsA = this.getPolygonWorldPoints(polygonA);
    const pointsB = this.getPolygonWorldPoints(polygonB);

    if (pointsA.length < 2 || pointsB.length < 2) {
      return Number.MAX_SAFE_INTEGER;
    }

    const minDistanceAtoB = this.getMinDistancePointSetToPolygon(pointsA, pointsB);
    const minDistanceBtoA = this.getMinDistancePointSetToPolygon(pointsB, pointsA);

    return Math.min(minDistanceAtoB, minDistanceBtoA);
  }

  /**
   * 计算多边形到直线的距离
   */
  private getDistancePolygonToLine(polygon: IElementProvider, line: Line): number {
    const polygonPoints = this.getPolygonWorldPoints(polygon);
    if (polygonPoints.length < 2) {
      return Number.MAX_SAFE_INTEGER;
    }

    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < polygonPoints.length; i++) {
      const current = polygonPoints[i];
      const next = polygonPoints[(i + 1) % polygonPoints.length];
      const distance = this.getDistanceSegmentToSegment(current, next, line.start, line.end);
      if (distance < minDistance) {
        minDistance = distance;
      }
      if (minDistance === 0) {
        return 0;
      }
    }

    return minDistance;
  }

  /**
   * 计算圆的几何信息（圆心、半径）
   *
   * @param element 元素提供者
   */
  private getCircleGeometry(element: IElementProvider): { center: Point; radius: number } {
    const position = element.getPosition();
    const size = element.getSize();
    const scale = element.getScale();
    const pivot = element.getPivot();

    const width = size.width * scale.scaleX;
    const height = size.height * scale.scaleY;

    const center: Point = {
      x: position.x + width * pivot.pivotX,
      y: position.y + height * pivot.pivotY,
    };

    const radius = width / 2;

    return { center, radius };
  }

  /**
   * 获取多边形的世界坐标顶点列表
   *
   * @param element 元素提供者
   */
  private getPolygonWorldPoints(element: IElementProvider): Point[] {
    const localPoints = element.getLocalPoints?.();
    if (!Array.isArray(localPoints) || localPoints.length < 2) {
      return [];
    }

    return localPoints.map((point) =>
      this.coordinateTransformer.localToWorld(point.x, point.y, element),
    );
  }

  /**
   * 计算点到另一点的距离
   *
   * @param a 点A
   * @param b 点B
   */
  private getDistancePointToPoint(a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 计算点到线段的最短距离
   *
   * @param point 点
   * @param start 线段起点
   * @param end 线段终点
   */
  private getDistancePointToSegment(point: Point, start: Point, end: Point): number {
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;

    if (lengthSquared === 0) {
      return this.getDistancePointToPoint(point, start);
    }

    // 根据 AP 和 AB 向量的点乘确定投影点在AB上的位置
    // 如果投影点在AB上，则t的值在0到1之间，如果t小于0，则投影点在AB的起点之前，如果t大于1，则投影点在AB的终点之后
    const t = ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared;

    const clampedT = Math.max(0, Math.min(1, t));
    const closestPoint = {
      x: start.x + clampedT * segmentX,
      y: start.y + clampedT * segmentY,
    };

    return this.getDistancePointToPoint(point, closestPoint);
  }

  /**
   * 计算两条线段之间的最短距离
   *
   * @param aStart 线段A起点
   * @param aEnd 线段A终点
   * @param bStart 线段B起点
   * @param bEnd 线段B终点
   */
  private getDistanceSegmentToSegment(
    aStart: Point,
    aEnd: Point,
    bStart: Point,
    bEnd: Point,
  ): number {
    if (this.doSegmentsIntersect(aStart, aEnd, bStart, bEnd)) {
      return 0;
    }

    return Math.min(
      this.getDistancePointToSegment(aStart, bStart, bEnd),
      this.getDistancePointToSegment(aEnd, bStart, bEnd),
      this.getDistancePointToSegment(bStart, aStart, aEnd),
      this.getDistancePointToSegment(bEnd, aStart, aEnd),
    );
  }

  /**
   * 判断两条线段是否相交
   *
   * @param aStart 线段A起点
   * @param aEnd 线段A终点
   * @param bStart 线段B起点
   * @param bEnd 线段B终点
   */
  private doSegmentsIntersect(aStart: Point, aEnd: Point, bStart: Point, bEnd: Point): boolean {
    const o1 = this.orientation(aStart, aEnd, bStart);
    const o2 = this.orientation(aStart, aEnd, bEnd);
    const o3 = this.orientation(bStart, bEnd, aStart);
    const o4 = this.orientation(bStart, bEnd, aEnd);

    if (o1 !== o2 && o3 !== o4) {
      return true;
    }

    if (o1 === 0 && this.onSegment(aStart, bStart, aEnd)) return true;
    if (o2 === 0 && this.onSegment(aStart, bEnd, aEnd)) return true;
    if (o3 === 0 && this.onSegment(bStart, aStart, bEnd)) return true;
    if (o4 === 0 && this.onSegment(bStart, aEnd, bEnd)) return true;

    return false;
  }

  /**
   * 计算线段的朝向
   *
   * @param a 点A
   * @param b 点B
   * @param c 点C
   */
  private orientation(a: Point, b: Point, c: Point): number {
    const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (value === 0) return 0;
    return value > 0 ? 1 : 2;
  }

  /**
   * 判断点是否在线段上
   *
   * @param start 线段起点
   * @param point 点
   * @param end 线段终点
   */
  private onSegment(start: Point, point: Point, end: Point): boolean {
    return (
      Math.min(start.x, end.x) <= point.x &&
      point.x <= Math.max(start.x, end.x) &&
      Math.min(start.y, end.y) <= point.y &&
      point.y <= Math.max(start.y, end.y)
    );
  }

  /**
   * 计算一组点到多边形的最短距离
   */
  private getMinDistancePointSetToPolygon(points: Point[], polygonPoints: Point[]): number {
    let minDistance = Number.POSITIVE_INFINITY;

    for (const point of points) {
      const distance = this.getDistancePointToPolygon(point, polygonPoints);
      if (distance < minDistance) {
        minDistance = distance;
      }

      if (minDistance === 0) {
        return 0;
      }
    }

    return minDistance;
  }

  /**
   * 计算点到多边形的距离
   */
  private getDistancePointToPolygon(point: Point, polygonPoints: Point[]): number {
    let minDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < polygonPoints.length; i++) {
      const current = polygonPoints[i];
      const next = polygonPoints[(i + 1) % polygonPoints.length];
      const distance = this.getDistancePointToSegment(point, current, next);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    return minDistance;
  }
}
