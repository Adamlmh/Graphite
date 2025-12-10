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

import {
  CoordinateTransformer,
  type IElementProvider,
  type LocalPoint,
} from './CoordinateTransformer';
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
   * @param coordinateTransformer 坐标转换器（可选，默认创建新的，自动获取数据）
   */
  constructor(coordinateTransformer?: CoordinateTransformer) {
    // 如果没有传入坐标转换器，使用默认提供者创建新的（自动获取数据）
    this.coordinateTransformer = coordinateTransformer || new CoordinateTransformer();
  }

  /**
   * 计算元素的世界边界框（Bounds）
   *
   * @param element 元素提供者
   * @returns 元素的世界边界框
   */
  public getElementBoundsWorld(element: IElementProvider): Bounds {
    const size = element.getSize();

    // 统一通过四个角点计算 AABB，这样可以正确处理 pivot、scale 和 rotation
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

  public getElementWorldCorners(element: IElementProvider): Point[] {
    const size = element.getSize();
    const corners = [
      { x: 0, y: 0 },
      { x: size.width, y: 0 },
      { x: size.width, y: size.height },
      { x: 0, y: size.height },
    ];
    return corners.map((corner) =>
      this.coordinateTransformer.localToWorld(corner.x, corner.y, element),
    );
  }

  /**
   * 获取元素的世界坐标轮廓点
   * 用于计算 OBB（Oriented Bounding Box）
   *
   * @param element 元素提供者
   * @param elementType 元素类型（用于特殊处理圆形等）
   * @returns 世界坐标轮廓点数组
   */
  public getElementWorldOutlinePoints(element: IElementProvider, elementType: string): Point[] {
    const size = element.getSize();
    const rotation = element.getRotation();

    // 对于圆形和椭圆，使用椭圆采样公式（圆形是椭圆的特例，rx = ry）
    // 椭圆旋转后，最左/最右/最上/最下点不再对应固定的0°/90°/180°/270°点
    // 必须采样多个点（16个）才能确保旋转后能正确计算AABB
    if (elementType === 'circle') {
      const rx = size.width / 2;
      const ry = size.height / 2;
      const cx = size.width / 2;
      const cy = size.height / 2;

      // 椭圆采样16个点（每22.5°一个），确保任何旋转角度下都能正确计算AABB
      const steps = 16;
      const localPoints: Point[] = [];

      for (let i = 0; i < steps; i++) {
        const angle = (Math.PI * 2 * i) / steps;
        // 椭圆参数方程：x = cx + rx * cos(θ), y = cy + ry * sin(θ)
        localPoints.push({
          x: cx + rx * Math.cos(angle),
          y: cy + ry * Math.sin(angle),
        });
      }

      return localPoints.map((p) => this.coordinateTransformer.localToWorld(p.x, p.y, element));
    }

    // 对于三角形，需要采样三条边上的点
    // 只用3个顶点无法保证AABB贴紧三角形最外侧（特别是旋转后）
    if (elementType === 'triangle') {
      const localPoints: Point[] = [];
      const stepsPerEdge = 8; // 每条边采样8个点

      // 三角形的三个顶点（顶部为顶点）
      const vertices = [
        { x: size.width / 2, y: 0 }, // 顶部顶点
        { x: 0, y: size.height }, // 左下角
        { x: size.width, y: size.height }, // 右下角
      ];

      // 采样三条边
      for (let i = 0; i < 3; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 3];

        // 在边上均匀采样
        for (let j = 0; j <= stepsPerEdge; j++) {
          const t = j / stepsPerEdge;
          localPoints.push({
            x: v1.x + (v2.x - v1.x) * t,
            y: v1.y + (v2.y - v1.y) * t,
          });
        }
      }

      return localPoints.map((p) => this.coordinateTransformer.localToWorld(p.x, p.y, element));
    }

    // 对于矩形和图片，如果旋转了也需要采样边缘点
    // 如果未旋转，四个角点就足够了
    if (elementType === 'rect' || elementType === 'image') {
      const hasRotation = rotation !== 0 && rotation % 360 !== 0;

      if (hasRotation) {
        // 旋转的矩形需要采样四条边上的点，确保AABB贴紧真实边界
        const localPoints: Point[] = [];
        const stepsPerEdge = 8; // 每条边采样8个点

        // 矩形的四个顶点
        const vertices = [
          { x: 0, y: 0 }, // 左上角
          { x: size.width, y: 0 }, // 右上角
          { x: size.width, y: size.height }, // 右下角
          { x: 0, y: size.height }, // 左下角
        ];

        // 采样四条边
        for (let i = 0; i < 4; i++) {
          const v1 = vertices[i];
          const v2 = vertices[(i + 1) % 4];

          // 在边上均匀采样
          for (let j = 0; j <= stepsPerEdge; j++) {
            const t = j / stepsPerEdge;
            localPoints.push({
              x: v1.x + (v2.x - v1.x) * t,
              y: v1.y + (v2.y - v1.y) * t,
            });
          }
        }

        return localPoints.map((p) => this.coordinateTransformer.localToWorld(p.x, p.y, element));
      } else {
        // 未旋转的矩形，四个角点就足够了
        return this.getElementWorldCorners(element);
      }
    }

    // 对于其他元素类型（group等），使用四个角点
    return this.getElementWorldCorners(element);
  }

  /**
   * 计算点集的最小外接矩形（旋转卡尺算法）
   *
   * @param points 点数组
   * @returns OBB 信息
   */
  public computeMinimumBoundingBox(points: Point[]): {
    corners: Point[];
    rotation: number;
    center: Point;
    width: number;
    height: number;
  } {
    if (points.length === 0) {
      return {
        corners: [],
        rotation: 0,
        center: { x: 0, y: 0 },
        width: 0,
        height: 0,
      };
    }

    // 计算凸包
    const hull = this.computeConvexHull(points);
    if (hull.length < 2) {
      // 如果点太少，返回 AABB
      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const maxY = Math.max(...points.map((p) => p.y));
      return {
        corners: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
        rotation: 0,
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        width: maxX - minX,
        height: maxY - minY,
      };
    }

    // 旋转卡尺算法：找到最小面积的外接矩形
    let minArea = Infinity;
    let bestBox: {
      corners: Point[];
      rotation: number;
      center: Point;
      width: number;
      height: number;
    } | null = null;

    const n = hull.length;
    for (let i = 0; i < n; i++) {
      const p1 = hull[i];
      const p2 = hull[(i + 1) % n];

      // 计算边的方向向量
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      const ux = dx / len;
      const uy = dy / len;

      // 计算垂直于边的方向
      const vx = -uy;
      const vy = ux;

      // 将所有点投影到这个坐标系
      const projections: number[] = [];
      const perpProjections: number[] = [];

      hull.forEach((p) => {
        const px = p.x - p1.x;
        const py = p.y - p1.y;
        projections.push(px * ux + py * uy);
        perpProjections.push(px * vx + py * vy);
      });

      const minU = Math.min(...projections);
      const maxU = Math.max(...projections);
      const minV = Math.min(...perpProjections);
      const maxV = Math.max(...perpProjections);

      const width = maxU - minU;
      const height = maxV - minV;
      const area = width * height;

      if (area < minArea) {
        minArea = area;

        // 计算矩形的四个角点（在原始坐标系中）
        const centerU = (minU + maxU) / 2;
        const centerV = (minV + maxV) / 2;

        const corners = [
          {
            x: p1.x + (centerU - width / 2) * ux + (centerV - height / 2) * vx,
            y: p1.y + (centerU - width / 2) * uy + (centerV - height / 2) * vy,
          },
          {
            x: p1.x + (centerU + width / 2) * ux + (centerV - height / 2) * vx,
            y: p1.y + (centerU + width / 2) * uy + (centerV - height / 2) * vy,
          },
          {
            x: p1.x + (centerU + width / 2) * ux + (centerV + height / 2) * vx,
            y: p1.y + (centerU + width / 2) * uy + (centerV + height / 2) * vy,
          },
          {
            x: p1.x + (centerU - width / 2) * ux + (centerV + height / 2) * vx,
            y: p1.y + (centerU - width / 2) * uy + (centerV + height / 2) * vy,
          },
        ];

        const center = {
          x: p1.x + centerU * ux + centerV * vx,
          y: p1.y + centerU * uy + centerV * vy,
        };

        const rotation = Math.atan2(uy, ux) * (180 / Math.PI);

        bestBox = {
          corners,
          rotation,
          center,
          width,
          height,
        };
      }
    }

    return (
      bestBox || {
        corners: [],
        rotation: 0,
        center: { x: 0, y: 0 },
        width: 0,
        height: 0,
      }
    );
  }

  /**
   * 计算多个元素的轴对齐选择边界框（AABB）
   *
   * 这个方法收集所有元素的真实轮廓点（包括圆形的采样点），
   * 然后对这些点直接取AABB，得到一个水平不旋转的边界框。
   *
   * 与 computeMinimumBoundingBox 的区别：
   * - computeMinimumBoundingBox：返回旋转的OBB（Oriented Bounding Box）
   * - computeAxisAlignedSelectionBounds：返回水平不旋转的AABB
   *
   * @param elements 元素提供者数组
   * @param elementTypes 对应的元素类型数组（与elements顺序一致）
   * @returns AABB边界框
   */
  public computeAxisAlignedSelectionBounds(
    elements: IElementProvider[],
    elementTypes: string[],
  ): Bounds {
    if (elements.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const allPoints: Point[] = [];

    // Step 1: 收集所有元素的真实轮廓点（世界坐标）
    elements.forEach((element, index) => {
      const elementType = elementTypes[index] || element.getType();
      const outlinePoints = this.getElementWorldOutlinePoints(element, elementType);
      allPoints.push(...outlinePoints);
    });

    if (allPoints.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // Step 2: 对所有轮廓点直接取AABB（水平不旋转）
    const minX = Math.min(...allPoints.map((p) => p.x));
    const maxX = Math.max(...allPoints.map((p) => p.x));
    const minY = Math.min(...allPoints.map((p) => p.y));
    const maxY = Math.max(...allPoints.map((p) => p.y));

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * 计算点集的凸包（Graham Scan 算法）
   *
   * @param points 点数组（不会修改原数组）
   * @returns 凸包点数组（按逆时针顺序）
   */
  public computeConvexHull(points: Point[]): Point[] {
    if (points.length <= 3) return [...points];

    // 复制数组，避免修改原数组
    const pointsCopy = points.map((p) => ({ ...p }));

    // 找到最下方的点（y最大，如果相同则x最小）
    let bottomIndex = 0;
    for (let i = 1; i < pointsCopy.length; i++) {
      if (
        pointsCopy[i].y > pointsCopy[bottomIndex].y ||
        (pointsCopy[i].y === pointsCopy[bottomIndex].y &&
          pointsCopy[i].x < pointsCopy[bottomIndex].x)
      ) {
        bottomIndex = i;
      }
    }

    // 交换到第一个位置
    [pointsCopy[0], pointsCopy[bottomIndex]] = [pointsCopy[bottomIndex], pointsCopy[0]];

    const pivot = pointsCopy[0];

    // 按极角排序
    const sorted = pointsCopy.slice(1).sort((a, b) => {
      const cross = (a.x - pivot.x) * (b.y - pivot.y) - (a.y - pivot.y) * (b.x - pivot.x);
      if (Math.abs(cross) < 1e-10) {
        // 共线，按距离排序
        const distA = (a.x - pivot.x) ** 2 + (a.y - pivot.y) ** 2;
        const distB = (b.x - pivot.x) ** 2 + (b.y - pivot.y) ** 2;
        return distA - distB;
      }
      return cross > 0 ? -1 : 1;
    });

    const hull = [{ ...pivot }, { ...sorted[0] }];

    for (let i = 1; i < sorted.length; i++) {
      const point = sorted[i];
      while (
        hull.length > 1 &&
        (hull[hull.length - 1].x - hull[hull.length - 2].x) * (point.y - hull[hull.length - 2].y) -
          (hull[hull.length - 1].y - hull[hull.length - 2].y) *
            (point.x - hull[hull.length - 2].x) <=
          0
      ) {
        hull.pop();
      }
      hull.push({ ...point });
    }

    return hull;
  }

  /**
   * 判断两个矩形（Bounds）是否相交（AABB 相交检测）
   *
   * @param a 矩形 A
   * @param b 矩形 B
   * @returns 如果两个矩形相交返回 true，否则返回 false
   */
  public rectIntersect(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      a.x > b.x + b.width ||
      a.y + a.height < b.y ||
      a.y > b.y + b.height
    );
  }

  public rectContainsPoints(rect: Bounds, points: Point[]): boolean {
    const rx1 = rect.x;
    const ry1 = rect.y;
    const rx2 = rect.x + rect.width;
    const ry2 = rect.y + rect.height;
    for (const p of points) {
      if (p.x < rx1 || p.x > rx2 || p.y < ry1 || p.y > ry2) {
        return false;
      }
    }
    return true;
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

  /**
   * 判断点是否在矩形内部
   *
   * @param localPoint 局部坐标点
   * @param size 矩形尺寸
   */
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
   * 使用叉积计算面积比
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
    // 计算叉积（有向面积的两倍）
    const cross = (v1x: number, v1y: number, v2x: number, v2y: number): number => {
      return v1x * v2y - v1y * v2x;
    };

    // 向量：v0 = B - A, v1 = C - A, v2 = P - A
    const v0x = b.x - a.x;
    const v0y = b.y - a.y;
    const v1x = c.x - a.x;
    const v1y = c.y - a.y;
    const v2x = localPoint.x - a.x;
    const v2y = localPoint.y - a.y;

    // 计算叉积
    const denom = cross(v0x, v0y, v1x, v1y); // AB × AC
    if (Math.abs(denom) < 1e-10) {
      return false; // 三角形退化
    }

    // 使用重心坐标法求解
    // P = A + u*(B-A) + v*(C-A)
    // 即：v2 = u*v0 + v*v1
    // 通过叉积求解：
    // v2 × v1 = u*(v0 × v1) => u = (v2 × v1) / (v0 × v1)
    // v0 × v2 = v*(v0 × v1) => v = (v0 × v2) / (v0 × v1)
    const cross_v2_v1 = cross(v2x, v2y, v1x, v1y); // AP × AC
    const cross_v0_v2 = cross(v0x, v0y, v2x, v2y); // AB × AP

    const u = cross_v2_v1 / denom;
    const v = cross_v0_v2 / denom;

    // 点在三角形内部当且仅当 u >= 0, v >= 0, u + v <= 1
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
   *
   * @param type 元素类型
   * @returns 距离计算类别
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
   *
   * @param circleA 圆形A
   * @param circleB 圆形B
   * @returns 圆形到圆形的距离
   */
  private getDistanceCircleToCircle(circleA: IElementProvider, circleB: IElementProvider): number {
    const geometryA = this.getCircleGeometry(circleA);
    const geometryB = this.getCircleGeometry(circleB);

    const dx = geometryB.center.x - geometryA.center.x;
    const dy = geometryB.center.y - geometryA.center.y;
    const centerDistance = Math.sqrt(dx * dx + dy * dy);

    const sumRadius = geometryA.radius + geometryB.radius;
    if (centerDistance <= sumRadius) {
      return 0;
    }

    return centerDistance - sumRadius;
  }

  /**
   * 计算圆形到多边形的距离
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
   *
   * @param polygonA 多边形A
   * @param polygonB 多边形B
   * @returns 多边形到多边形的距离
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
   *
   * @param polygon 多边形
   * @param line 直线
   * @returns 多边形到直线的距离
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
    const size = element.getSize();
    const scale = element.getScale();
    const pivot = element.getPivot();

    const width = size.width * scale.scaleX;
    const height = size.height * scale.scaleY;

    const localCenterX = size.width * pivot.pivotX;
    const localCenterY = size.height * pivot.pivotY;
    const center = this.coordinateTransformer.localToWorld(localCenterX, localCenterY, element);

    const radius = Math.max(width, height) / 2;

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
   *
   * @param points 点集
   * @param polygonPoints 多边形顶点集
   * @returns 点集到多边形的最短距离
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
   *
   * @param point 点
   * @param polygonPoints 多边形顶点集
   * @returns 点到多边形的最短距离
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
