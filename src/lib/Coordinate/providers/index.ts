/**
 * 坐标系统提供者模块
 * 导出所有提供者实现
 *
 * 这些提供者能够自动获取数据，无需外部传入：
 * - ViewportProvider: 自动从 canvas-store 获取视口状态
 * - CanvasDOMProvider: 自动从 pixiApp 获取画布 DOM 元素
 * - ElementProvider: 根据元素 ID 自动从 canvas-store 获取元素数据
 */

export { ViewportProvider } from './ViewportProvider';
export { CanvasDOMProvider } from './CanvasDOMProvider';
export { ElementProvider } from './ElementProvider';
