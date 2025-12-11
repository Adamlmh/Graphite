/* eslint-disable @typescript-eslint/no-explicit-any */
import * as PIXI from 'pixi.js';
import { useCanvasStore } from '../../stores/canvas-store';
import type { ViewportState } from '../../types';
import { RenderPriority } from '../../types/render.types';
import { ViewportController } from '../viewport/ViewportController';

/**
 * 负责滚动条的绘制与交互，将Thumb位置与大小映射为Viewport的offset更新。
 * 计算基于“工作区bounds”而非仅内容bounds，保证缩小时也有合理的滚动反馈。
 */
export class ScrollbarManager {
  private app: PIXI.Application;
  private container: PIXI.Container;
  private hTrack: PIXI.Graphics;
  private hThumb: PIXI.Graphics;
  private vTrack: PIXI.Graphics;
  private vThumb: PIXI.Graphics;
  private viewportController: ViewportController;
  private dragging: 'h' | 'v' | null = null;
  private dragStartPos: PIXI.Point = new PIXI.Point(0, 0);
  private dragStartOffset = { x: 0, y: 0 };

  constructor(app: PIXI.Application, viewportController: ViewportController) {
    this.app = app;
    this.viewportController = viewportController;
    this.container = new PIXI.Container();
    this.container.name = 'SCROLLBARS';
    this.container.interactive = true;
    this.app.stage.addChild(this.container);
    this.hTrack = new PIXI.Graphics();
    this.hThumb = new PIXI.Graphics();
    this.vTrack = new PIXI.Graphics();
    this.vThumb = new PIXI.Graphics();
    this.container.addChild(this.hTrack);
    this.container.addChild(this.hThumb);
    this.container.addChild(this.vTrack);
    this.container.addChild(this.vThumb);
    this.bindThumbInteractions();
  }

  refresh(vp: ViewportState): void {
    const cw = this.app.renderer.width;
    const ch = this.app.renderer.height;
    const m = 8;
    const t = 6;
    const z = vp.zoom;
    // 基于工作区bounds计算滚动条
    const wb = this.viewportController.getWorkingBounds(vp);
    const vw = cw / z;
    const vh = ch / z;
    const contentW = Math.max(1, wb.width);
    const contentH = Math.max(1, wb.height);
    const hTrackLen = Math.max(0, cw - m * 2 - t);
    const vTrackLen = Math.max(0, ch - m * 2 - t);
    const hRatio = Math.min(1, vw / contentW);
    const vRatio = Math.min(1, vh / contentH);
    const minThumb = 24;
    const maxThumbRatio = 0.9;
    // 限制最大比例避免视觉上“占满整条”，同时保留最小尺寸以保证可操作性
    const hThumbLen = Math.min(hTrackLen * maxThumbRatio, Math.max(minThumb, hTrackLen * hRatio));
    const vThumbLen = Math.min(vTrackLen * maxThumbRatio, Math.max(minThumb, vTrackLen * vRatio));
    const minOffsetX = wb.x;
    const maxOffsetX = wb.x + Math.max(0, wb.width - vw);
    const minOffsetY = wb.y;
    const maxOffsetY = wb.y + Math.max(0, wb.height - vh);
    const normX =
      maxOffsetX === minOffsetX ? 0 : (vp.offset.x - minOffsetX) / (maxOffsetX - minOffsetX);
    const normY =
      maxOffsetY === minOffsetY ? 0 : (vp.offset.y - minOffsetY) / (maxOffsetY - minOffsetY);
    const hThumbX = m + (hTrackLen - hThumbLen) * Math.max(0, Math.min(1, normX));
    const vThumbY = m + (vTrackLen - vThumbLen) * Math.max(0, Math.min(1, normY));

    this.hTrack.clear();
    this.hTrack.beginFill(0x000000, 0.08);
    this.hTrack.position.set(m, ch - m - t);
    this.hTrack.drawRoundedRect(0, 0, hTrackLen, t, t / 2);
    this.hTrack.endFill();

    this.hThumb.clear();
    // 根据可滚动范围决定是否禁用Thumb交互，以及不同的视觉透明度
    const hScrollable = maxOffsetX - minOffsetX > 1e-3;
    const vScrollable = maxOffsetY - minOffsetY > 1e-3;
    this.hThumb.beginFill(0x000000, hScrollable ? 0.25 : 0.12);
    this.hThumb.position.set(hThumbX, ch - m - t);
    this.hThumb.drawRoundedRect(0, 0, hThumbLen, t, t / 2);
    this.hThumb.endFill();
    this.hThumb.interactive = hScrollable;
    this.hThumb.cursor = hScrollable ? 'pointer' : 'default';

    this.vTrack.clear();
    this.vTrack.beginFill(0x000000, 0.08);
    this.vTrack.position.set(cw - m - t, m);
    this.vTrack.drawRoundedRect(0, 0, t, vTrackLen, t / 2);
    this.vTrack.endFill();

    this.vThumb.clear();
    this.vThumb.beginFill(0x000000, vScrollable ? 0.25 : 0.12);
    this.vThumb.position.set(cw - m - t, vThumbY);
    this.vThumb.drawRoundedRect(0, 0, t, vThumbLen, t / 2);
    this.vThumb.endFill();
    this.vThumb.interactive = vScrollable;
    this.vThumb.cursor = vScrollable ? 'pointer' : 'default';

    this.container.visible = true;
  }

  private bindThumbInteractions(): void {
    this.hThumb.interactive = true;
    this.vThumb.interactive = true;
    this.hThumb.cursor = 'pointer';
    this.vThumb.cursor = 'pointer';
    this.hThumb.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      // 阻止事件冒泡，避免与画布选择等交互冲突
      e.stopPropagation();
      this.dragging = 'h';
      this.dragStartPos.copyFrom(e.global);
      const vp = (this.viewportController as any).viewport as ViewportState;
      this.dragStartOffset = { x: vp.offset.x, y: vp.offset.y };
    });
    this.vThumb.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      // 阻止事件冒泡，避免与画布选择等交互冲突
      e.stopPropagation();
      this.dragging = 'v';
      this.dragStartPos.copyFrom(e.global);
      const vp = (this.viewportController as any).viewport as ViewportState;
      this.dragStartOffset = { x: vp.offset.x, y: vp.offset.y };
    });
    this.app.stage.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      if (!this.dragging) return;
      // 阻止事件传播，避免影响其他交互
      e.stopPropagation();
      this.dragging = null;
      this.viewportController.enforceBounds(true);
      const vp = (this.viewportController as any).viewport as ViewportState;
      useCanvasStore.getState().setViewport({ offset: { x: vp.offset.x, y: vp.offset.y } });
    });
    this.app.stage.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!this.dragging) return;
      // 阻止事件传播，避免影响其他交互
      e.stopPropagation();
      const vp = (this.viewportController as any).viewport as ViewportState;
      const cw = this.app.renderer.width;
      const ch = this.app.renderer.height;
      const m = 8;
      const t = 6;
      const z = vp.zoom;
      // 拖拽时动态使用工作区bounds映射Thumb位置到offset
      const vw = cw / z;
      const vh = ch / z;
      if (this.dragging === 'h') {
        const hTrackLen = Math.max(0, cw - m * 2 - t);
        const hThumbBounds = hTrackLen - this.hThumb.width;
        const dx = e.global.x - this.dragStartPos.x;
        const newThumbX = Math.max(m, Math.min(m + hThumbBounds, this.hThumb.x + dx));
        const normX = hThumbBounds <= 0 ? 0 : (newThumbX - m) / hThumbBounds;
        const wb2 = this.viewportController.getWorkingBounds(vp);
        const minOffsetX = wb2.x;
        const maxOffsetX = wb2.x + Math.max(0, wb2.width - vw);
        const targetOffsetX = minOffsetX + normX * (maxOffsetX - minOffsetX);
        const next = { ...vp, offset: { x: targetOffsetX, y: vp.offset.y } } as ViewportState;
        this.viewportController.setViewport(next, RenderPriority.HIGH);
        useCanvasStore.getState().setViewport({ offset: next.offset });
        this.dragStartPos.copyFrom(e.global);
      } else if (this.dragging === 'v') {
        const vTrackLen = Math.max(0, ch - m * 2 - t);
        const vThumbBounds = vTrackLen - this.vThumb.height;
        const dy = e.global.y - this.dragStartPos.y;
        const newThumbY = Math.max(m, Math.min(m + vThumbBounds, this.vThumb.y + dy));
        const normY = vThumbBounds <= 0 ? 0 : (newThumbY - m) / vThumbBounds;
        const wb2 = this.viewportController.getWorkingBounds(vp);
        const minOffsetY = wb2.y;
        const maxOffsetY = wb2.y + Math.max(0, wb2.height - vh);
        const targetOffsetY = minOffsetY + normY * (maxOffsetY - minOffsetY);
        const next = { ...vp, offset: { x: vp.offset.x, y: targetOffsetY } } as ViewportState;
        this.viewportController.setViewport(next, RenderPriority.HIGH);
        useCanvasStore.getState().setViewport({ offset: next.offset });
        this.dragStartPos.copyFrom(e.global);
      }
    });
  }
}
