export type HeroCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Storefront hero width / height at each breakpoint. */
export const HERO_ASPECT_MOBILE = 5 / 6;
export const HERO_ASPECT_DESKTOP = 21 / 9;

export function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function normalizeCrop(raw?: Partial<HeroCrop> | null): HeroCrop {
  if (!raw) return { x: 0, y: 0, w: 1, h: 1 };
  const x = clamp01(typeof raw.x === 'number' ? raw.x : 0);
  const y = clamp01(typeof raw.y === 'number' ? raw.y : 0);
  let w = clamp01(typeof raw.w === 'number' ? raw.w : 1);
  let h = clamp01(typeof raw.h === 'number' ? raw.h : 1);
  w = Math.max(0.08, Math.min(w, 1 - x));
  h = Math.max(0.08, Math.min(h, 1 - y));
  return { x, y, w, h };
}

export function cropForBreakpoint(
  slide: {
    crop_mobile?: Partial<HeroCrop> | null;
    crop_desktop?: Partial<HeroCrop> | null;
  },
  desktop: boolean,
): HeroCrop {
  const raw = desktop ? slide.crop_desktop : slide.crop_mobile;
  return normalizeCrop(raw);
}

export function defaultHeroCrop(): HeroCrop {
  return { x: 0, y: 0, w: 1, h: 1 };
}

export type ImageFitRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** object-fit: contain rect for image inside a box. */
export function imageContainRect(
  boxW: number,
  boxH: number,
  naturalW: number,
  naturalH: number,
): ImageFitRect {
  if (!boxW || !boxH || !naturalW || !naturalH) {
    return { left: 0, top: 0, width: boxW, height: boxH };
  }
  const imageRatio = naturalW / naturalH;
  const boxRatio = boxW / boxH;
  if (imageRatio > boxRatio) {
    const width = boxW;
    const height = boxW / imageRatio;
    return { left: 0, top: (boxH - height) / 2, width, height };
  }
  const height = boxH;
  const width = boxH * imageRatio;
  return { left: (boxW - width) / 2, top: 0, width, height };
}
