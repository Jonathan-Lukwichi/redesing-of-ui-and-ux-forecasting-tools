# Safe measurement and safe scale patterns for hand-rolled charts

Copy-ready patterns. TypeScript types optional; drop them for plain JSX.

## useMeasuredSize: ResizeObserver with a synchronous first measurement

```tsx
import { useLayoutEffect, useRef, useState } from 'react';

export function useMeasuredSize(fallbackW = 720, fallbackH = 0) {
  const ref = useRef<HTMLElement | SVGElement | null>(null);
  const [size, setSize] = useState({ w: fallbackW, h: fallbackH });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Synchronous first measurement so the first paint is already correct
    const r = el.getBoundingClientRect();
    if (r.width > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0) setSize({ w: Math.round(cr.width), h: Math.round(cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size.w, size.h] as const;
}
```

Rules:
- Render nothing (or a skeleton) until width > 0.
- Clamp inner dims: `const innerW = Math.max(0, w - padL - padR)`; bail at 0.

## safeScale: never divide by zero, never emit NaN

```ts
export function safeScale(domainMin: number, domainMax: number,
                          rangeMin: number, rangeMax: number) {
  let lo = domainMin, hi = domainMax;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (hi === lo) { hi = lo + 1; }            // degenerate domain: widen
  const k = (rangeMax - rangeMin) / (hi - lo);
  return (v: number) =>
    Number.isFinite(v) ? rangeMin + (v - lo) * k : rangeMin;
}
```

## Empty and single-point data

```ts
if (!data || data.length === 0) return null;          // never Math.max(...[])
const denom = Math.max(1, data.length - 1);           // never 1/(len-1) at len 1
const max = Math.max(1e-9, ...data.filter(Number.isFinite));
```

## buildSafePath: filter non-finite points, validate the string

```ts
export function buildSafePath(pts: Array<[number, number]>): string | null {
  const ok = pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (ok.length < 2) return null;
  const d = ok.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return d.startsWith('M') ? d : null;   // never assign a d that cannot render
}
```

## Recharts note

`<ResponsiveContainer>` requires a parent with a resolved height. Never place
it inside a flex child with `height: auto`; give the wrapper an explicit
height or aspect-ratio.
