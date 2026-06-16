// ---- Storytelling primitives ----------------------------------------------
import { useId } from 'react';

const CATEGORY_TOKEN = {
  risk:   { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Risk' },
  watch:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Watch' },
  stable: { color: '#0d9488', bg: '#ecfeff', border: '#a5f3fc', label: 'Stable' },
  trend:  { color: '#1e6091', bg: '#eff6ff', border: '#bfdbfe', label: 'Trend' },
};

// Editorial serif stack — used on hero numbers and card titles to give the
// dashboard a boardroom feel without sacrificing data legibility (body text
// stays sans-serif).
export const SERIF = '"Times New Roman", Georgia, "Iowan Old Style", serif';

export function categoryToken(category) {
  return CATEGORY_TOKEN[category] || CATEGORY_TOKEN.stable;
}

// ---- Number formatting -----------------------------------------------------

export function formatNum(n, opts = {}) {
  const { decimals = 0, fallback = '—' } = opts;
  if (n == null || Number.isNaN(Number(n))) return fallback;
  const v = Number(n);
  if (Math.abs(v) >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (decimals === 0) return Math.round(v).toLocaleString();
  return v.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function formatPct(n, decimals = 1) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
}

export function formatHero(value, unit) {
  if (typeof value === 'string') {
    return unit ? `${value}${unit}` : value;
  }
  if (value == null) return '—';
  return `${formatNum(value, { decimals: typeof value === 'number' && value % 1 !== 0 ? 1 : 0 })}${unit ? '' : ''}`;
}

// ---- KPI strip primitives --------------------------------------------------

export function KPICard({ label, value, unit, deltaPct, deltaLabel, sparkline, accent = 'stable', sparklineColor, polarity = 'normal' }) {
  const tok = categoryToken(accent);
  const showDelta = deltaPct !== undefined && deltaPct !== null;
  return (
    <div style={{
      background: 'white', border: '1px solid #e4e7eb', borderRadius: 10,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
      minHeight: 110, boxShadow: '0 1px 2px rgba(15, 23, 41, 0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#94a3b8',
          textTransform: 'uppercase', letterSpacing: 1.2,
        }}>{label}</span>
        {showDelta && <DeltaPill value={deltaPct} polarity={polarity} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontSize: 30, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          fontFamily: SERIF,
        }}>{typeof value === 'number' ? formatNum(value) : value}</span>
        {unit && <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{unit}</span>}
      </div>
      {sparkline && sparkline.length > 1 && (
        <Sparkline data={sparkline} color={sparklineColor || tok.color} width={180} height={30} fill={true} />
      )}
      {deltaLabel && <div style={{ fontSize: 10, color: '#94a3b8' }}>{deltaLabel}</div>}
    </div>
  );
}

function DeltaPill({ value, polarity = 'normal' }) {
  // polarity:
  //   'normal'  — up is good (green ↗) / down is bad (red ↘)
  //   'inverse' — up is bad  (amber ↗) / down is good (green ↘)
  //   'neutral' — never colour, only show magnitude
  const arrow = value >= 0 ? '↗' : '↘';
  let color, bg;
  if (polarity === 'neutral') {
    color = '#475569'; bg = '#f1f5f9';
  } else if (polarity === 'inverse') {
    const bad = value >= 0;
    color = bad ? '#d97706' : '#16a34a';
    bg    = bad ? '#fef3c7' : '#dcfce7';
  } else {
    const good = value >= 0;
    color = good ? '#16a34a' : '#dc2626';
    bg    = good ? '#dcfce7' : '#fee2e2';
  }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: bg,
      borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {arrow} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function ProgressRing({ value, max = 100, size = 56, thickness = 6, color = '#0d9488', trackColor = '#eef0f3' }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = size / 2 - thickness / 2;
  const c = Math.PI * 2 * r;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={thickness}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column',
      }}>
        <span style={{ fontSize: Math.round(size * 0.22), fontWeight: 700, color: '#0f172a' }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
    </div>
  );
}

export function ValueLegend({ items, format = formatNum }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#334155', flex: 1, lineHeight: 1.3 }}>{it.label}</span>
          {it.sub && (
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{it.sub}</span>
          )}
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#0f172a',
            fontVariantNumeric: 'tabular-nums', minWidth: 48, textAlign: 'right',
          }}>{typeof it.value === 'number' ? format(it.value) : it.value}</span>
        </div>
      ))}
    </div>
  );
}

export function HeroStat({ value, label, sub, category = 'stable', size = 'lg', onClick }) {
  const tok = categoryToken(category);
  const fontSize = size === 'xl' ? 64 : size === 'lg' ? 48 : 32;
  return (
    <div
      onClick={onClick}
      style={{
        background: tok.bg, border: `1px solid ${tok.border}`, borderRadius: 12,
        padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 6,
        cursor: onClick ? 'pointer' : 'default', minHeight: 168,
        boxShadow: '0 1px 2px rgba(15, 23, 41, 0.04)',
      }}
    >
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase',
        color: tok.color,
      }}>{tok.label}</span>
      <div style={{
        fontSize, fontWeight: 700, color: tok.color, lineHeight: 1.05, letterSpacing: '-1px',
        fontVariantNumeric: 'tabular-nums', marginTop: 4,
      }}>{value}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 4, lineHeight: 1.3 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

export function ActionPanel({ mechanism, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {mechanism && (
        <div style={{
          padding: '12px 14px', background: '#fafbfc',
          border: '1px solid #eef0f3', borderRadius: 8,
          fontSize: 12, color: '#475569', lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
            Mechanism
          </div>
          {mechanism}
        </div>
      )}
      {action && (
        <div style={{
          padding: '12px 14px', background: '#ecfeff',
          border: '1px solid #a5f3fc', borderRadius: 8, borderLeft: '3px solid #0d9488',
          fontSize: 13, color: '#0f172a', lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
            Recommended action
          </div>
          {action}
        </div>
      )}
    </div>
  );
}

export function RankedBars({ rows, valueKey = 'pct_deviation', labelKey = 'category', height = 240, highlightThreshold = 0 }) {
  // Layout: [labels | + value reserve | bars | - value reserve]
  // The zero line stays well inside the bar area so positive labels never
  // collide with negative ones, and the leftmost row label sits in its own
  // gutter that the bars never overlap.
  const w = 760, h = height;
  const labelGutter = 160;
  const valueGutter = 60;          // reserved on each side for "+45%" tags
  const pad = { l: labelGutter, r: valueGutter, t: 12, b: 12 };
  const values = rows.map((r) => r[valueKey]);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const innerW = w - pad.l - pad.r;
  const xZero = pad.l + innerW / 2;
  const rowH = (h - pad.t - pad.b) / rows.length;
  const bh = Math.max(10, rowH - 8);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <line x1={xZero} x2={xZero} y1={pad.t} y2={h - pad.b} stroke="#cbd5e1" />
      {rows.map((r, i) => {
        const v = Number(r[valueKey]) || 0;
        const widthPx = Math.max(2, (Math.abs(v) / maxAbs) * (innerW / 2));
        const isAccent = highlightThreshold !== 0 && Math.abs(v) >= highlightThreshold;
        const fill = isAccent ? '#dc2626' : (v >= 0 ? '#0d9488' : '#94a3b8');
        const x = v >= 0 ? xZero : xZero - widthPx;
        const y = pad.t + i * rowH + (rowH - bh) / 2;
        const valueLabel = `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
        return (
          <g key={i}>
            <text x={pad.l - 12} y={y + bh / 2 + 4} textAnchor="end" fontSize="12"
              fill="#334155" fontWeight={isAccent ? 700 : 500}>
              {r[labelKey]}
            </text>
            <rect x={x} y={y} width={widthPx} height={bh} fill={fill} rx="3" />
            <text
              x={v >= 0 ? x + widthPx + 6 : x - 6}
              y={y + bh / 2 + 4}
              textAnchor={v >= 0 ? 'start' : 'end'}
              fontSize="12" fill={isAccent ? '#dc2626' : '#0f172a'} fontWeight="700"
            >
              {valueLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function MonthlyIndexBars({ rows, baselineLabel = 'Annual mean', height = 240 }) {
  const w = 720, h = height, pad = { l: 48, r: 16, t: 26, b: 30 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const values = rows.map((r) => r.index ?? 100);
  const max = Math.max(115, ...values);
  const min = Math.min(60, ...values);
  const y = (v) => pad.t + innerH - ((v - min) / (max - min)) * innerH;
  const bw = (innerW / rows.length) * 0.68;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {[60, 80, 100, 110].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke={v === 100 ? '#cbd5e1' : '#eef0f3'} strokeDasharray={v === 100 ? '4 4' : '0'} />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{v}</text>
        </g>
      ))}
      <text x={w - pad.r} y={y(100) - 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontStyle="italic">{baselineLabel}</text>
      {rows.map((r, i) => {
        const cx = pad.l + (i + 0.5) * (innerW / rows.length);
        const v = r.index ?? 100;
        const pct = v - 100;
        const isMin = v === min;
        const isMax = v === max;
        // Cool teal for above-baseline, soft red for below-baseline, brighter for extremes.
        const fill = pct >= 0
          ? (isMax ? '#0d9488' : '#5eead4')
          : (isMin ? '#dc2626' : '#fca5a5');
        // Minimum bar height so months near the mean stay visible (4px).
        const bh = Math.max(4, Math.abs(y(v) - y(100)));
        const yTop = pct >= 0 ? y(100) - bh : y(100);
        const showLabel = isMin || isMax || Math.abs(pct) >= 5;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={yTop} width={bw} height={bh} fill={fill} rx="3" />
            {showLabel && (
              <text x={cx} y={pct >= 0 ? yTop - 6 : yTop + bh + 12} textAnchor="middle"
                fontSize="10" fill={isMin ? '#dc2626' : isMax ? '#0d9488' : '#475569'} fontWeight="700">
                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
              </text>
            )}
            <text x={cx} y={h - 8} textAnchor="middle" fontSize="11"
              fill={isMin || isMax ? '#0f172a' : '#94a3b8'}
              fontWeight={isMin || isMax ? 700 : 400}>{r.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function DonutWithCenter({ slices, size = 200, thickness = 30, centerHeadline, centerSub }) {
  const r = size / 2;
  const ri = r - thickness;
  const total = slices.reduce((s, x) => s + (x.value || 0), 0);
  let a = -Math.PI / 2;
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {slices.map((s, i) => {
          const frac = (s.value || 0) / total;
          const a2 = a + frac * Math.PI * 2;
          const large = frac > 0.5 ? 1 : 0;
          const x1 = r + r * Math.cos(a), y1 = r + r * Math.sin(a);
          const x2 = r + r * Math.cos(a2), y2 = r + r * Math.sin(a2);
          const x3 = r + ri * Math.cos(a2), y3 = r + ri * Math.sin(a2);
          const x4 = r + ri * Math.cos(a), y4 = r + ri * Math.sin(a);
          const path = `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${ri} ${ri} 0 ${large} 0 ${x4} ${y4} Z`;
          a = a2;
          return <path key={i} d={path} fill={s.color} />;
        })}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', textAlign: 'center', pointerEvents: 'none',
      }}>
        {centerHeadline && (
          <div style={{
            fontSize: Math.max(22, Math.round(size * 0.18)),
            fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px',
            fontFamily: SERIF, fontVariantNumeric: 'tabular-nums',
          }}>
            {centerHeadline}
          </div>
        )}
        {centerSub && (
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4 }}>
            {centerSub}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Existing primitives -----------------------------------------------------

export function Sparkline({ data, color = '#1e6091', width = 80, height = 28, fill = true }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = width, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = path + ` L${w} ${h} L0 ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function LineChart({ series, height = 220, xLabels, showGrid = true, fillArea = true }) {
  const uid = useId().replace(/[:]/g, '');
  const w = 720, h = height, pad = { l: 44, r: 18, t: 14, b: 28 };
  const allVals = series.flatMap((s) => s.data.filter((v) => v != null && v !== 0));
  const max = (allVals.length ? Math.max(...allVals) : 1) * 1.1;
  const min = Math.min(0, allVals.length ? Math.min(...allVals) : 0);
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const n = series[0].data.length;
  const x = (i) => pad.l + (i / (n - 1)) * innerW;
  const y = (v) => pad.t + innerH - ((v - min) / (max - min)) * innerH;

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => min + (i / yTicks) * (max - min));
  const xIdx = xLabels && xLabels.length > 1
    ? xLabels.map((_, i) => i * Math.floor((n - 1) / (xLabels.length - 1))) : [];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <defs>
        {series.map((s, si) => (
          <linearGradient key={si} id={`${uid}-g${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {/* horizontal grid + y labels */}
      {showGrid && tickVals.map((v, i) => (
        <g key={'h' + i}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#eef2f7" strokeWidth="1" />
          <text x={pad.l - 9} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#94a3b8" fontFamily="inherit">{Math.round(v)}</text>
        </g>
      ))}
      {/* vertical grid at x-label positions */}
      {showGrid && xIdx.map((xi, i) => (
        <line key={'v' + i} x1={x(xi)} x2={x(xi)} y1={pad.t} y2={pad.t + innerH} stroke="#f5f7fa" strokeWidth="1" />
      ))}
      {/* baseline */}
      <line x1={pad.l} x2={w - pad.r} y1={y(min)} y2={y(min)} stroke="#e2e8f0" strokeWidth="1.25" />

      {xLabels && xLabels.map((lbl, i) => (
        <text key={i} x={x(xIdx[i])} y={h - 6} textAnchor="middle" fontSize="11" fill="#94a3b8" fontFamily="inherit">{lbl}</text>
      ))}

      {series.map((s, si) => {
        const validPts = s.data.map((v, i) => [i, v]).filter(([, v]) => v != null && v !== 0);
        if (validPts.length < 2) return null;
        const line = validPts.map(([i, v], pi) => (pi === 0 ? 'M' : 'L') + x(i) + ' ' + y(v)).join(' ');
        const x0 = x(validPts[0][0]), x1 = x(validPts[validPts.length - 1][0]);
        const area = `${line} L${x1} ${y(min)} L${x0} ${y(min)} Z`;
        return (
          <g key={si}>
            {s.band && (
              <path
                d={
                  s.band.upper.map((v, i) => (i === 0 ? 'M' : 'L') + x(i) + ' ' + y(v)).join(' ') +
                  ' ' +
                  [...s.band.lower].reverse().map((v, i) => 'L' + x(s.band.lower.length - 1 - i) + ' ' + y(v)).join(' ') +
                  ' Z'
                }
                fill={s.color} opacity="0.12" stroke="none"
              />
            )}
            {fillArea && !s.dashed && !s.band && (
              <path d={area} fill={`url(#${uid}-g${si})`} stroke="none" />
            )}
            <path d={line} fill="none" stroke={s.color} strokeWidth="2.25"
              strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={s.dashed ? '5 4' : undefined} />
          </g>
        );
      })}
    </svg>
  );
}

export function BarChart({ data, height = 200, color = '#1e6091', labels, valueFmt = (v) => v, rotateLabels }) {
  // Auto-rotate x-axis labels when there are many labels OR any label is long.
  const longestLabel = Math.max(0, ...(labels || []).map((l) => String(l || '').length));
  const shouldRotate = rotateLabels ?? (data.length > 6 || longestLabel > 8);
  const w = 720, h = height;
  const pad = { l: 48, r: 16, t: 16, b: shouldRotate ? 56 : 30 };
  const max = Math.max(...data) * 1.15;
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const bw = (innerW / data.length) * 0.6;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * (1 - t)} y2={pad.t + innerH * (1 - t)} stroke="#eef0f3" />
      ))}
      {data.map((v, i) => {
        const cx = pad.l + (i + 0.5) * (innerW / data.length);
        const bh = (v / max) * innerH;
        const baseY = pad.t + innerH - bh;
        const label = (labels && labels[i]) || '';
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={baseY} width={bw} height={bh} fill={color} rx="3" />
            {shouldRotate
              ? <text x={cx} y={pad.t + innerH + 14} textAnchor="end" fontSize="11" fill="#475569"
                  transform={`rotate(-35 ${cx} ${pad.t + innerH + 14})`}>{label}</text>
              : <text x={cx} y={h - 6} textAnchor="middle" fontSize="12" fill="#94a3b8">{label}</text>}
            <text x={cx} y={baseY - 6} textAnchor="middle" fontSize="11" fill="#334155" fontWeight="600">{valueFmt(v)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ data, size = 180, thickness = 28 }) {
  const r = size / 2, ri = r - thickness;
  const total = data.reduce((s, d) => s + d.value, 0);
  let a = -Math.PI / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {data.map((d, i) => {
        const frac = d.value / total;
        const a2 = a + frac * Math.PI * 2;
        const large = frac > 0.5 ? 1 : 0;
        const x1 = r + r * Math.cos(a), y1 = r + r * Math.sin(a);
        const x2 = r + r * Math.cos(a2), y2 = r + r * Math.sin(a2);
        const x3 = r + ri * Math.cos(a2), y3 = r + ri * Math.sin(a2);
        const x4 = r + ri * Math.cos(a), y4 = r + ri * Math.sin(a);
        const path = `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${ri} ${ri} 0 ${large} 0 ${x4} ${y4} Z`;
        a = a2;
        return <path key={i} d={path} fill={d.color} />;
      })}
    </svg>
  );
}

export function StemPlot({ data, height = 200, color = '#1e6091', confidenceBand, labels }) {
  const w = 720, h = height, pad = { l: 48, r: 16, t: 16, b: 30 };
  const max = Math.max(1, ...data.map((v) => Math.abs(v)));
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const x = (i) => pad.l + (i / Math.max(1, data.length - 1)) * innerW;
  const y = (v) => pad.t + innerH / 2 - (v / max) * (innerH / 2 - 6);
  const yZero = pad.t + innerH / 2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {confidenceBand != null && (
        <g>
          <rect x={pad.l} y={y(confidenceBand)} width={innerW} height={Math.max(0, y(-confidenceBand) - y(confidenceBand))} fill="#1e6091" opacity="0.08" />
          <line x1={pad.l} x2={w - pad.r} y1={y(confidenceBand)} y2={y(confidenceBand)} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1" />
          <line x1={pad.l} x2={w - pad.r} y1={y(-confidenceBand)} y2={y(-confidenceBand)} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1" />
        </g>
      )}
      <line x1={pad.l} x2={w - pad.r} y1={yZero} y2={yZero} stroke="#cbd5e1" strokeWidth="1" />
      {data.map((v, i) => (
        <g key={i}>
          <line x1={x(i)} x2={x(i)} y1={yZero} y2={y(v)} stroke={color} strokeWidth="2" />
          <circle cx={x(i)} cy={y(v)} r="3" fill={color} />
        </g>
      ))}
      {labels && labels.map((lbl, i) => (
        <text key={i} x={x(Math.round((i / (labels.length - 1)) * (data.length - 1)))} y={h - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">{lbl}</text>
      ))}
    </svg>
  );
}

export function BoxPlot({ data, labels, height = 220, color = '#1e6091' }) {
  // data: [{ min, q1, median, q3, max, whisker_low?, whisker_high?, mean? }, ...]
  const w = 720, h = height, pad = { l: 48, r: 16, t: 16, b: 30 };
  const allMin = Math.min(...data.map((d) => d.whisker_low ?? d.min ?? 0));
  const allMax = Math.max(...data.map((d) => d.whisker_high ?? d.max ?? 1));
  const span = (allMax - allMin) * 1.1 || 1;
  const yMin = allMin - span * 0.05;
  const yMax = allMax + span * 0.05;
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const y = (v) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const cw = (innerW / data.length) * 0.5;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const yv = yMin + t * (yMax - yMin);
        return (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={y(yv)} y2={y(yv)} stroke="#eef0f3" strokeWidth="1" />
            <text x={pad.l - 8} y={y(yv) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{Math.round(yv)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const cx = pad.l + (i + 0.5) * (innerW / data.length);
        if (!d || d.n === 0) return null;
        const wl = d.whisker_low ?? d.min;
        const wh = d.whisker_high ?? d.max;
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={y(wl)} y2={y(wh)} stroke={color} strokeWidth="1.2" />
            <line x1={cx - cw / 3} x2={cx + cw / 3} y1={y(wl)} y2={y(wl)} stroke={color} strokeWidth="1.2" />
            <line x1={cx - cw / 3} x2={cx + cw / 3} y1={y(wh)} y2={y(wh)} stroke={color} strokeWidth="1.2" />
            <rect x={cx - cw / 2} y={y(d.q3)} width={cw} height={Math.max(1, y(d.q1) - y(d.q3))} fill={color} opacity="0.22" stroke={color} />
            <line x1={cx - cw / 2} x2={cx + cw / 2} y1={y(d.median)} y2={y(d.median)} stroke="#0f172a" strokeWidth="2" />
            {labels && <text x={cx} y={h - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function StackedArea({ series, dates, colors, height = 220 }) {
  // series: { Label1: [v...], Label2: [v...] }, dates: [...]
  const labels = Object.keys(series);
  const n = dates.length;
  if (!labels.length || !n) return null;
  const w = 760, h = height, pad = { l: 48, r: 16, t: 12, b: 30 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const stack = labels.map((l) => series[l]);
  const totals = Array.from({ length: n }, (_, i) => stack.reduce((s, arr) => s + (arr[i] || 0), 0));
  const max = Math.max(1, ...totals);
  const x = (i) => pad.l + (i / Math.max(1, n - 1)) * innerW;
  const y = (v) => pad.t + innerH - (v / max) * innerH;

  // Build cumulative bands top-down.
  const cum = Array.from({ length: n }, () => 0);
  const paths = labels.map((label, li) => {
    const top = stack[li].map((v, i) => cum[i] + (v || 0));
    const path = top.map((v, i) => (i === 0 ? 'M' : 'L') + x(i) + ' ' + y(v)).join(' ') + ' ' +
      [...cum].reverse().map((v, i) => 'L' + x(n - 1 - i) + ' ' + y(v)).join(' ') + ' Z';
    for (let i = 0; i < n; i++) cum[i] = top[i];
    return { label, path, color: (colors && colors[li]) || COLOR_CYCLE[li % COLOR_CYCLE.length] };
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {paths.map((p) => <path key={p.label} d={p.path} fill={p.color} opacity="0.8" />)}
      <line x1={pad.l} x2={w - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} stroke="#cbd5e1" />
      {[0, 0.5, 1].map((t, i) => (
        <text key={i} x={x((n - 1) * t)} y={h - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">
          {dates[Math.round((n - 1) * t)]}
        </text>
      ))}
    </svg>
  );
}

const COLOR_CYCLE = ['#1e6091', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#16a34a', '#475569', '#f59e0b'];

export function ScatterPlot({ points, height = 240, xLabels = [], colorMap = {} }) {
  // points: [{ x: index, y: number, category, regime }] OR [{ date, value, category }]
  const w = 760, h = height, pad = { l: 48, r: 16, t: 12, b: 30 };
  const ys = points.map((p) => p.y ?? p.value).filter((v) => v != null);
  if (!ys.length) return null;
  const yMin = 0;
  const yMax = Math.max(...ys) * 1.05;
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const x = (i) => pad.l + (i / Math.max(1, points.length - 1)) * innerW;
  const y = (v) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const DEFAULT_COLORS = {
    normal: '#1e6091', high: '#d97706', peak: '#dc2626', zero: '#94a3b8', missing: '#e4e7eb',
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * (1 - t)} y2={pad.t + innerH * (1 - t)} stroke="#eef0f3" />
      ))}
      {points.map((p, i) => {
        const v = p.y ?? p.value;
        if (v == null) return null;
        const cat = p.category || 'normal';
        const color = colorMap[cat] || DEFAULT_COLORS[cat] || '#1e6091';
        return <circle key={i} cx={x(i)} cy={y(v)} r={cat === 'peak' ? 3 : 1.6} fill={color} opacity={cat === 'normal' ? 0.45 : 0.9} />;
      })}
      {xLabels.length > 1 && xLabels.map((lbl, i) => (
        <text key={i} x={pad.l + (i / (xLabels.length - 1)) * innerW} y={h - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">{lbl}</text>
      ))}
    </svg>
  );
}

export function DivergingMatrix({ rows, columns, data, height = 280, max: maxOverride }) {
  // data: 2D array of numbers (rows × columns), centred at 0
  const w = 760, h = height, pad = { l: 140, r: 12, t: 12, b: 80 };
  const cellW = (w - pad.l - pad.r) / columns.length;
  const cellH = (h - pad.t - pad.b) / Math.max(1, rows.length);
  const flat = data.flat().filter((v) => v != null && Number.isFinite(v));
  const m = maxOverride || Math.max(1, ...flat.map(Math.abs));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {rows.map((rl, ri) => (
        <text key={'r' + ri} x={pad.l - 8} y={pad.t + (ri + 0.65) * cellH} textAnchor="end" fontSize="11" fill="#475569">{rl}</text>
      ))}
      {columns.map((cl, ci) => (
        <text key={'c' + ci} x={pad.l + (ci + 0.5) * cellW} y={h - pad.b + 14} textAnchor="end" fontSize="11" fill="#475569"
          transform={`rotate(-40 ${pad.l + (ci + 0.5) * cellW} ${h - pad.b + 14})`}>{cl}</text>
      ))}
      {data.map((row, ri) =>
        row.map((v, ci) => {
          if (v == null || !Number.isFinite(v)) {
            return (
              <rect key={ri + '-' + ci} x={pad.l + ci * cellW + 1} y={pad.t + ri * cellH + 1}
                width={cellW - 2} height={cellH - 2} fill="#f1f5f9" stroke="none" rx="2" />
            );
          }
          const t = Math.max(-1, Math.min(1, v / m));
          const fill = t >= 0
            ? `rgba(220,38,38,${(0.1 + Math.abs(t) * 0.75).toFixed(2)})`
            : `rgba(13,148,136,${(0.1 + Math.abs(t) * 0.75).toFixed(2)})`;
          return (
            <g key={ri + '-' + ci}>
              <rect x={pad.l + ci * cellW + 1} y={pad.t + ri * cellH + 1}
                width={cellW - 2} height={cellH - 2} fill={fill} stroke="white" strokeWidth="0.5" rx="2" />
              {Math.abs(t) > 0.15 && cellW > 36 && (
                <text x={pad.l + (ci + 0.5) * cellW} y={pad.t + (ri + 0.6) * cellH} textAnchor="middle"
                  fontSize="10" fill={Math.abs(t) > 0.5 ? 'white' : '#0f172a'} fontWeight="600">
                  {Math.round(v)}
                </text>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

export function Heatmap({ data, rows, cols, height = 200, max: maxProp }) {
  const w = 720, h = height, pad = { l: 68, r: 16, t: 12, b: 30 };
  const cellW = (w - pad.l - pad.r) / cols.length;
  const cellH = (h - pad.t - pad.b) / rows.length;
  const m = maxProp || Math.max(...data.flat());
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {rows.map((rl, ri) => (
        <text key={'r' + ri} x={pad.l - 8} y={pad.t + (ri + 0.65) * cellH} textAnchor="end" fontSize="12" fill="#64748b">{rl}</text>
      ))}
      {cols.map((cl, ci) => (
        <text key={'c' + ci} x={pad.l + (ci + 0.5) * cellW} y={h - 6} textAnchor="middle" fontSize="12" fill="#64748b">{cl}</text>
      ))}
      {data.map((row, ri) =>
        row.map((v, ci) => {
          const t = v / m;
          return (
            <rect key={ri + '-' + ci}
              x={pad.l + ci * cellW + 1}
              y={pad.t + ri * cellH + 1}
              width={cellW - 2}
              height={cellH - 2}
              fill={`rgba(30,96,145,${(0.12 + t * 0.8).toFixed(2)})`}
              rx="2"
            />
          );
        })
      )}
    </svg>
  );
}
