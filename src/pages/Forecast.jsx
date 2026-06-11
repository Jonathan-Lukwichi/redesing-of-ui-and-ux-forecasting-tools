// =============================================================================
// Forecast — manager-facing page. Pick a model family, pick a horizon, click
// Predict. The backend pulls history from G1 itself; the browser sends nothing
// but {model, horizon}. All the modeling complexity (feature engineering,
// hyperparameter selection, validation) lives server-side.
// =============================================================================
import { useState } from 'react';
import { api } from '../api/client';

const C = {
  ink: '#0f172a', muted: '#64748b', line: '#eef0f3',
  teal: '#0d9488', navy: '#1e6091', red: '#dc2626', amber: '#d97706', purple: '#7c3aed',
};

const HORIZONS = [
  { value: 7,  label: '7 days',  sub: 'next week' },
  { value: 14, label: '14 days', sub: 'next 2 weeks' },
  { value: 30, label: '30 days', sub: 'next month' },
];

const MODELS = [
  {
    id: 'statistical',
    icon: '📈',
    title: 'Statistical',
    family: 'ARIMA / SARIMA',
    description: 'Fast and interpretable. Best when patterns are stable and the recent past is a good guide.',
    strengths: ['Trains in seconds', 'Clear confidence bands', 'Robust to noisy data'],
    color: C.navy,
  },
  {
    id: 'ml',
    icon: '🧠',
    title: 'Machine Learning',
    family: 'Gradient Boosting',
    description: 'Captures weather, calendar, and lag effects on top of the trend. Better when external factors matter.',
    strengths: ['Uses every signal', 'Adapts to recent shifts', 'Strongest mid-range accuracy'],
    color: C.teal,
  },
];

// ----------------------------------------------------------------------------
// Chart — recent history + forecast with 95% confidence band
// ----------------------------------------------------------------------------
function ForecastChart({ history, forecast, height = 280 }) {
  const W = 980, H = height, pad = { l: 50, r: 18, t: 20, b: 32 };
  if (!history?.length || !forecast?.length) return null;

  const histPts = history.map((p) => ({ date: p.date, value: p.arrivals }));
  const fcPts   = forecast.map((p) => ({ date: p.date, value: p.predicted, lower: p.lower, upper: p.upper }));
  const all = [...histPts, ...fcPts];
  const allY = [
    ...histPts.map((p) => p.value),
    ...fcPts.map((p) => p.value),
    ...fcPts.map((p) => p.lower),
    ...fcPts.map((p) => p.upper),
  ];

  const max = Math.max(...allY) * 1.08;
  const min = Math.max(0, Math.min(...allY) - 5);
  const n = all.length;
  const X = (i) => pad.l + (i / Math.max(n - 1, 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - min) / Math.max(max - min, 1)) * (H - pad.t - pad.b);

  const splitIdx = histPts.length;
  const dividerX = X(splitIdx - 0.5);

  const histLine = histPts.map((p, i) => `${X(i)},${Y(p.value)}`).join(' ');

  const lastHistory = histPts[histPts.length - 1];
  const fcStartIdx  = histPts.length;
  const fcLineCoords = [
    `${X(fcStartIdx - 1)},${Y(lastHistory.value)}`,
    ...fcPts.map((p, i) => `${X(fcStartIdx + i)},${Y(p.value)}`),
  ].join(' ');

  // Confidence band polygon (upper edge forward, lower edge back)
  const bandTop    = fcPts.map((p, i) => `${X(fcStartIdx + i)},${Y(p.upper)}`).join(' ');
  const bandBottom = fcPts.map((p, i) => `${X(fcStartIdx + i)},${Y(p.lower)}`).reverse().join(' ');
  const bandPoly   = `${X(fcStartIdx - 1)},${Y(lastHistory.value)} ${bandTop} ${X(fcStartIdx + fcPts.length - 1)},${Y(fcPts[fcPts.length - 1].lower)} ${bandBottom}`;

  const yTicks = 5;
  const ticks = Array.from({ length: yTicks }, (_, i) => min + (i / (yTicks - 1)) * (max - min));

  const labelCount = Math.min(7, n);
  const labelIdxs = Array.from({ length: labelCount }, (_, k) => Math.round(k * (n - 1) / Math.max(labelCount - 1, 1)));
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtLabel = (iso) => {
    const dt = new Date(iso);
    return `${MONTH_SHORT[dt.getMonth()]} ${dt.getDate()}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="fc-hist-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.navy} stopOpacity="0.18" />
          <stop offset="100%" stopColor={C.navy} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {ticks.map((t, i) => (
        <g key={`h${i}`}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)}
                stroke={i === 0 ? '#d8dee7' : '#eef1f6'} strokeWidth="1" />
          <text x={pad.l - 10} y={Y(t) + 3} fontSize="10"
                fill="#94a3b8" textAnchor="end" fontFamily="JetBrains Mono">{Math.round(t)}</text>
        </g>
      ))}

      <polygon points={`${pad.l},${Y(min)} ${histLine} ${X(splitIdx - 1)},${Y(min)}`} fill="url(#fc-hist-grad)" />

      <polygon points={bandPoly} fill={C.teal} fillOpacity="0.18" />

      <line x1={dividerX} x2={dividerX} y1={pad.t} y2={H - pad.b}
            stroke={C.amber} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x={dividerX} y={pad.t - 4} fontSize="10" fill={C.amber} textAnchor="middle"
            fontWeight="700" fontFamily="Inter">Today →</text>

      <polyline points={histLine} fill="none" stroke={C.navy} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" />

      <polyline points={fcLineCoords} fill="none" stroke={C.teal} strokeWidth="2.4"
                strokeLinejoin="round" strokeLinecap="round" />

      {fcPts.map((p, i) => (
        <circle key={i} cx={X(fcStartIdx + i)} cy={Y(p.value)} r="3.4"
                fill="#fff" stroke={C.teal} strokeWidth="2" />
      ))}

      {labelIdxs.map((i) => (
        <text key={i} x={X(i)} y={H - 10} fontSize="10" fill="#94a3b8" textAnchor="middle"
              fontFamily="JetBrains Mono">{fmtLabel(all[i].date)}</text>
      ))}
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Day-by-day breakdown
// ----------------------------------------------------------------------------
const LABEL_COLOR = { quiet: C.teal, typical: '#64748b', busy: C.amber, surge: C.red };

function DayBreakdown({ forecast }) {
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
      {forecast.map((d) => {
        const dt = new Date(d.date);
        const dayLabel = `${DOW_SHORT[dt.getDay()]} · ${MONTH_SHORT[dt.getMonth()]} ${dt.getDate()}`;
        const color = LABEL_COLOR[d.label] || '#64748b';
        return (
          <div key={d.date} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '10px 14px',
            background: '#fff', border: '1px solid #e9ecf1', borderRadius: 10,
          }}>
            <div style={{ width: 110, fontSize: 12, fontWeight: 600, color: C.ink }}>{dayLabel}</div>
            <div style={{ width: 70, fontSize: 19, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(d.predicted)}
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: 'JetBrains Mono' }}>
              ({Math.round(d.lower)}–{Math.round(d.upper)})
            </div>
            <div style={{ flex: 1 }} />
            {d.label && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                padding: '4px 10px', borderRadius: 999,
                background: `${color}15`, color,
              }}>{d.label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main page
// ----------------------------------------------------------------------------
export default function Forecast({ onNavigate }) {
  const [model,   setModel]   = useState('statistical');
  const [horizon, setHorizon] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [result,  setResult]  = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.forecast.run({ model, horizon });
      setResult(res);
    } catch (e) {
      let msg = e?.message || 'Forecast failed.';
      if (msg.includes('g1_not_merged') || msg.toLowerCase().includes('not merged')) {
        msg = 'G1 (Daily demand) is not merged. Go to the Prepare page and merge it before forecasting.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: '-0.3px' }}>
          Forecast patient demand
        </h1>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Pick a model, pick a horizon, click Predict. The system handles the rest.
        </div>
      </div>

      {/* Model picker */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.muted,
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
        }}>How should we forecast?</div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
        }}>
          {MODELS.map((m) => {
            const selected = model === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  background: '#fff',
                  border: `2px solid ${selected ? m.color : '#e9ecf1'}`,
                  borderRadius: 12, padding: '18px 20px',
                  position: 'relative', overflow: 'hidden',
                  boxShadow: selected ? `0 6px 18px ${m.color}25` : '0 1px 2px rgba(15,23,41,0.04)',
                  transition: 'all .16s',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  position: 'absolute', top: 18, right: 18,
                  width: 18, height: 18, borderRadius: '50%',
                  border: `2px solid ${selected ? m.color : '#cbd5e1'}`,
                  background: selected ? m.color : 'transparent',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                }}>{selected ? '✓' : ''}</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{m.icon}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{m.title}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, fontFamily: 'JetBrains Mono' }}>{m.family}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#334155', marginTop: 10, lineHeight: 1.5 }}>
                  {m.description}
                </div>
                <ul style={{ margin: '12px 0 0 0', padding: 0, listStyle: 'none',
                             display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {m.strengths.map((s) => (
                    <li key={s} style={{ fontSize: 11.5, color: C.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: m.color }} />
                      {s}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </div>

      {/* Horizon */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.muted,
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
        }}>How far ahead?</div>
        <div style={{
          display: 'inline-flex', gap: 4, background: '#f1f4f7',
          borderRadius: 10, padding: 4,
        }}>
          {HORIZONS.map((h) => {
            const selected = horizon === h.value;
            return (
              <button key={h.value} onClick={() => setHorizon(h.value)}
                style={{
                  border: 0, cursor: 'pointer', fontFamily: 'inherit',
                  padding: '10px 22px', borderRadius: 7,
                  background: selected ? C.teal : 'transparent',
                  color: selected ? '#fff' : C.muted,
                  fontSize: 13, fontWeight: 700,
                  display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center',
                }}>
                <span>{h.label}</span>
                <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>{h.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Run button */}
      <div>
        <button onClick={run} disabled={loading}
          style={{
            cursor: loading ? 'wait' : 'pointer',
            background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`,
            color: '#fff', border: 0,
            padding: '14px 26px', borderRadius: 10,
            fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
            boxShadow: '0 8px 22px rgba(13,148,136,0.35)',
            display: 'inline-flex', alignItems: 'center', gap: 10,
            opacity: loading ? 0.7 : 1, transition: 'opacity .16s',
          }}>
          {loading
            ? <><span className="fc-spinner" />Predicting…</>
            : <>▶ {result ? 'Re-run forecast' : 'Run forecast'}</>}
        </button>
        <style>{`@keyframes fc-spin { to { transform: rotate(360deg); } }
          .fc-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.4);
            border-top-color: #fff; border-radius: 50%; display: inline-block;
            animation: fc-spin .8s linear infinite; }`}
        </style>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#fef5f5', border: '1px solid #fecaca', borderRadius: 10,
          padding: '14px 16px', color: '#991b1b', fontSize: 13.5, lineHeight: 1.5,
        }}>
          <strong style={{ color: '#7f1d1d' }}>Can't run the forecast.</strong>{' '}
          {error}
          {onNavigate && error.toLowerCase().includes('prepare') && (
            <button onClick={() => onNavigate('prepare')}
              style={{
                marginLeft: 12, padding: '6px 14px', border: '1px solid #7f1d1d',
                background: 'transparent', color: '#7f1d1d', borderRadius: 7,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>Go to Prepare →</button>
          )}
        </div>
      )}

      {/* Results */}
      {result && <Results result={result} />}
    </div>
  );
}

function Results({ result }) {
  const forecast = result.forecast || [];
  if (forecast.length === 0) return null;

  const avg   = forecast.reduce((s, d) => s + d.predicted, 0) / forecast.length;
  const total = forecast.reduce((s, d) => s + d.predicted, 0);
  const peak  = [...forecast].sort((a, b) => b.predicted - a.predicted)[0];
  const quiet = [...forecast].sort((a, b) => a.predicted - b.predicted)[0];

  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayName = (iso) => {
    const dt = new Date(iso);
    return `${DOW_SHORT[dt.getDay()]} ${MONTH_SHORT[dt.getMonth()]} ${dt.getDate()}`;
  };

  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: '1px solid #e9ecf1', paddingTop: 18,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>Forecast results</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            {result.model_used} · {result.horizon}-day horizon
            {result.history_window_days && ` · trained on ${result.history_window_days} days`}
            {result.mape != null && ` · ~${result.mape.toFixed(1)}% historical error`}
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12,
      }}>
        <KPI label="AVERAGE / DAY" value={Math.round(avg)} sub="patients expected" color={C.teal} />
        <KPI label="TOTAL EXPECTED" value={Math.round(total).toLocaleString()} sub={`${forecast.length} days ahead`} color={C.navy} />
        <KPI label="BUSIEST DAY" value={dayName(peak.date)} sub={`${Math.round(peak.predicted)} patients · plan capacity`} color={C.red} />
        <KPI label="QUIETEST DAY" value={dayName(quiet.date)} sub={`${Math.round(quiet.predicted)} patients`} color={C.amber} />
      </div>

      <div style={{
        background: '#fff', border: '1px solid #e9ecf1', borderRadius: 12,
        padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
              Recent history and predicted arrivals
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              The shaded teal band shows the 95% confidence range.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#475569' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i style={{ width: 14, height: 2, background: C.navy, display: 'inline-block' }} /> Recent history
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i style={{ width: 14, height: 2, background: C.teal, display: 'inline-block' }} /> Forecast
            </span>
          </div>
        </div>
        <ForecastChart history={result.history || []} forecast={forecast} />
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
          Day-by-day breakdown
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
          Predicted patients · uncertainty range · expected load.
        </div>
        <DayBreakdown forecast={forecast} />
      </div>
    </div>
  );
}

function KPI({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e9ecf1', borderRadius: 12,
      padding: '16px 18px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.9 }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 800, color, marginTop: 6,
        letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5 }}>{sub}</div>
      )}
    </div>
  );
}
