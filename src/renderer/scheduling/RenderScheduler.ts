// renderer/scheduling/RenderScheduler.ts
import * as PIXI from 'pixi.js';
import { RenderPriority } from '../../types/render.types';
/**
 * 渲染调度器 - 负责优化渲染性能和调度渲染时机
 * 职责：帧率控制、渲染调度
 */
export class RenderScheduler {
  private pixiApp: PIXI.Application;
  private isRendering: boolean = false;

  constructor(pixiApp: PIXI.Application) {
    this.pixiApp = pixiApp;
  }

  /**
   * 调度渲染
   */
  scheduleRender(priority: RenderPriority = RenderPriority.NORMAL): void {
    console.log(`RenderScheduler: 调度渲染，优先级 ${priority}`);

    // PIXI.Application 默认自动渲染，无需手动触发
    // 高优先级任务可以立即更新ticker
    if (priority >= RenderPriority.HIGH) {
      this.immediateUpdate();
    }
  }

  /**
   * 立即更新（用于高优先级任务）
   */
  private immediateUpdate(): void {
    // 触发一次ticker更新，确保立即渲染
    this.pixiApp.ticker.update();
  }

  /**
   * 下一帧渲染（已移除，因为PIXI自动处理）
   */
  // private nextFrameRender(): void { ... }

  /**
   * 开始批量操作
   */
  startBatch(): void {
    console.log('RenderScheduler: 开始批量操作');
  }

  /**
   * 提交批量操作
   */
  commitBatch(): void {
    console.log('RenderScheduler: 提交批量操作');
    this.scheduleRender(RenderPriority.HIGH);
  }
}
