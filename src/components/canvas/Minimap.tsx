import React, { useEffect, useRef } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import type { TextElement, RectElementStyle } from '../../types';

type MinimapProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  width?: number;
  height?: number;
};

const parseColor = (color?: string): string => {
  if (!color) return '#000000';
  return color;
};

const Minimap: React.FC<MinimapProps> = ({ containerRef, width = 180, height = 120 }) => {
  const elements = useCanvasStore((state) => state.elements);
  const viewport = useCanvasStore((state) => state.viewport);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const els = Object.values(elements);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    if (els.length === 0) {
      minX = -500;
      minY = -500;
      maxX = 500;
      maxY = 500;
    } else {
      for (const e of els) {
        minX = Math.min(minX, e.x);
        minY = Math.min(minY, e.y);
        maxX = Math.max(maxX, e.x + e.width);
        maxY = Math.max(maxY, e.y + e.height);
      }
    }

    const z = viewport.zoom;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const vw = cw / z;
    const vh = ch / z;
    const vx = viewport.offset.x;
    const vy = viewport.offset.y;

    const padX = vw * 0.2;
    const padY = vh * 0.2;
    const uminX = Math.min(minX, vx);
    const uminY = Math.min(minY, vy);
    const umaxX = Math.max(maxX, vx + vw);
    const umaxY = Math.max(maxY, vy + vh);
    const wbX = uminX - padX;
    const wbY = uminY - padY;
    const wbW = umaxX - uminX + padX * 2;
    const wbH = umaxY - uminY + padY * 2;

    const scale = Math.min(width / wbW, height / wbH);
    const offsetX = (width - wbW * scale) / 2;
    const offsetY = (height - wbH * scale) / 2;

    const worldToMinimap = (wx: number, wy: number) => ({
      mx: (wx - wbX) * scale + offsetX,
      my: (wy - wbY) * scale + offsetY,
    });
    const minimapToWorld = (mx: number, my: number) => ({
      wx: wbX + (mx - offsetX) / scale,
      wy: wbY + (my - offsetY) / scale,
    });

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#374151';
    ctx.strokeRect(0, 0, width, height);

    for (const e of els) {
      const pivotX = e.transform?.pivotX ?? 0;
      const pivotY = e.transform?.pivotY ?? 0;
      const scaleX = e.transform?.scaleX ?? 1;
      const scaleY = e.transform?.scaleY ?? 1;
      const rotation = (e.rotation ?? 0) * (Math.PI / 180);

      const anchor = worldToMinimap(e.x + pivotX * e.width, e.y + pivotY * e.height);
      ctx.save();
      ctx.translate(anchor.mx, anchor.my);
      ctx.rotate(rotation);
      ctx.scale(scaleX, scaleY);

      const localX = -pivotX * e.width;
      const localY = -pivotY * e.height;

      const isText = e.type === 'text';
      const te = isText ? (e as TextElement) : undefined;
      const textColor = isText ? te?.textStyle?.color : undefined;
      const textBg = isText ? te?.textStyle?.backgroundColor : undefined;

      const fill = isText ? parseColor(textBg) : parseColor(e.style?.fill);
      const stroke = isText ? parseColor(textColor) : parseColor(e.style?.stroke);
      const fillOpacity = isText ? (textBg ? 1 : 0) : (e.style?.fillOpacity ?? 1);
      const strokeOpacity = isText ? 1 : (e.style?.strokeOpacity ?? 1);
      const strokeWidth = isText ? 1 : (e.style?.strokeWidth ?? 0);

      // fill
      if (!isText && e.style?.fill && fillOpacity > 0) {
        ctx.globalAlpha = fillOpacity;
        ctx.fillStyle = fill;
      } else {
        ctx.globalAlpha = isText && fillOpacity > 0 ? fillOpacity : 0;
        if (isText && fillOpacity > 0) {
          ctx.fillStyle = fill;
        }
      }

      // draw shape path
      ctx.beginPath();
      if (e.type === 'rect' || e.type === 'text') {
        const r =
          (e.type === 'rect' ? ((e.style as RectElementStyle).borderRadius ?? 0) : 0) * scale; // radius scaled with minimap scale
        const w = e.width * scale;
        const h = e.height * scale;
        const x = localX * scale;
        const y = localY * scale;
        if (r > 0) {
          const rr = Math.min(r, Math.min(w, h) / 2);
          ctx.moveTo(x + rr, y);
          ctx.lineTo(x + w - rr, y);
          ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
          ctx.lineTo(x + w, y + h - rr);
          ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
          ctx.lineTo(x + rr, y + h);
          ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
          ctx.lineTo(x, y + rr);
          ctx.quadraticCurveTo(x, y, x + rr, y);
        } else {
          ctx.rect(x, y, w, h);
        }
      } else if (e.type === 'circle') {
        const w = e.width * scale;
        const h = e.height * scale;
        const radius = Math.min(w, h) / 2;
        const cx = (localX + e.width / 2) * scale;
        const cy = (localY + e.height / 2) * scale;
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      } else if (e.type === 'triangle') {
        const w = e.width * scale;
        const h = e.height * scale;
        const x = localX * scale;
        const y = localY * scale;
        const points = [
          { x: x + w / 2, y },
          { x, y: y + h },
          { x: x + w, y: y + h },
        ];
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.lineTo(points[2].x, points[2].y);
        ctx.closePath();
      } else {
        // fallback: rect
        const w = e.width * scale;
        const h = e.height * scale;
        const x = localX * scale;
        const y = localY * scale;
        ctx.rect(x, y, w, h);
      }

      // fill
      if (fillOpacity > 0) {
        ctx.fillStyle = fill;
        ctx.globalAlpha = fillOpacity;
        ctx.fill();
      }
      // stroke
      if (strokeWidth > 0 && stroke && strokeOpacity > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = Math.max(1, strokeWidth * scale);
        ctx.globalAlpha = strokeOpacity;
        ctx.stroke();
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    const topLeft = worldToMinimap(vx, vy);
    const rw = vw * scale;
    const rh = vh * scale;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 1;
    ctx.strokeRect(topLeft.mx, topLeft.my, rw, rh);

    const onPointerDown = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const { wx, wy } = minimapToWorld(mx, my);
      const targetOffset = {
        x: wx - vw / 2,
        y: wy - vh / 2,
      };
      const minOffsetX = wbX;
      const maxOffsetX = wbX + Math.max(0, wbW - vw);
      const minOffsetY = wbY;
      const maxOffsetY = wbY + Math.max(0, wbH - vh);
      const clamped = {
        x: Math.max(minOffsetX, Math.min(maxOffsetX, targetOffset.x)),
        y: Math.max(minOffsetY, Math.min(maxOffsetY, targetOffset.y)),
      };
      setViewport({ offset: clamped });
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (ev.buttons !== 1) return;
      onPointerDown(ev);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
    };
  }, [elements, viewport, containerRef, width, height, setViewport]);

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width,
        height,
        border: '1px solid var(--border-normal)',
        borderRadius: 8,
        background: 'var(--panel-bg)',
        zIndex: 1001,
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default Minimap;
