/**
 * 坐标系统模块统一导出
 *
 * 提供完整的坐标转换、几何计算和视口管理功能
 * 所有模块都支持自动获取数据，无需手动传入提供者
 */

// 核心模块
export { CoordinateTransformer } from './CoordinateTransformer';
export type {
  IViewportProvider,
  ICanvasDOMProvider,
  IElementProvider,
  ScreenPoint,
  CanvasPoint,
  WorldPoint,
  LocalPoint,
} from './CoordinateTransformer';

// 几何计算模块
export { GeometryService } from './GeometryService';
export type { Line } from './GeometryService';

// 视口管理模块
export { ViewportManager } from './ViewportManager';
export type { Bounds } from './ViewportManager';

// 提供者实现（自动获取数据）
export { ViewportProvider, CanvasDOMProvider, ElementProvider } from './providers';
