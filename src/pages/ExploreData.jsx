// =============================================================================
// Explore Data — single-page EDA dashboard.
// Source of truth: docs/explore-reference.html (the approved design).
//
// Build approach: chart primitives are plain inline SVG (no chart libs).
// Each chart consumes either real data from api.explore.* or a named *_FALLBACK
// constant when the corresponding endpoint isn't available / no group merged.
// Every fallback site is marked with a TODO referencing the target endpoint.
// =============================================================================
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api/client';
import AiPanel from '../components/AiPanel';

// -- Design tokens (mirror the reference's :root vars) -----------------------
const C = {
  ink: '#0f172a', muted: '#64748b', line: '#eef0f3',
  teal: '#0d9488', navy: '#1e6091', red: '#dc2626', amber: '#d97706', purple: '#7c3aed',
};
const fmt0 = (v) => Math.round(v).toLocaleString();

// ----------------------------------------------------------------------------
// MOCK FALLBACK CONSTANTS — verbatim from explore-reference.html.
// These are used when the corresponding api.explore.* call fails or the
// required group isn't merged yet. Replace via wiring below as endpoint shapes
// are nailed down.
// ----------------------------------------------------------------------------
const DAILY_FALLBACK   = [54,49,58,61,52,46,44,57,63,59,55,62,68,60,53,58,66,71,64,57,61,69,72,66,59,63,70,74,68,62];
const DAILY_X_FALLBACK = ['1','','5','','10','','15','','20','','25','','30'];
const WEEKLY_FALLBACK  = [395,410,388,402,420,408,431,415,440,452,438,460,448,470];
const WEEKLY_X_FALLBACK= ['W1','','W3','','W5','','W7','','W9','','W11','','W13',''];
const MONTHLY_FALLBACK = [1680,1820,2050,2010,2180,2240,2260,2210,2120,2150,2080,1560];
const YEARLY_FALLBACK  = [16800,18200,20500,22100,23800,25400];
const YEARLY_X_FALLBACK= ['2020','2021','2022','2023','2024','2025'];

const MIX_FALLBACK     = [
  { label:'Medicine',    value:101000, color:C.navy   },
  { label:'Orthopaedics', value:23500,  color:C.teal   },
  { label:'Surgery',     value:4100,   color:C.amber  },
  { label:'Paediatrics', value:4100,   color:C.purple },
  { label:'Gynaecology', value:3900,   color:C.red    },
];
const SHIFTS_FALLBACK  = [
  { label:'Day',     value:41, color:C.teal },
  { label:'Evening', value:41, color:C.navy },
  { label:'Night',   value:18, color:'#0f1729' },
];
const DOW_FALLBACK     = [62,61,55,57,58,52,48];
const HOUR_WD_FALLBACK = [0.8,0.6,0.5,0.4,0.5,0.9,1.6,2.4,3.1,3.6,4.1,4.3,4.2,4.0,3.6,3.2,2.9,2.6,2.3,2.0,1.7,1.4,1.1,0.9];
const HOUR_WE_FALLBACK = [1.0,0.8,0.7,0.5,0.5,0.7,1.0,1.4,1.9,2.4,2.9,3.2,3.3,3.2,3.0,2.8,2.6,2.4,2.2,2.0,1.8,1.6,1.4,1.2];
const WEEKEND_FALLBACK = [
  { category:'Surgery',     v:18  }, { category:'Medicine',    v:-12 },
  { category:'Orthopaedics',v:-9  }, { category:'Paediatrics', v:-15 },
  { category:'Gynaecology', v:-11 },
];
const MONTH_FALLBACK   = [84,98,104,103,106,108,109,107,104,103,101,73];
const MONTH_L          = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CAL_FALLBACK     = [
  { category:'Public holiday', v:-22 }, { category:'Festive season', v:-19 },
  { category:'Long weekend',   v:-16 }, { category:'Weekend',        v:-11 },
  { category:'Month-end',      v: 4 },
];
const CRITICAL_FALLBACK   = [14,10,8,6,4];
const CRITICAL_L_FALLBACK = ['Trauma','Gunshot','Stab','Domestic','Sexual'];
const HEAT_FALLBACK = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((_, r) =>
  Array.from({ length: 24 }, (_, h) => {
    const base = (h >= 9 && h <= 16) ? 3.5 : h < 6 ? 0.5 : 1.8;
    return +(base * (r < 5 ? 1 : 0.8) * (0.85 + 0.3 * Math.sin(h / 3))).toFixed(1);
  })
);
const TEMP_X5_FALLBACK   = ['<10°','10–18°','18–24°','24–30°','>30°'];
const TEMP_SPEC_FALLBACK = [
  { name:'Trauma & assault', color:C.red,  data:[-8,-3,0, 7,14] },
  { name:'Medicine',         color:C.navy, data:[-6,-2,0, 5, 9] },
  { name:'Orthopaedics',     color:C.teal, data:[-3,-1,0, 3, 5] },
];
const CAL_EVENTS_FALLBACK = ['Public holiday','Long weekend','Weekend','Festive season'];
const CAL_COLS_FALLBACK   = ['Medicine','Orthopaedics','Surgery','Trauma'];
const CAL_IMPACT_FALLBACK = [
  [-20,-15, 12,-10],
  [-16,-12,  8, -6],
  [-12, -9, 18, -4],
  [-19,-14, 10,  5],
];

// ----------------------------------------------------------------------------
// Chart primitives — copied verbatim from the reference (plain SVG).
// ----------------------------------------------------------------------------
function Spark({ data, color }) {
  const W = 70, H = 26, max = Math.max(...data), min = Math.min(...data);
  const x = (i) => (i / (data.length - 1)) * W;
  const y = (v) => H - ((v - min) / (max - min || 1)) * (H - 4) - 2;
  const pts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg className="exp-spark" width={W} height={H}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function KPI({ lab, val, u, delta, deltaDir, foot, color, spark }) {
  const up = deltaDir === 'up';
  const pillBg = up ? '#dcfce7' : '#fee2e2';
  const pillC  = up ? '#16a34a' : '#dc2626';
  return (
    <div className="exp-kpi">
      <div className="exp-accent" style={{ background: color }} />
      <div className="exp-lab">{lab}</div>
      <div className="exp-val" style={{ color }}>{val}{u && <span className="exp-u">{u}</span>}</div>
      <div className="exp-foot">
        {delta != null && (
          <span className="exp-pill" style={{ background: pillBg, color: pillC }}>
            {up ? '▲' : '▼'} {delta}%
          </span>
        )}
        <span>{foot}</span>
      </div>
      {spark && <Spark data={spark} color={color} />}
    </div>
  );
}

// Premium adaptive area-line. Five touches over the basic version:
//   1. Soft SVG glow filter around the line (skipped for n > 200 to stay fast).
//   2. Subtle diagonal background sweep (teal-to-navy at 2% opacity).
//   3. Real y-axis tick marks alongside grid labels.
//   4. Draw-in stroke animation on first render.
//   5. Hover crosshair + dark tooltip showing the x label and per-series values.
// Adaptive density: no dots when n > 60, thinner stroke + dimmer fill at high n.
function AreaLine({ series, xLabels, yTicks = 5, height = 230, fill = true }) {
  const W = 980, H = height, pad = { l: 50, r: 18, t: 20, b: 32 };
  const all = series.flatMap((s) => s.data);
  const max = Math.max(...all) * 1.08, min = Math.min(0, ...all);
  const n   = series[0]?.data.length || 0;
  const X = (i) => pad.l + (i / Math.max(n - 1, 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - min) / Math.max(max - min, 1)) * (H - pad.t - pad.b);
  const ticks = Array.from({ length: yTicks }, (_, i) => min + (i / (yTicks - 1)) * (max - min));

  const showDots  = n <= 60;
  const strokeW   = n > 200 ? 1.1 : n > 60 ? 1.55 : 2.0;
  const gradOpTop = n > 200 ? 0.16 : 0.24;
  const useGlow   = n <= 200;

  // Universal label sparsity: keep at most ~8 evenly-spaced labels no matter
  // how many the caller passed in. Prevents the unreadable gray band when
  // aggregated views (Weekly = 200+ weeks, Monthly = 50+ months) hand us a
  // full label array. Empty strings in the input ('') are also respected.
  const SHOWN_TARGET = 8;
  const presentIdxs = xLabels.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
  const stride = Math.max(1, Math.ceil(presentIdxs.length / SHOWN_TARGET));
  const keepSet = new Set(
    presentIdxs.length <= SHOWN_TARGET
      ? presentIdxs
      : presentIdxs.filter((_, k) => k % stride === 0 || k === presentIdxs.length - 1)
  );
  const labelIdxs = [...keepSet].sort((a, b) => a - b);

  // Unique ids so multiple charts on the same page don't collide on filter/gradient defs.
  const baseUid = useId().replace(/:/g, '');
  const gradId  = (si) => `exp-g-${baseUid}-${si}`;
  const sweepId = `exp-sweep-${baseUid}`;
  const glowId  = `exp-glow-${baseUid}`;

  const plotW = W - pad.l - pad.r;
  // Per-series draw-in animation: dasharray must equal the actual Euclidean path
  // length, otherwise once the animation completes the pattern repeats and chops
  // the line into dash-gap segments (the bug that made 1500-point lines look broken).
  const pathLenOf = (s) => {
    let len = 0;
    for (let i = 1; i < s.data.length; i++) {
      const dx = X(i) - X(i - 1);
      const dy = Y(s.data[i]) - Y(s.data[i - 1]);
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return Math.max(len, 1);
  };
  const seriesPathLen = series.map(pathLenOf);

  // Hover state
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const onMove = (e) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (vbX - pad.l) / plotW;
    if (ratio < -0.05 || ratio > 1.05) { setHover(null); return; }
    const idx = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    setHover({ idx });
  };

  return (
    <svg ref={svgRef}
         viewBox={`0 0 ${W} ${H}`}
         style={{ width: '100%', height: 'auto', display: 'block' }}
         onMouseMove={onMove}
         onMouseLeave={() => setHover(null)}>
      <defs>
        {series.map((s, si) => (
          <linearGradient key={si} id={gradId(si)} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={s.color} stopOpacity={gradOpTop} />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
          </linearGradient>
        ))}
        <linearGradient id={sweepId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#0d9488" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#1e6091" stopOpacity="0.00" />
        </linearGradient>
        <filter id={glowId} x="-5%" y="-20%" width="110%" height="140%">
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* subtle diagonal background sweep over the plot area */}
      <rect x={pad.l} y={pad.t}
            width={plotW} height={H - pad.t - pad.b}
            fill={`url(#${sweepId})`} />

      {/* horizontal grid + y tick marks */}
      {ticks.map((t, i) => (
        <g key={`h${i}`}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)}
                stroke={i === 0 ? '#d8dee7' : '#eef1f6'} strokeWidth="1" />
          <line x1={pad.l - 4} x2={pad.l} y1={Y(t)} y2={Y(t)} stroke="#cbd5e1" strokeWidth="1" />
          <text x={pad.l - 8} y={Y(t) + 3} fontSize="10"
                fill="#94a3b8" textAnchor="end" fontFamily="JetBrains Mono">{Math.round(t)}</text>
        </g>
      ))}

      {/* sparse vertical grid — only under label ticks, dotted */}
      {labelIdxs.map((i) => {
        const gx = pad.l + (i / Math.max(xLabels.length - 1, 1)) * plotW;
        return (
          <line key={`v${i}`} x1={gx} x2={gx} y1={pad.t} y2={H - pad.b}
                stroke="#e9eef4" strokeDasharray="2 5" strokeWidth="1" />
        );
      })}

      {/* series with optional glow + draw-in animation */}
      {series.map((s, si) => {
        const line = s.data.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
        const area = `${pad.l},${Y(min)} ${line} ${X(n - 1)},${Y(min)}`;
        const dashLen = seriesPathLen[si];
        return (
          <g key={si}>
            {fill && <polygon points={area} fill={`url(#${gradId(si)})`} />}
            <polyline points={line} fill="none" stroke={s.color}
                      strokeWidth={strokeW} strokeLinejoin="round" strokeLinecap="round"
                      filter={useGlow ? `url(#${glowId})` : undefined}
                      strokeDasharray={dashLen}
                      strokeDashoffset={dashLen}>
              <animate attributeName="stroke-dashoffset"
                       from={dashLen} to="0"
                       dur="850ms" begin="0s" fill="freeze" />
            </polyline>
            {showDots && s.data.map((v, i) => (
              <circle key={i} cx={X(i)} cy={Y(v)} r="2.6"
                      fill="#fff" stroke={s.color} strokeWidth="1.6" opacity="0">
                <animate attributeName="opacity" from="0" to="1"
                         begin={`${600 + i * 6}ms`} dur="180ms" fill="freeze" />
              </circle>
            ))}
          </g>
        );
      })}

      {/* x-axis labels — only the kept-sparse set */}
      {labelIdxs.map((i) => (
        <text key={i}
              x={pad.l + (i / Math.max(xLabels.length - 1, 1)) * plotW}
              y={H - 10} fontSize="10" fill="#94a3b8" textAnchor="middle" fontFamily="JetBrains Mono">{xLabels[i]}</text>
      ))}

      {/* hover crosshair + tooltip */}
      {hover && (() => {
        const i = hover.idx;
        const cx = X(i);
        const label = xLabels[i] || `#${i + 1}`;
        const ttW = 128, ttH = 26 + series.length * 14;
        let ttX = cx + 12;
        if (ttX + ttW > W - pad.r) ttX = cx - ttW - 12;
        const ttY = pad.t + 8;
        return (
          <g key="hover" pointerEvents="none">
            <line x1={cx} x2={cx} y1={pad.t} y2={H - pad.b}
                  stroke="#0f172a" strokeOpacity="0.35" strokeDasharray="2 3" strokeWidth="1" />
            {series.map((s, si) => {
              const v = s.data[i];
              if (v == null || Number.isNaN(v)) return null;
              return (
                <circle key={si} cx={cx} cy={Y(v)} r="4"
                        fill="#fff" stroke={s.color} strokeWidth="2" />
              );
            })}
            <g>
              <rect x={ttX} y={ttY} width={ttW} height={ttH}
                    rx="7" fill="#0f172a" opacity="0.94" />
              <rect x={ttX} y={ttY} width={3} height={ttH}
                    rx="1.5" fill={series[0]?.color || '#0d9488'} />
              <text x={ttX + 10} y={ttY + 16} fontSize="11"
                    fontWeight="700" fill="#fff" fontFamily="Inter">{label}</text>
              {series.map((s, si) => {
                const v = s.data[i];
                if (v == null || Number.isNaN(v)) return null;
                return (
                  <g key={si}>
                    <circle cx={ttX + 12} cy={ttY + 30 + si * 14} r="3" fill={s.color} />
                    <text x={ttX + 20} y={ttY + 33 + si * 14} fontSize="10"
                          fill="#cbd5e1" fontFamily="JetBrains Mono">
                      {typeof v === 'number' ? (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1)) : String(v)}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        );
      })()}
    </svg>
  );
}

function Bars({ data, labels, color = C.navy, height = 200, fmt = fmt0 }) {
  const W = 380, H = height, pad = { l: 26, r: 8, t: 16, b: 22 };
  const max = Math.max(...data, 1), bw = (W - pad.l - pad.r) / data.length;
  const Y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <line key={i} x1={pad.l} x2={W - pad.r}
              y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)}
              stroke="#f1f4f7" />
      ))}
      {data.map((v, i) => (
        <g key={i}>
          <rect x={pad.l + i * bw + bw * 0.16} y={Y(v)} width={bw * 0.68}
                height={(H - pad.b) - Y(v)} rx="3" fill={color} />
          <text x={pad.l + i * bw + bw / 2} y={Y(v) - 4}
                fontSize="9" fill="#64748b" textAnchor="middle">{fmt(v)}</text>
          <text x={pad.l + i * bw + bw / 2} y={H - 7}
                fontSize="9" fill="#94a3b8" textAnchor="middle">{labels[i]}</text>
        </g>
      ))}
    </svg>
  );
}

function Donut({ slices, head, sub, size = 168, th = 26 }) {
  const r = (size - th) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let off = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <g transform={`rotate(-90 ${c} ${c})`}>
        {slices.map((s, i) => {
          const len = (s.value / total) * circ;
          const el = (
            <circle key={i} cx={c} cy={c} r={r} fill="none"
                    stroke={s.color} strokeWidth={th}
                    strokeDasharray={`${len} ${circ - len}`}
                    strokeDashoffset={-off} />
          );
          off += len;
          return el;
        })}
      </g>
      <text x={c} y={c - 1} textAnchor="middle" fontSize="25" fontWeight="800" fill="#0f172a" fontFamily="Inter">{head}</text>
      <text x={c} y={c + 16} textAnchor="middle" fontSize="10" fill="#64748b">{sub}</text>
    </svg>
  );
}

function Legend({ items }) {
  return (
    <div className="exp-legend">
      {items.map((it, i) => (
        <span key={i}>
          <i style={{ background: it.color }} />
          {it.label}{it.value ? ` · ${it.value}` : ''}
        </span>
      ))}
    </div>
  );
}

function Ranked({ rows, height }) {
  const W = 360;
  const rowH = Math.max(34, (height || rows.length * 34) / rows.length);
  const mid = W * 0.5, maxLen = W * 0.33;
  const max = Math.max(...rows.map((r) => Math.abs(r.v)), 1);
  const H = rowH * rows.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <line x1={mid} x2={mid} y1="2" y2={H - 2} stroke="#cbd5e1" />
      {rows.map((r, i) => {
        const pos = r.v >= 0;
        const len = (Math.abs(r.v) / max) * maxLen;
        const color = pos ? C.teal : C.red;
        const rowY = i * rowH, barY = rowY + rowH * 0.46, barH = rowH * 0.32;
        return (
          <g key={i}>
            <text x={4} y={rowY + 13} fontSize="11" fontWeight="600" fill="#0f172a">{r.category}</text>
            <rect x={pos ? mid : mid - len} y={barY} width={len} height={barH} rx="2" fill={color} />
            <text x={pos ? mid + len + 5 : mid - len - 5} y={barY + barH / 2 + 3.5}
                  fontSize="10" fontWeight="700" fill={color} textAnchor={pos ? 'start' : 'end'}>
              {pos ? '+' : ''}{r.v}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Calendar-impact matrix (teal = more, red = fewer)
function ImpactMatrix({ rows, cols, data, scale = 22 }) {
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 10.5, width: '100%' }}>
      <thead>
        <tr><th></th>{cols.map((c) => <th key={c} style={{ padding: '5px 4px', color: '#64748b', fontWeight: 600 }}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((row, ri) => (
          <tr key={ri}>
            <td style={{ padding: '6px 8px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{rows[ri]}</td>
            {row.map((v, ci) => {
              const m = Math.min(1, Math.abs(v) / scale);
              const bg = v >= 0 ? `rgba(13,148,136,${m})` : `rgba(220,38,38,${m})`;
              return (
                <td key={ci}
                    style={{ padding: '9px 5px', textAlign: 'center', background: bg,
                             color: m > 0.5 ? '#fff' : '#0f172a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {v > 0 ? '+' : ''}{v}%
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Hour × Weekday heatmap with 5-level legend
const HEAT_LEVELS = [
  { c: '#e0f2fe', l: 'Very quiet' },
  { c: '#7dd3fc', l: 'Quiet' },
  { c: '#22b8a6', l: 'Moderate' },
  { c: '#f59e0b', l: 'Busy' },
  { c: '#dc2626', l: 'Peak' },
];
const heatLevel = (v, max) => {
  const r = v / max;
  return r < 0.2 ? 0 : r < 0.4 ? 1 : r < 0.6 ? 2 : r < 0.8 ? 3 : 4;
};
function Heatmap({ matrix, rowLabels, colLabels }) {
  const max = Math.max(...matrix.flat(), 1);
  return (
    <div>
      {matrix.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ width: 28, fontSize: 10, color: '#64748b', textAlign: 'right' }}>{rowLabels[ri]}</span>
          <div style={{ display: 'flex', flex: 1, height: 17, borderRadius: 4, overflow: 'hidden', gap: 1.5 }}>
            {row.map((v, ci) => (
              <div key={ci} title={`${v}/hr`}
                   style={{ flex: 1, background: HEAT_LEVELS[heatLevel(v, max)].c, borderRadius: 1.5 }} />
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
        <span style={{ width: 28 }} />
        <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', fontSize: 9, color: '#94a3b8' }}>
          {colLabels.map((c, i) => <span key={i}>{c}</span>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 11, flexWrap: 'wrap' }}>
        {HEAT_LEVELS.map((lv) => (
          <span key={lv.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#475569' }}>
            <i style={{ width: 11, height: 11, borderRadius: 3, background: lv.c, display: 'inline-block' }} />{lv.l}
          </span>
        ))}
      </div>
    </div>
  );
}

function Toggle({ opts, val, onChange, color = C.teal }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: '#f1f4f7', borderRadius: 8, padding: 3, alignSelf: 'flex-start', marginBottom: 10 }}>
      {opts.map((o) => (
        <button key={o} onClick={() => onChange(o)}
                style={{
                  border: 0, fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  padding: '4px 11px', borderRadius: 6,
                  background: val === o ? color : 'transparent',
                  color: val === o ? '#fff' : '#94a3b8',
                }}>{o}</button>
      ))}
    </div>
  );
}

function Card({ title, sub, children, style }) {
  return (
    <div className="exp-card" style={style}>
      <div className="exp-chead">
        <div>
          <div className="exp-ct">{title}</div>
          {sub && <div className="exp-cs">{sub}</div>}
        </div>
        <span className="exp-dots">⋯</span>
      </div>
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------
// useAnalysis: best-effort fetch. Returns null on failure (chart falls back).
// ----------------------------------------------------------------------------
function useAnalysis(fetcher, deps = []) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetcher()
      .then((r) => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

// ----------------------------------------------------------------------------
// Sub-cards with internal toggle state
// ----------------------------------------------------------------------------
function CriticalCard({ data, labels }) {
  const [per, setPer] = useState('week');
  const mult = { day: 1 / 7, week: 1, month: 4.3 }[per];
  const view = data.map((v) => per === 'day' ? +(v * mult).toFixed(1) : Math.round(v * mult));
  return (
    <Card title="Critical-event load"
          sub={`Typical cases per ${per}, by type.`}>
      <Toggle opts={['day', 'week', 'month']} val={per} onChange={setPer} color={C.red} />
      <Bars data={view} labels={labels} color={C.red} height={190} fmt={(v) => v} />
    </Card>
  );
}

const PER_MULT = { day: 1, week: 7, month: 30.4, year: 365 };
const PER_ABBR = { day: 'day', week: 'wk', month: 'mo', year: 'yr' };
function SpecVolumeCard({ rows }) {
  const [per, setPer] = useState('day');
  const mult = PER_MULT[per];
  const max = Math.max(...rows.map((s) => s.v), 1);
  const fmtV = (v) => {
    const x = v * mult;
    return x >= 1000 ? (x / 1000).toFixed(1) + 'k' : x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1);
  };
  const topName = rows[0]?.name || 'Medicine';
  return (
    <Card title={`Patient volume by department`}
          sub={`${topName} carries most of the load. Typical arrivals per ${per}.`}>
      <Toggle opts={['day', 'week', 'month', 'year']} val={per} onChange={setPer} color={C.navy} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{ width: 88, color: '#0f172a', fontWeight: 600 }}>{s.name}</span>
            <div style={{ flex: 1, height: 14, background: '#f1f4f7', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${(s.v / max) * 100}%`, height: '100%', background: s.color, borderRadius: 5 }} />
            </div>
            <span style={{ width: 64, textAlign: 'right', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
              {fmtV(s.v)}<span style={{ color: '#94a3b8', fontWeight: 500 }}>/{PER_ABBR[per]}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// PipelineGate — dark teal-gradient intro card. Real pipeline preconditions:
// each step runs a live check against the backend. If any step fails, the gate
// halts at that step and exposes a Fix-it button that navigates to Data Hub or
// Prepare. The Dashboard never reveals unless ALL five checks pass.
// ----------------------------------------------------------------------------
const PIPELINE_STEPS = [
  {
    id: 'ingest', label: 'Ingest source datasets',
    fix: { page: 'upload', label: 'Go to Data Hub' },
    check: async () => {
      const inv = await api.datasets.inventory();
      const items = inv.items || [];
      const missing = items.filter((it) => !it.loaded);
      if (missing.length > 0) {
        const names = missing.map((it) => it.schema?.label || it.schema?.id).join(', ');
        const word = missing.length === 1 ? 'dataset is' : 'datasets are';
        return { ok: false, detail: `${missing.length} of ${items.length} ${word} not uploaded: ${names}. Upload every CSV on the Data Hub before running EDA.` };
      }
      return { ok: true, detail: `All ${items.length} source datasets loaded.` };
    },
  },
  {
    id: 'validate', label: 'Clean & validate records',
    fix: { page: 'upload', label: 'Fix in Data Hub' },
    check: async () => {
      const inv = await api.datasets.inventory();
      const loaded = (inv.items || []).filter((it) => it.loaded);
      const invalid = loaded.filter((it) => it.metadata && it.metadata.schema_valid === false);
      if (invalid.length > 0) {
        const names = invalid.map((it) => it.schema?.label || it.schema?.id).join(', ');
        return { ok: false, detail: `Schema validation failed for: ${names}. Re-upload these files.` };
      }
      return { ok: true, detail: 'All loaded datasets pass schema validation.' };
    },
  },
  {
    id: 'merge', label: 'Merge analysis groups G1–G4',
    fix: { page: 'prepare', label: 'Go to Prepare' },
    check: async () => {
      const gr = await api.prepare.groups();
      const items = gr.items || [];
      const unmerged = items.filter((it) => !it.built);
      if (unmerged.length > 0) {
        const names = unmerged.map((it) => it.spec?.label || it.spec?.id).join(', ');
        const word = unmerged.length === 1 ? 'group is' : 'groups are';
        return { ok: false, detail: `${unmerged.length} of ${items.length} ${word} not merged: ${names}. Merge every group on the Prepare page before running EDA.` };
      }
      return { ok: true, detail: `All ${items.length} analysis groups merged.` };
    },
  },
  {
    id: 'analyzers', label: 'Run EDA analyzers',
    fix: { page: 'prepare', label: 'Go to Prepare' },
    check: async () => {
      const cov = await api.explore.findingsCoverage();
      const items = cov.items || [];
      const ungrouped = items.filter((it) => !it.group);
      if (items.length === 0) {
        return { ok: false, detail: 'No analyzers are registered. Backend may be misconfigured.' };
      }
      if (ungrouped.length > 0) {
        const names = ungrouped.map((it) => it.name || it.code).slice(0, 4).join(', ');
        const more = ungrouped.length > 4 ? `, +${ungrouped.length - 4} more` : '';
        return { ok: false, detail: `${ungrouped.length} of ${items.length} analyzers have no group to run against: ${names}${more}.` };
      }
      return { ok: true, detail: `All ${items.length} analyzers ready to run.` };
    },
  },
  {
    id: 'compile', label: 'Compile validated findings',
    fix: null,
    check: async () => {
      const f = await api.explore.findings();
      const arr = f.findings || [];
      if (arr.length === 0) {
        return { ok: false, detail: 'The analyzers ran but produced no findings. Check that your data has enough rows and the required columns.' };
      }
      return { ok: true, detail: `${arr.length} findings compiled.` };
    },
  },
];

function PipelineGate({ onDone, onNavigate }) {
  // states[i] = 'idle' | 'running' | 'done' | 'failed'
  const [states, setStates]   = useState(PIPELINE_STEPS.map(() => 'idle'));
  const [details, setDetails] = useState(PIPELINE_STEPS.map(() => ''));
  const [running, setRunning] = useState(false);
  const [failedAt, setFailedAt] = useState(-1);

  const run = async () => {
    setRunning(true);
    setFailedAt(-1);
    const nextStates  = PIPELINE_STEPS.map(() => 'idle');
    const nextDetails = PIPELINE_STEPS.map(() => '');
    setStates([...nextStates]);
    setDetails([...nextDetails]);

    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      nextStates[i] = 'running';
      setStates([...nextStates]);
      let result;
      try {
        result = await PIPELINE_STEPS[i].check();
      } catch (e) {
        result = { ok: false, detail: e?.message || 'Backend unreachable.' };
      }
      nextDetails[i] = result.detail || '';
      if (!result.ok) {
        nextStates[i] = 'failed';
        setStates([...nextStates]);
        setDetails([...nextDetails]);
        setFailedAt(i);
        setRunning(false);
        return;
      }
      nextStates[i] = 'done';
      setStates([...nextStates]);
      setDetails([...nextDetails]);
      // brief breath between steps so the user sees the tick land
      await new Promise((r) => setTimeout(r, 280));
    }
    // all five passed
    setTimeout(onDone, 350);
  };

  const failed = failedAt >= 0;
  const fixStep = failed ? PIPELINE_STEPS[failedAt] : null;
  const progress = Math.min(
    100,
    (states.filter((s) => s === 'done').length / PIPELINE_STEPS.length) * 100 +
      (states.some((s) => s === 'running') ? 100 / PIPELINE_STEPS.length / 2 : 0)
  );

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        width: 'min(620px, 100%)',
        background: 'linear-gradient(160deg,#0b1f33,#0c2f3a)',
        borderRadius: 20, padding: '40px 44px',
        color: '#e6f6f4',
        boxShadow: '0 30px 80px rgba(8,30,40,.42)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -70, right: -70, width: 220, height: 220, background: 'radial-gradient(circle,rgba(45,212,191,.35),transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -50, width: 200, height: 200, background: 'radial-gradient(circle,rgba(30,96,145,.4),transparent 70%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#5eead4', textTransform: 'uppercase' }}>
            HealthForecast · EDA Engine
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '10px 0 8px', letterSpacing: -0.5 }}>
            Exploratory data analysis
          </h1>
          <p style={{ fontSize: 14, color: '#9fc7c4', lineHeight: 1.55, margin: 0 }}>
            Each step below runs a live check against the backend. The dashboard only opens after all five pass.
          </p>

          <div style={{ margin: '26px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PIPELINE_STEPS.map((s, i) => {
              const st = states[i];
              const dim = !running && st === 'idle' && failedAt < 0;
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, opacity: dim ? 0.55 : 1, transition: 'opacity .3s' }}>
                  <span style={{
                    width: 22, height: 22, minWidth: 22, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    background:
                      st === 'done'    ? C.teal :
                      st === 'failed'  ? 'rgba(220,38,38,.18)' :
                      st === 'running' ? 'rgba(94,234,212,.18)' :
                                         'rgba(255,255,255,.06)',
                    color:
                      st === 'done'   ? '#fff' :
                      st === 'failed' ? '#fca5a5' :
                                        '#5eead4',
                    border:
                      st === 'running' ? '1px solid #5eead4' :
                      st === 'failed'  ? '1px solid #fca5a5' :
                                         '1px solid transparent',
                  }}>
                    {st === 'done'    ? '✓' :
                     st === 'failed'  ? '!' :
                     st === 'running' ? '•' :
                                        i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 13.5,
                      color: st === 'idle' ? '#6b8f8c' : st === 'failed' ? '#fca5a5' : '#e6f6f4',
                      fontWeight: st === 'running' || st === 'failed' ? 600 : 400,
                    }}>{s.label}</div>
                    {details[i] && (
                      <div style={{
                        fontSize: 11.5, marginTop: 3, lineHeight: 1.45,
                        color: st === 'failed' ? '#fca5a5' : '#9fc7c4',
                      }}>{details[i]}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {failed && fixStep && (
            <div style={{
              background: 'rgba(220,38,38,.10)', border: '1px solid rgba(220,38,38,.35)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 14,
              fontSize: 12.5, color: '#fecaca', lineHeight: 1.5,
            }}>
              <strong style={{ color: '#fee2e2' }}>Cannot start analysis.</strong>{' '}
              {details[failedAt] || 'A required pipeline step is not satisfied.'}
            </div>
          )}

          {failed ? (
            <div style={{ display: 'flex', gap: 10 }}>
              {fixStep?.fix && onNavigate && (
                <button onClick={() => onNavigate(fixStep.fix.page)} style={{
                  flex: 1, border: 0, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                  color: '#06231f', padding: '12px 14px', borderRadius: 10,
                  background: 'linear-gradient(135deg,#5eead4,#0d9488)',
                  boxShadow: '0 8px 24px rgba(13,148,136,.35)',
                }}>{fixStep.fix.label} →</button>
              )}
              <button onClick={run} style={{
                flex: 1, border: '1px solid rgba(94,234,212,.4)', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                color: '#5eead4', padding: '12px 14px', borderRadius: 10,
                background: 'transparent',
              }}>↻ Re-check pipeline</button>
            </div>
          ) : !running ? (
            <button onClick={run} style={{
              width: '100%', border: 0, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
              color: '#06231f', padding: '14px', borderRadius: 12,
              background: 'linear-gradient(135deg,#5eead4,#0d9488)',
              boxShadow: '0 8px 24px rgba(13,148,136,.45)',
            }}>▶&nbsp;&nbsp;Start the analysis</button>
          ) : (
            <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: 'linear-gradient(90deg,#5eead4,#0d9488)', transition: 'width .5s',
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Dashboard helpers — turn raw API responses into chart-ready shapes
// ----------------------------------------------------------------------------
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function buildXLabels(dates, density = 7) {
  if (!Array.isArray(dates) || dates.length === 0) return [];
  const first = new Date(dates[0]);
  const last  = new Date(dates[dates.length - 1]);
  const dayCount = (last - first) / 86400000;
  // pick formatter based on span
  let fmt;
  if (dayCount > 730) {
    fmt = (d) => { const dt = new Date(d); return `${MONTH_SHORT[dt.getMonth()]} '${String(dt.getFullYear()).slice(2)}`; };
  } else if (dayCount > 75) {
    fmt = (d) => { const dt = new Date(d); return `${MONTH_SHORT[dt.getMonth()]} ${dt.getDate()}`; };
  } else {
    fmt = (d) => { const dt = new Date(d); return `${MONTH_SHORT[dt.getMonth()]} ${dt.getDate()}`; };
  }
  const step = Math.max(1, Math.floor(dates.length / density));
  return dates.map((d, i) => (i === 0 || i === dates.length - 1 || i % step === 0 ? fmt(d) : ''));
}

function aggregateByPeriod(dates, values, period) {
  if (!Array.isArray(dates) || !Array.isArray(values)) return null;
  const buckets = new Map();
  for (let i = 0; i < dates.length; i++) {
    const dt = new Date(dates[i]);
    if (Number.isNaN(dt.getTime())) continue;
    let key;
    if (period === 'week') {
      const wk = new Date(dt); wk.setDate(dt.getDate() - dt.getDay());
      key = wk.toISOString().slice(0, 10);
    } else if (period === 'month') {
      key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    } else {
      key = String(dt.getFullYear());
    }
    buckets.set(key, (buckets.get(key) || 0) + (values[i] || 0));
  }
  const keys = [...buckets.keys()].sort();
  if (!keys.length) return null;
  let labels;
  if (period === 'week')       labels = keys.map((k) => k.slice(5));
  else if (period === 'month') labels = keys.map((k) => MONTH_L[parseInt(k.slice(5, 7), 10) - 1] || k.slice(5));
  else                          labels = keys;
  return { data: keys.map((k) => Math.round(buckets.get(k))), labels };
}

function shiftSplit(hourlyRows) {
  if (!Array.isArray(hourlyRows) || hourlyRows.length !== 24) return null;
  const sum = (lo, hi) => hourlyRows.slice(lo, hi + 1).reduce((s, r) => s + (r.mean || 0), 0);
  const day = sum(8, 15), eve = sum(16, 22), night = sum(0, 7) + (hourlyRows[23]?.mean || 0);
  const tot = day + eve + night || 1;
  return [
    { label: 'Day',     value: Math.round(day   / tot * 100), color: C.teal },
    { label: 'Evening', value: Math.round(eve   / tot * 100), color: C.navy },
    { label: 'Night',   value: Math.round(night / tot * 100), color: '#0f1729' },
  ];
}

function dowCurvesWeekdayWeekend(curves) {
  if (!curves) return null;
  const wd = ['Mon','Tue','Wed','Thu','Fri'].map((d) => curves[d]).filter(Array.isArray);
  const we = ['Sat','Sun'].map((d) => curves[d]).filter(Array.isArray);
  const avg = (arrs) =>
    arrs.length === 0 ? null :
    Array.from({ length: 24 }, (_, h) => arrs.reduce((s, arr) => s + (arr[h] || 0), 0) / arrs.length);
  return { wd: avg(wd), we: avg(we) };
}

const CAL_FEATURE_LABELS = {
  is_public_holiday:   'Public holiday',
  is_festive_season:   'Festive season',
  is_long_weekend:     'Long weekend',
  is_weekend:          'Weekend',
  is_month_end_period: 'Month-end',
  is_school_holiday:   'School holiday',
  is_near_holiday:     'Near holiday',
  is_december:         'December',
};
function calRankedFromImpactMatrix(impactRows) {
  if (!Array.isArray(impactRows)) return null;
  const out = [];
  for (const r of impactRows) {
    if (r.kind !== 'binary' || !r.true || r.true.pct == null) continue;
    out.push({ category: CAL_FEATURE_LABELS[r.feature] || r.feature, v: r.true.pct });
  }
  return out.length ? out.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 5) : null;
}

function tempImpactFromImpactMatrix(impactRows) {
  if (!Array.isArray(impactRows)) return null;
  const tempRow = impactRows.find((r) => r.feature === 'temp_mean_C' && r.kind === 'quartile');
  if (!tempRow) return null;
  const data = ['Q1','Q2','Q3','Q4']
    .map((q) => (tempRow[q] && tempRow[q].pct != null ? tempRow[q].pct : null))
    .filter((v) => v != null);
  if (data.length < 2) return null;
  return data;
}

const ACCENT_TO_COLOR = { risk: C.red, watch: C.amber, stable: C.teal, trend: C.navy, neutral: C.purple };

// ---------------------------------------------------------------------------
// Manager-language derivations.
// Every tile reads from one of the useAnalysis() responses already in
// Dashboard, so the entire strip updates when refreshKey bumps (new ingest,
// re-merge, manual refresh, or window focus). No analyst jargon.
// ---------------------------------------------------------------------------
const DOW_LABELS_FULL = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};
const MONTHS_SHORT_2 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dailyAverageOf(stlObs) {
  if (!Array.isArray(stlObs) || stlObs.length === 0) return null;
  return Math.round(stlObs.reduce((a, b) => a + b, 0) / stlObs.length);
}

function dataWindowOf(stlDates) {
  if (!Array.isArray(stlDates) || stlDates.length === 0) return null;
  const first = new Date(stlDates[0]);
  const last  = new Date(stlDates[stlDates.length - 1]);
  const yearsExact = (last - first) / (365.25 * 86400000);
  const f = `${MONTHS_SHORT_2[first.getMonth()]} ${first.getFullYear()}`;
  const l = `${MONTHS_SHORT_2[last.getMonth()]} ${last.getFullYear()}`;
  let headline, unit;
  if (yearsExact >= 1) {
    headline = yearsExact.toFixed(1);
    unit = yearsExact >= 1.95 ? 'years' : 'year';
  } else {
    headline = String(Math.round(yearsExact * 12));
    unit = 'months';
  }
  return { range: `${f} → ${l}`, headline, unit };
}

// Compare last full 365 days to the prior 365 days. More robust than
// year-on-year sums when the first/last calendar years are partial.
function yearOnYearGrowth(stlDates, stlObs) {
  if (!stlDates || !stlObs || stlDates.length < 400) return null;
  const last = new Date(stlDates[stlDates.length - 1]);
  const y1   = new Date(last); y1.setFullYear(last.getFullYear() - 1);
  const y2   = new Date(last); y2.setFullYear(last.getFullYear() - 2);
  let r = 0, rN = 0, p = 0, pN = 0;
  for (let i = 0; i < stlDates.length; i++) {
    const dt = new Date(stlDates[i]);
    if (dt > y1)      { r += stlObs[i]; rN++; }
    else if (dt > y2) { p += stlObs[i]; pN++; }
  }
  if (rN < 30 || pN < 30) return null;
  const ra = r / rN, pa = p / pN;
  const pct = ((ra - pa) / pa) * 100;
  return { pct: pct.toFixed(1), dir: pct >= 0 ? 'up' : 'down' };
}

function busiestWindowOf(hourlyRows) {
  if (!Array.isArray(hourlyRows) || hourlyRows.length !== 24) return null;
  let bestStart = 0, bestSum = -Infinity;
  for (let s = 0; s <= 20; s++) {
    const sum = hourlyRows.slice(s, s + 4).reduce((a, r) => a + (r.mean || 0), 0);
    if (sum > bestSum) { bestSum = sum; bestStart = s; }
  }
  const fmtH = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
  return `${fmtH(bestStart)} – ${fmtH(bestStart + 4)}`;
}

function busiestDayOf(calEffects) {
  if (!Array.isArray(calEffects?.day_of_week) || !Array.isArray(calEffects?.day_of_week_labels)) return null;
  const means = calEffects.day_of_week.map((d) => d.mean || 0);
  const overall = means.reduce((a, b) => a + b, 0) / means.length;
  let maxIdx = 0;
  for (let i = 1; i < means.length; i++) if (means[i] > means[maxIdx]) maxIdx = i;
  const pct = overall > 0 ? Math.round((means[maxIdx] - overall) / overall * 100) : 0;
  const short = calEffects.day_of_week_labels[maxIdx];
  return { name: DOW_LABELS_FULL[short] || short, pct };
}

function topDepartmentOf(mix) {
  if (!mix?.totals) return null;
  const entries = Object.entries(mix.totals).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return null;
  return { name: entries[0][0], pct: Math.round(entries[0][1] / total * 100) };
}

// Build the manager-facing KPI strip purely from response data.
// Returns an array of {lab, val, u?, foot, color, spark?, delta?, deltaDir?}.
function buildManagerKpis({ stlDates, stlObs, hourly, calEffects, mix }) {
  const cards = [];

  // 1. DAILY AVERAGE
  const avg = dailyAverageOf(stlObs);
  cards.push({
    lab: 'DAILY AVERAGE',
    val: avg != null ? avg.toLocaleString() : '—',
    foot: 'patients on a typical day',
    color: C.teal,
    spark: stlObs ? stlObs.slice(-30) : null,
  });

  // 2. BUSIEST PERIOD
  const win = busiestWindowOf(hourly?.rows);
  cards.push({
    lab: 'BUSIEST PERIOD',
    val: win || '—',
    foot: 'peak window of the day',
    color: C.navy,
  });

  // 3. BUSIEST DAY
  const day = busiestDayOf(calEffects);
  cards.push({
    lab: 'BUSIEST DAY',
    val: day ? day.name : '—',
    foot: day ? `${day.pct >= 0 ? '+' : ''}${day.pct}% vs the weekly average` : 'vs the weekly average',
    color: C.amber,
  });

  // 4. GROWTH (last 12 months vs prior 12 months)
  const grow = yearOnYearGrowth(stlDates, stlObs);
  cards.push({
    lab: 'GROWTH',
    val: grow ? `${grow.pct}` : '—',
    u: grow ? '%' : null,
    foot: grow ? 'last 12 months vs the year before' : 'over the last 12 months',
    color: grow ? (grow.dir === 'up' ? C.teal : C.red) : C.purple,
    delta: grow ? Math.abs(parseFloat(grow.pct)).toFixed(1) : null,
    deltaDir: grow?.dir,
  });

  // 5. TOP DEPARTMENT
  const top = topDepartmentOf(mix);
  cards.push({
    lab: 'TOP DEPARTMENT',
    val: top ? top.name : '—',
    foot: top ? `${top.pct}% of all arrivals` : 'share of all arrivals',
    color: C.purple,
  });

  // 6. HISTORY (duration first, dates as subtitle so the tile reads at a glance)
  const win2 = dataWindowOf(stlDates);
  cards.push({
    lab: 'HISTORY',
    val: win2 ? win2.headline : '—',
    u: win2 ? win2.unit : null,
    foot: win2 ? win2.range : 'of patient records',
    color: C.navy,
  });

  return cards;
}

// ----------------------------------------------------------------------------
// Dashboard — every chart wired to api.explore.* with mock-only fallback for
// the two cards the backend does not yet support per-specialty
// (Surgery-on-weekends, temperature-impact-by-specialty, calendar-impact matrix).
// ----------------------------------------------------------------------------
function Dashboard({ onRerun }) {
  const [gran,  setGran ] = useState('Daily');
  // refreshKey drives all data fetches. It bumps on:
  //   1. user clicks "Refresh" button
  //   2. window/tab regains focus (so editing Data Hub then coming back pulls fresh state)
  //   3. document.visibilitychange (mobile / minimised tab)
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefreshedAt, setAutoRefreshedAt] = useState(null);

  useEffect(() => {
    const bump = () => {
      setRefreshKey((k) => k + 1);
      setAutoRefreshedAt(new Date());
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') bump(); };
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const metrics      = useAnalysis(() => api.explore.metrics('forecast'),         [refreshKey]);
  const stl          = useAnalysis(() => api.explore.task1Stl('g1'),              [refreshKey]);
  const hourly       = useAnalysis(() => api.explore.layer2HourlyProfile('g2'),   [refreshKey]);
  const mix          = useAnalysis(() => api.explore.task2SpecialtyMix('g3'),     [refreshKey]);
  const calEffects   = useAnalysis(() => api.explore.task1CalendarEffects('g1'),  [refreshKey]);
  const classBalance = useAnalysis(() => api.explore.task3ClassBalance('g3'),     [refreshKey]);
  const impactM      = useAnalysis(() => api.explore.impactMatrix('g1'),          [refreshKey]);

  // --- KPI strip (manager-language, derived from real backend responses) ---
  // Defined after the data variables below so the helper sees stlDates/stlObs/
  // hourly/calEffects/mix; we declare a placeholder here and assign at the end.
  let kpiCards = null;

  // --- hero chart data ---
  // Daily view plots STL's smoothed `trend` so the user sees the long-run shape
  // rather than the 1,500-point noise of `observed`. Aggregated views still
  // use `observed` because Weekly/Monthly/Yearly sums are themselves smoothing.
  const stlDates = Array.isArray(stl?.dates)    ? stl.dates    : null;
  const stlObs   = Array.isArray(stl?.observed) ? stl.observed : null;
  const stlTrend = Array.isArray(stl?.trend)    ? stl.trend    : null;

  const dailyData    = stlTrend || stlObs || DAILY_FALLBACK;
  const dailyLabels  = stlDates ? buildXLabels(stlDates) : DAILY_X_FALLBACK;
  const weekly       = stlDates ? aggregateByPeriod(stlDates, stlObs, 'week')  : null;
  const monthly      = stlDates ? aggregateByPeriod(stlDates, stlObs, 'month') : null;
  const yearly       = stlDates ? aggregateByPeriod(stlDates, stlObs, 'year')  : null;
  const hourlyMeans  = Array.isArray(hourly?.rows) ? hourly.rows.map((r) => r.mean) : null;

  // --- specialty multi-line for hero "By specialty" view ---
  let bySpecSeries = null;
  let bySpecLegend = null;
  let bySpecLabels = dailyLabels;
  if (mix?.series && Array.isArray(mix.specialties)) {
    const top = mix.specialties.slice(0, 3);
    const colors = [C.navy, C.teal, C.red, C.amber, C.purple];
    bySpecSeries = top
      .map((s, i) => ({ data: Array.isArray(mix.series[s]) ? mix.series[s] : [], color: colors[i] }))
      .filter((s) => s.data.length > 0);
    if (bySpecSeries.length && Array.isArray(mix.dates)) {
      bySpecLabels = buildXLabels(mix.dates);
    }
    bySpecLegend = top.slice(0, bySpecSeries.length).map((s, i) => ({ label: s, color: colors[i] }));
  }

  const HOUR_X = ['0h','4h','8h','12h','16h','20h','23h'];
  const GRAN = {
    Daily:   { series: [{ data: dailyData, color: C.teal }], x: dailyLabels, fill: true,
               sub: stlTrend
                 ? 'How daily demand has shifted across the full record.'
                 : stlDates
                   ? 'Daily patient arrivals across the full record.'
                   : 'Waiting for your data to load.' },
    Weekly:  { series: [{ data: weekly?.data  || WEEKLY_FALLBACK,  color: C.teal }],
               x: weekly?.labels  || WEEKLY_X_FALLBACK, fill: true,
               sub: 'Total patients arriving each week.' },
    Monthly: { series: [{ data: monthly?.data || MONTHLY_FALLBACK, color: C.teal }],
               x: monthly?.labels || MONTH_L, fill: true,
               sub: 'Total patients arriving each month.' },
    Yearly:  { series: [{ data: yearly?.data  || YEARLY_FALLBACK,  color: C.teal }],
               x: yearly?.labels  || YEARLY_X_FALLBACK, fill: true,
               sub: 'Total patients arriving each year.' },
    Hourly:  { series: [{ data: hourlyMeans || HOUR_WD_FALLBACK, color: C.navy }],
               x: hourlyMeans ? Array.from({ length: 24 }, (_, h) => (h % 4 === 0 || h === 23 ? `${h}h` : '')) : HOUR_X,
               fill: true,
               sub: 'How a typical day looks, hour by hour.' },
    'By specialty': bySpecSeries && bySpecSeries.length
      ? { series: bySpecSeries, x: bySpecLabels, fill: false, legend: bySpecLegend,
          sub: 'How each department’s demand has shifted over time.' }
      : { series: [
            { data: DAILY_FALLBACK.map((v) => Math.round(v * 0.73)), color: C.navy },
            { data: DAILY_FALLBACK.map((v) => Math.round(v * 0.17)), color: C.teal },
            { data: DAILY_FALLBACK.map((v) => Math.max(1, Math.round(v * 0.05))), color: C.red },
          ], x: DAILY_X_FALLBACK, fill: false,
          legend: [{ label:'Medicine', color:C.navy }, { label:'Orthopaedics', color:C.teal }, { label:'Trauma', color:C.red }],
          sub: 'Waiting for your data to load.' },
  };

  // --- yearly bars ---
  const yearlyBars   = yearly?.data   || YEARLY_FALLBACK;
  const yearlyLabels = yearly?.labels || YEARLY_X_FALLBACK;

  // --- mix donut ---
  const SPEC_COLORS = [C.navy, C.teal, C.amber, C.purple, C.red, '#0f1729', '#16a34a'];
  const mixSlices = mix?.totals
    ? Object.entries(mix.totals).map(([label, value], i) => ({ label, value, color: SPEC_COLORS[i % SPEC_COLORS.length] }))
    : MIX_FALLBACK;
  const mixTotal = mixSlices.reduce((s, x) => s + x.value, 0) || 1;
  const mixTop   = [...mixSlices].sort((a, b) => b.value - a.value)[0];
  const mixHead  = `${Math.round(mixTop.value / mixTotal * 100)}%`;
  const mixSub   = mixTop.label;

  // --- shifts donut ---
  const shifts     = hourly?.rows ? shiftSplit(hourly.rows) : null;
  const shiftsArr  = shifts || SHIFTS_FALLBACK;
  const shiftsHead = `${shiftsArr[0].value}/${shiftsArr[1].value}/${shiftsArr[2].value}`;

  // --- DOW bars ---
  const dowMeans  = Array.isArray(calEffects?.day_of_week)
    ? calEffects.day_of_week.map((d) => d.mean || 0)
    : DOW_FALLBACK;
  const dowLabels = calEffects?.day_of_week_labels || ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // --- hourly weekday/weekend lines ---
  const dowSplit = hourly?.dow_curves ? dowCurvesWeekdayWeekend(hourly.dow_curves) : null;
  const hourLines = dowSplit && dowSplit.wd && dowSplit.we
    ? [{ data: dowSplit.wd, color: C.navy }, { data: dowSplit.we, color: C.red }]
    : [{ data: HOUR_WD_FALLBACK, color: C.navy }, { data: HOUR_WE_FALLBACK, color: C.red }];

  // --- monthly seasonality ---
  const monthMeans  = Array.isArray(calEffects?.month)
    ? calEffects.month.map((m) => m.mean || 0)
    : MONTH_FALLBACK;
  const monthLabels = calEffects?.month_labels || MONTH_L;

  // --- calendar ranked bars ---
  const calRanked = impactM?.rows ? calRankedFromImpactMatrix(impactM.rows) : null;
  const calBars   = calRanked || CAL_FALLBACK;

  // --- temperature impact (overall daily) ---
  // The backend gives an overall temp-quartile effect, not per-specialty.
  // We render one series for the overall effect when available; otherwise fallback to design's 3-series mock.
  const tempImpactOverall = impactM?.rows ? tempImpactFromImpactMatrix(impactM.rows) : null;
  const tempSeries = tempImpactOverall
    ? [{ data: tempImpactOverall, color: C.amber }]
    : TEMP_SPEC_FALLBACK.map((s) => ({ data: s.data, color: s.color }));
  const tempLabels = tempImpactOverall ? ['Q1','Q2','Q3','Q4'].slice(0, tempImpactOverall.length) : TEMP_X5_FALLBACK;
  const tempLegend = tempImpactOverall
    ? [{ label: 'Temperature quartile effect (overall)', color: C.amber }]
    : TEMP_SPEC_FALLBACK.map((s) => ({ label: s.name, color: s.color }));

  // --- heatmap (7 x 24) ---
  const heatmapMatrix = hourly?.dow_curves
    ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) =>
        Array.isArray(hourly.dow_curves[d]) ? hourly.dow_curves[d] : new Array(24).fill(0)
      )
    : HEAT_FALLBACK;

  // --- critical events (Day/Week/Month toggle) ---
  const critRaw = Array.isArray(classBalance?.categories)
    ? classBalance.categories.slice(0, 5)
    : null;
  const critData   = critRaw ? critRaw.map((c) => c.mean || 0) : CRITICAL_FALLBACK;
  const critLabels = critRaw ? critRaw.map((c) => c.category) : CRITICAL_L_FALLBACK;

  // --- spec volume (Day/Week/Month/Year toggle) ---
  const dayCount = mix?.dates?.length || stlDates?.length || 1;
  const specVolumeRows = mix?.totals
    ? Object.entries(mix.totals)
        .map(([label, total], i) => ({
          name: label,
          v: total / Math.max(dayCount, 1),
          color: SPEC_COLORS[i % SPEC_COLORS.length],
        }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 5)
    : [
        { name:'Medicine',     v:42.3, color:C.navy   },
        { name:'Orthopaedics', v: 9.9, color:C.teal   },
        { name:'Surgery',      v: 1.7, color:C.amber  },
        { name:'Paediatrics',  v: 1.7, color:C.purple },
        { name:'Gynaecology',  v: 1.5, color:C.red    },
      ];

  // --- KPI strip (assign now that all upstream derivations are ready) ---
  kpiCards = buildManagerKpis({ stlDates, stlObs, hourly, calEffects, mix });

  return (
    <div className="exp-page">
      {/* control bar */}
      <div className="exp-bar">
        <div>
          <h1>What your hospital data is telling you</h1>
          <div className="exp-sub">
            {stlDates
              ? `Patterns and trends in ${stlDates.length.toLocaleString()} days of patient arrivals.`
              : 'Loading data…'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }} className="exp-no-print">
          <button className="exp-filter"
                  onClick={() => window.print()}
                  title="Save this page as a PDF (uses your browser's print dialog — choose 'Save as PDF')">
            ⬇ Download PDF
          </button>
          <button className="exp-filter"
                  onClick={() => { setRefreshKey((k) => k + 1); setAutoRefreshedAt(new Date()); }}
                  title={autoRefreshedAt ? `Last refreshed ${autoRefreshedAt.toLocaleTimeString()}` : 'Refresh data'}>
            ⟳ Refresh
          </button>
          <button className="exp-filter" onClick={onRerun} style={{ borderColor: C.teal, color: C.teal }}>↻ Re-run gate</button>
        </div>
      </div>

      {/* KPI hero row — wired to api.explore.metrics('forecast') */}
      <div className="exp-kpis">
        {kpiCards.map((k, i) => <KPI key={i} {...k} />)}
      </div>

      {/* hero gridded area-line */}
      <Card title="Patient arrivals" sub={GRAN[gran].sub}>
        <Toggle opts={['Daily','Weekly','Monthly','Yearly','Hourly','By specialty']} val={gran} onChange={setGran} />
        <AreaLine series={GRAN[gran].series} xLabels={GRAN[gran].x} height={250} fill={GRAN[gran].fill} />
        {GRAN[gran].legend && <Legend items={GRAN[gran].legend} />}
      </Card>

      {/* row 1 — 3 composition cards */}
      <div className="exp-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 14 }}>
        <Card title="Year-on-year growth"
              sub="Total patients arriving each year.">
          <Bars data={yearlyBars} labels={yearlyLabels} color={C.teal} height={210}
                fmt={(v) => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toString()} />
        </Card>
        <Card title={`${mixSub} handles ${mixHead} of all arrivals`}
              sub="Share of patients by department.">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Donut slices={mixSlices} head={mixHead} sub={mixSub} />
            <Legend items={mixSlices.map((s) => ({
              label: s.label, color: s.color,
              value: `${Math.round(s.value / mixTotal * 100) || '<1'}%`,
            }))} />
          </div>
        </Card>
        <Card title="Demand by shift"
              sub="How patients arrive across morning, evening, and overnight.">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Donut slices={shiftsArr} head={shiftsHead} sub="Day / Eve / Night" />
            <Legend items={shiftsArr.map((s) => ({ label: s.label, color: s.color, value: `${s.value}%` }))} />
          </div>
        </Card>
      </div>

      {/* row 2 — weekday / hourly / weekend */}
      <div className="exp-grid" style={{ gridTemplateColumns: '1fr 1.3fr 1fr', marginTop: 14 }}>
        <Card title="Demand by day of week" sub="Average patients arriving each weekday.">
          <Bars data={dowMeans} labels={dowLabels} height={210} />
        </Card>
        <Card title="A typical day, hour by hour"
              sub="How weekday and weekend hours compare.">
          <AreaLine series={hourLines}
                    xLabels={Array.from({ length: 24 }, (_, h) => (h % 4 === 0 || h === 23 ? `${h}h` : ''))}
                    height={210} fill={false} />
          <Legend items={[
            { label: 'Weekday', color: C.navy },
            { label: 'Weekend', color: C.red  },
          ]} />
        </Card>
        <Card title="Surgery rises on weekends — all others fall"
              sub="Sample pattern · per-department weekend view not in the data yet.">
          {/* TODO: needs per-specialty weekday/weekend deviation endpoint */}
          <Ranked rows={WEEKEND_FALLBACK} height={210} />
        </Card>
      </div>

      {/* row 3 — seasonality + overall calendar */}
      <div className="exp-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
        <Card title="Demand month by month" sub="Average patients arriving each month of the year.">
          <Bars data={monthMeans} labels={monthLabels} color={C.navy} height={210} />
        </Card>
        <Card title="How holidays and weekends change demand"
              sub="Days flagged with each event vs a normal day.">
          <Ranked rows={calBars} height={210} />
        </Card>
      </div>

      {/* row 4 — temperature impact + calendar-by-specialty (sample) */}
      <div className="exp-grid" style={{ gridTemplateColumns: '1.5fr 1fr', marginTop: 14 }}>
        <Card title="How weather affects demand"
              sub={tempImpactOverall
                ? 'Change in patient arrivals from cool to hot days.'
                : 'Sample pattern · per-department weather view not in the data yet.'}>
          {/* TODO: per-specialty temperature impact requires extending impact_matrix */}
          <AreaLine series={tempSeries} xLabels={tempLabels} height={260} fill={false} />
          <Legend items={tempLegend} />
        </Card>
        <Card title="Calendar impact by department"
              sub="Sample matrix · per-department calendar view not in the data yet.">
          {/* TODO: per-specialty calendar matrix requires extending impact_matrix */}
          <div style={{ marginTop: 10 }}>
            <ImpactMatrix rows={CAL_EVENTS_FALLBACK} cols={CAL_COLS_FALLBACK} data={CAL_IMPACT_FALLBACK} />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 10.5, color: '#475569' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <i style={{ width: 11, height: 11, borderRadius: 3, background: C.teal, display: 'inline-block' }} />
              More than usual
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <i style={{ width: 11, height: 11, borderRadius: 3, background: C.red, display: 'inline-block' }} />
              Fewer than usual
            </span>
          </div>
        </Card>
      </div>

      {/* row 5 — heatmap + critical + specialty volume */}
      <div className="exp-grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr', marginTop: 14 }}>
        <Card title="When the hospital is busiest"
              sub="Darker squares mean more patients arrive at that hour.">
          <div style={{ marginTop: 6 }}>
            <Heatmap matrix={heatmapMatrix}
                     rowLabels={['Mon','Tue','Wed','Thu','Fri','Sat','Sun']}
                     colLabels={['0h','6h','12h','18h','23h']} />
          </div>
        </Card>
        <CriticalCard data={critData} labels={critLabels} />
        <SpecVolumeCard rows={specVolumeRows} />
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
        {stlDates && <span>{stlDates.length.toLocaleString()} daily points in the record</span>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Default export
// ----------------------------------------------------------------------------
export default function ExploreData({ onNavigate }) {
  const [ready, setReady] = useState(false);
  return (
    <div className="content">
      {ready
        ? <>
            <AiPanel surface="explore" label="Brief me on the findings"
              fetchContext={() => api.explore.findings()} />
            <Dashboard onRerun={() => setReady(false)} />
          </>
        : <PipelineGate onDone={() => setReady(true)} onNavigate={onNavigate} />}
    </div>
  );
}
