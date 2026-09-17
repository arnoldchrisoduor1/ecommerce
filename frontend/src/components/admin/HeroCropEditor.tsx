'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  clamp01,
  imageContainRect,
  normalizeCrop,
  type HeroCrop,
  type ImageFitRect,
} from '@/lib/heroCrop';

type Props = {
  url: string;
  crop: HeroCrop;
  previewAspect: number;
  onChange: (crop: HeroCrop) => void;
};

type DragMode = 'move' | 'se' | 'nw';

export function HeroCropEditor({ url, crop, previewAspect, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [fit, setFit] = useState<ImageFitRect>({ left: 0, top: 0, width: 0, height: 0 });
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    base: HeroCrop;
  } | null>(null);

  const syncFit = useCallback(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img?.naturalWidth) return;
    setFit(
      imageContainRect(box.clientWidth, box.clientHeight, img.naturalWidth, img.naturalHeight),
    );
  }, []);

  useEffect(() => {
    syncFit();
    window.addEventListener('resize', syncFit);
    return () => window.removeEventListener('resize', syncFit);
  }, [syncFit, url]);

  function normFromClient(clientX: number, clientY: number) {
    const box = boxRef.current;
    if (!box || !fit.width) return { x: 0, y: 0 };
    const rect = box.getBoundingClientRect();
    const px = clientX - rect.left - fit.left;
    const py = clientY - rect.top - fit.top;
    return {
      x: clamp01(px / fit.width),
      y: clamp01(py / fit.height),
    };
  }

  function onPointerDown(e: ReactPointerEvent, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    boxRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      base: normalizeCrop(crop),
    };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || !fit.width) return;
    const cur = normFromClient(e.clientX, e.clientY);
    const start = normFromClient(drag.startX, drag.startY);
    const dx = cur.x - start.x;
    const dy = cur.y - start.y;
    const b = drag.base;

    if (drag.mode === 'move') {
      onChange(
        normalizeCrop({
          x: b.x + dx,
          y: b.y + dy,
          w: b.w,
          h: b.h,
        }),
      );
      return;
    }

    if (drag.mode === 'se') {
      onChange(
        normalizeCrop({
          x: b.x,
          y: b.y,
          w: b.w + dx,
          h: b.h + dy,
        }),
      );
      return;
    }

    onChange(
      normalizeCrop({
        x: b.x + dx,
        y: b.y + dy,
        w: b.w - dx,
        h: b.h - dy,
      }),
    );
  }

  function onPointerUp(e: ReactPointerEvent) {
    dragRef.current = null;
    try {
      boxRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const c = normalizeCrop(crop);
  const cropStyle = fit.width
    ? {
        left: `${fit.left + c.x * fit.width}px`,
        top: `${fit.top + c.y * fit.height}px`,
        width: `${c.w * fit.width}px`,
        height: `${c.h * fit.height}px`,
      }
    : undefined;

  return (
    <div className="admin-hero-crop" data-testid="hero-crop-editor">
      <div
        ref={boxRef}
        className="admin-hero-crop__stage"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt=""
          className="admin-hero-crop__img"
          onLoad={syncFit}
          draggable={false}
        />
        <div
          className="admin-hero-crop__box"
          style={cropStyle}
          onPointerDown={(e) => onPointerDown(e, 'move')}
        >
          <span
            className="admin-hero-crop__handle admin-hero-crop__handle--nw"
            onPointerDown={(e) => onPointerDown(e, 'nw')}
          />
          <span
            className="admin-hero-crop__handle admin-hero-crop__handle--se"
            onPointerDown={(e) => onPointerDown(e, 'se')}
          />
        </div>
      </div>
      <div
        className="admin-hero-crop__preview"
        style={{ aspectRatio: String(previewAspect) }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="admin-hero-crop__preview-img"
          style={
            {
              '--hero-crop-x': String(c.x),
              '--hero-crop-y': String(c.y),
              '--hero-crop-w': String(c.w),
              '--hero-crop-h': String(c.h),
            } as CSSProperties
          }
        />
      </div>
      <p className="ds-caption admin-hero-crop__hint">
        Drag box to reframe. Corner handles resize. Crop {Math.round(c.w * 100)}% ×{' '}
        {Math.round(c.h * 100)}%
      </p>
    </div>
  );
}
