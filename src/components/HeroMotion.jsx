import { useEffect, useRef, useState } from 'react';

/* Animated forecast backdrop for the marketing pages: a drifting grid, a
   living forecast line with a breathing uncertainty band, and a pulsing
   "now" marker. If /videos/hero.mp4 exists it plays instead (muted loop,
   drop any exported Canva/stock clip there - no code change needed); the
   canvas animation is the built-in fallback. Honours reduced-motion. */
export default function HeroMotion({ opacity = 0.55, src = '/videos/hero.mp4', poster }) {
  const canvasRef = useRef(null);
  const [videoOk, setVideoOk] = useState(false);
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || videoOk) return undefined;
    const ctx = cv.getContext('2d');
    let raf = 0;
    let t = Math.PI; // start mid-cycle so the first frame already looks alive
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      cv.width = Math.max(1, Math.round(cv.offsetWidth * dpr));
      cv.height = Math.max(1, Math.round(cv.offsetHeight * dpr));
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(cv);

    const draw = () => {
      const w = cv.width, h = cv.height;
      if (!w || !h) { raf = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, w, h);

      // Drifting grid
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      const g = 42 * dpr;
      const off = (t * 6 * dpr) % g;
      for (let x = -off; x < w; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      const yAt = (x, phase = 0, amp = 1) =>
        h * 0.64
        + Math.sin(x / (95 * dpr) + t * 0.6 + phase) * 20 * dpr * amp
        + Math.sin(x / (38 * dpr) - t * 1.05 + phase * 2) * 9 * dpr * amp
        - (x / w) * h * 0.16;

      // Uncertainty band (breathing)
      ctx.beginPath();
      ctx.moveTo(0, yAt(0) - 28 * dpr);
      for (let x = 0; x <= w; x += 8 * dpr) ctx.lineTo(x, yAt(x) - (28 + Math.sin(t + (x / w) * 4) * 7) * dpr);
      for (let x = w; x >= 0; x -= 8 * dpr) ctx.lineTo(x, yAt(x) + (28 + Math.cos(t + (x / w) * 4) * 7) * dpr);
      ctx.closePath();
      ctx.fillStyle = 'rgba(13,148,136,0.10)';
      ctx.fill();

      // ML line
      ctx.beginPath();
      ctx.moveTo(0, yAt(0));
      for (let x = 0; x <= w; x += 6 * dpr) ctx.lineTo(x, yAt(x));
      ctx.strokeStyle = 'rgba(94,234,212,0.55)';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      // Statistical line (dashed, offset)
      ctx.beginPath();
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.moveTo(0, yAt(0, 2, 0.7) + 34 * dpr);
      for (let x = 0; x <= w; x += 6 * dpr) ctx.lineTo(x, yAt(x, 2, 0.7) + 34 * dpr);
      ctx.strokeStyle = 'rgba(125,211,252,0.32)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
      ctx.setLineDash([]);

      // Pulsing "now" marker
      const mx = w * 0.68, my = yAt(mx);
      const p = (Math.sin(t * 2) + 1) / 2;
      ctx.beginPath(); ctx.arc(mx, my, (5 + p * 11) * dpr, 0, 7);
      ctx.fillStyle = `rgba(94,234,212,${(0.28 - p * 0.22).toFixed(3)})`; ctx.fill();
      ctx.beginPath(); ctx.arc(mx, my, 3.5 * dpr, 0, 7);
      ctx.fillStyle = '#5eead4'; ctx.fill();

      t += 0.016;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [videoOk]);

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity }}>
      {!reducedMotion && (
        <video
          src={src} poster={poster} muted loop playsInline autoPlay
          preload="metadata"
          onCanPlay={() => setVideoOk(true)}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: videoOk ? 'block' : 'none' }}
        />
      )}
      {!videoOk && <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
    </div>
  );
}
