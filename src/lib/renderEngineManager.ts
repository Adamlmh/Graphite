import type { RenderEngine } from '../renderer/RenderEngine';

/**
 * RenderEngine 全局管理器
 * 提供全局访问 RenderEngine 实例的方法
 */
let renderEngineInstance: RenderEngine | null = null;

/**
 * 设置 RenderEngine 实例
 */
export function setRenderEngine(engine: RenderEngine | null): void {
  renderEngineInstance = engine;
}

/**
 * 获取 RenderEngine 实例
 */
export function getRenderEngine(): RenderEngine | null {
  return renderEngineInstance;
}
