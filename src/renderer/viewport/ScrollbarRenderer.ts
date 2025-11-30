import * as PIXI from 'pixi.js';
import type { ViewportState } from '../../types';

export class ScrollbarRenderer {
  private overlay: PIXI.Container;
  private hTrack: PIXI.Graphics;
  private hThumb: PIXI.Graphics;
  private vTrack: PIXI.Graphics;
  private vThumb: PIXI.Graphics;
  private dragging: 'h' | 'v' | null = null;
  private dragStartPos: PIXI.Point = new PIXI.Point(0, 0);
  private dragStartOffset = { x: 0, y: 0 };
  private onViewportChange?: (dx: number, dy: number) => void;

  constructor(overlayLayer: PIXI.Container) {
    this.overlay = overlayLayer;
    this.hTrack = new PIXI.Graphics();
    this.hThumb = new PIXI.Graphics();
    this.vTrack = new PIXI.Graphics();
    this.vThumb = new PIXI.Graphics();
    this.overlay.addChild(this.hTrack);
    this.overlay.addChild(this.hThumb);
    this.overlay.addChild(this.vTrack);
    this.overlay.addChild(this.vThumb);
    this.bindInteractions();
  }

  setViewportChangeCallback(cb: (dx: number, dy: number) => void): void {
    this.onViewportChange = cb;
  }

  updateScrollbars(
    vp: ViewportState & { worldBounds?: { x: number; y: number; width: number; height: number } },
    canvasSize: { width: number; height: number },
  ): void {
    const cw = canvasSize.width;
    const ch = canvasSize.height;
    const m = 8;
    const t = 6;
    const z = vp.zoom;
    const bounds = vp.worldBounds ?? vp.contentBounds;
    const vw = cw / z;
    const vh = ch / z;
    const contentW = Math.max(1, bounds.width);
    const contentH = Math.max(1, bounds.height);
    const hTrackLen = Math.max(0, cw - m * 2 - t);
    const vTrackLen = Math.max(0, ch - m * 2 - t);
    const hRatio = Math.min(1, vw / contentW);
    const vRatio = Math.min(1, vh / contentH);
    const minThumb = 24;
    const maxThumbRatio = 0.9;
    const hThumbLen = Math.min(hTrackLen * maxThumbRatio, Math.max(minThumb, hTrackLen * hRatio));
    const vThumbLen = Math.min(vTrackLen * maxThumbRatio, Math.max(minThumb, vTrackLen * vRatio));
    const minOffsetX = bounds.x;
    const maxOffsetX = bounds.x + Math.max(0, bounds.width - vw);
    const minOffsetY = bounds.y;
    const maxOffsetY = bounds.y + Math.max(0, bounds.height - vh);
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

    const hScrollable = maxOffsetX - minOffsetX > 1e-3;
    const vScrollable = maxOffsetY - minOffsetY > 1e-3;

    this.hThumb.clear();
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
  }

  destroy(): void {
    [this.hTrack, this.hThumb, this.vTrack, this.vThumb].forEach((g) => {
      g.removeAllListeners();
      g.parent?.removeChild(g);
      g.destroy();
    });
  }

  private bindInteractions(): void {
    this.hThumb.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      this.dragging = 'h';
      this.dragStartPos.copyFrom(e.global);
    });
    this.vThumb.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      this.dragging = 'v';
      this.dragStartPos.copyFrom(e.global);
    });
    this.overlay.on('pointerup', () => {
      this.dragging = null;
    });
    this.overlay.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!this.dragging || !this.onViewportChange) return;
      const dx = e.global.x - this.dragStartPos.x;
      const dy = e.global.y - this.dragStartPos.y;
      this.dragStartPos.copyFrom(e.global);
      // 直接以像素delta回调，由上层ViewportController决定如何应用
      if (this.dragging === 'h') this.onViewportChange(dx, 0);
      else if (this.dragging === 'v') this.onViewportChange(0, dy);
    });
  }
}
