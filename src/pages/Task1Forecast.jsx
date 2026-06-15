// =============================================================================
// Task 1 — Daily Total ED Arrivals
// Implements docs/DASHBOARD_SPEC.md §3.
//
// Pick a model (6 aliases with accuracy badges, sorted by val RMSE) → pick a
// horizon (1d / 7d / monthly / yearly) → start date → Run.
//
// The /api/task1/forecast endpoint is currently stubbed (returns 501 with
// `feature_pipeline_pending`) until the modeling team ships feature_builder.py.
// Until then this page renders the full UI, shows real model metrics, and
// surfaces a clear "feature pipeline pending" banner on Run.
// =============================================================================
import { useEffect, useState } from 'react';
import { api } from '../api/client';

const C = {
  ink: '#0f172a', muted: '#64748b', line: '#eef0f3',
  teal: '#0d9488', navy: '#1e6091', red: '#dc2626', amber: '#d97706', purple: '#7c3aed',
};

// Badge color tokens by badge id (operational/planning/research)
const BADGE = {
  operational: { color: '#16a34a', soft: '#dcfce7', emoji: '🟢', label: 'Operational' },
  planning:    { color: C.amber,   soft: '#fef3c7', emoji: '🟡', label: 'Planning' },
  research:    { color: C.red,     soft: '#fee2e2', emoji: '🔴', label: 'Research preview' },
};

const HORIZONS = [
  { id: '1d',      label: '1 day ahead',  sub: 'tomorrow only',     days: 1 },
  { id: '7d',      label: '7 days ahead', sub: 'day-by-day',        days: 7 },
  { id: 'monthly', label: 'Monthly',      sub: '30-day day-by-day', days: 30 },
  { id: 'yearly',  label: 'Yearly',       sub: '365-day outlook',   days: 365 },
];

// The catalogue aliases (Stat 1, ML 2, Hybrid 1 …) map onto the two live
// engines that can actually run in this venv: SARIMAX (statistical) and
// Gradient Boosting (ml). "Hybrid" leans on the statistical core.
const aliasToEngine = (alias) =>
  (alias || '').toUpperCase().startsWith('ML') ? 'ml' : 'statistical';

const horizonDays = (id) => HORIZONS.find((h) => h.id === id)?.days ?? 7;

// Weather-style colour ramp by intensity label.
const LABEL_STYLE = {
  peak: { bg: '#fee2e2', fg: '#b91c1c', dot: '#ef4444', word: 'Peak' },
  high: { bg: '#ffedd5', fg: '#c2410c', dot: '#f97316', word: 'High' },
  med:  { bg: '#fef9c3', fg: '#a16207', dot: '#eab308', word: 'Moderate' },
  low:  { bg: '#dcfce7', fg: '#15803d', dot: '#22c55e', word: 'Low' },
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH3  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return { wd: WEEKDAY[d.getDay()], dom: d.getDate(), mon: MONTH3[d.getMonth()] };
};

function Badge({ badge, size = 'sm' }) {
  const b = BADGE[badge] || { color: '#64748b', soft: '#e2e8f0', emoji: '⚪', label: badge || '—' };
  const px = size === 'lg' ? '6px 12px' : '3px 9px';
  const fs = size === 'lg' ? 13 : 11;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: px, borderRadius: 999, fontSize: fs, fontWeight: 700,
      background: b.soft, color: b.color, letterSpacing: 0.2,
    }}>
      <span style={{ fontSize: fs + 1 }}>{b.emoji}</span>
      {b.label}
    </span>
  );
}

export default function Task1Forecast({ onNavigate }) {
  const [models, setModels]   = useState(null);
  const [error,  setError]    = useState(null);
  const [alias,  setAlias]    = useState(null);
  const [horizon, setHorizon] = useState('7d');
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    api.task1.models()
      .then((res) => { if (!alive) return; setModels(res.items || []);
                       if ((res.items || []).length && !alias) setAlias(res.items[0].alias); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = models?.find((m) => m.alias === alias) || null;

  const run = async () => {
    setRunning(true); setResult(null);
    try {
      const res = await api.forecast.run({
        model: aliasToEngine(alias),
        horizon: horizonDays(horizon),
        alias,
      });
      setResult({ ok: true, data: res, horizonId: horizon });
    } catch (e) {
      setResult({
        ok: false,
        status: e.status,
        detail: e.detail,
        message: e.message,
        model_badge: e.detail?.model_badge,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.2 }}>
          Forecasting · Task 1
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, margin: '4px 0 0 0', letterSpacing: '-0.4px' }}>
          Daily Total ED Arrivals
        </h1>
        <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
          Hospital-wide capacity planning, nurse rostering by date, monthly budget allocation.
          Six pre-trained models · Steve Biko Academic Hospital, Pretoria.
        </div>
      </div>

      {error && (
        <Banner color="red" title="Couldn't load model catalogue.">
          {error}
          <div style={{ marginTop: 6, fontSize: 12, color: '#7f1d1d' }}>
            Make sure the backend is running at port 8000 and the git submodule is initialised
            (<code>git submodule update --init --recursive</code>).
          </div>
        </Banner>
      )}

      {/* Top action bar — primary "Start prediction" CTA, always visible */}
      <StartBar
        ready={!!alias && !!horizon}
        running={running}
        primaryLabel={result ? 'Re-run prediction' : 'Start prediction'}
        onRun={run}
        summary={alias
          ? `${alias} · ${HORIZONS.find((h) => h.id === horizon)?.label || horizon}`
          : 'Pick a model below, then start the prediction.'}
      />

      {/* Step 1 — Model picker */}
      <Section step="1" title="Pick a model" sub="Sorted by validation RMSE — lowest error first.">
        {!models && !error && <div style={{ color: C.muted, fontSize: 13 }}>Loading models…</div>}
        {models && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {models.map((m) => (
              <ModelRow key={m.alias} m={m} selected={alias === m.alias} onSelect={() => setAlias(m.alias)} />
            ))}
          </div>
        )}
      </Section>

      {/* Step 2 — Horizon */}
      <Section step="2" title="Forecast horizon" sub="How far ahead?">
        <div style={{ display: 'inline-flex', gap: 4, background: '#f1f4f7', borderRadius: 10, padding: 4 }}>
          {HORIZONS.map((h) => {
            const on = horizon === h.id;
            return (
              <button key={h.id} onClick={() => setHorizon(h.id)} style={{
                border: 0, cursor: 'pointer', fontFamily: 'inherit',
                padding: '10px 18px', borderRadius: 7,
                background: on ? C.teal : 'transparent',
                color: on ? '#fff' : C.muted,
                fontSize: 13, fontWeight: 700,
                display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center',
              }}>
                <span>{h.label}</span>
                <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>{h.sub}</span>
              </button>
            );
          })}
        </div>
        {horizon === 'yearly' && (
          <div style={{
            marginTop: 12, fontSize: 12, color: '#7f1d1d',
            background: '#fef3c7', border: '1px solid #fde68a', padding: '8px 12px', borderRadius: 8,
          }}>
            Yearly forecasts are aggregates — the daily-accuracy badge above applies to the underlying predictions.
          </div>
        )}
      </Section>

      {/* Step 3 — Forecast window (derived, weather-app style) */}
      <Section step="3" title="Forecast window" sub="Like a weather forecast — it begins right after your latest data.">
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10,
          padding: '10px 14px', fontSize: 13, color: '#0369a1',
        }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <span>
            The forecast starts the day after the most recent day in your data and runs{' '}
            <strong>{horizonDays(horizon)} day{horizonDays(horizon) > 1 ? 's' : ''} forward</strong>.
            Pick any day card in the results to see its detail.
          </span>
        </div>
      </Section>

      {/* Bottom run button — same action as top, second touchpoint after config */}
      <div>
        <button
          onClick={run}
          disabled={!alias || running}
          style={{
            cursor: running ? 'wait' : alias ? 'pointer' : 'not-allowed',
            background: alias ? `linear-gradient(135deg, ${C.teal}, ${C.navy})` : '#cbd5e1',
            color: '#fff', border: 0,
            padding: '14px 28px', borderRadius: 10,
            fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
            boxShadow: alias ? '0 8px 22px rgba(13,148,136,0.35)' : 'none',
            opacity: running ? 0.7 : 1,
          }}
        >
          {running ? 'Predicting…' : `▶ ${result ? 'Re-run' : 'Start'} prediction${alias ? ` — ${alias}` : ''}`}
        </button>
        {selected && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
            Will run <strong>{alias}</strong> via the live{' '}
            <strong>{aliasToEngine(alias) === 'ml' ? 'Gradient Boosting' : 'SARIMAX'}</strong> engine
            on the <strong>{HORIZONS.find((h) => h.id === horizon)?.label || horizon}</strong> horizon.
          </div>
        )}
      </div>

      {/* Result panel */}
      {result && (result.ok
        ? <ForecastResult data={result.data} horizonId={result.horizonId} badge={selected?.badge} />
        : <ForecastError result={result} onTryAnother={() => setResult(null)} onNavigate={onNavigate} />)}

      {/* About selected model */}
      {selected && <AboutPanel m={selected} />}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------
function Section({ step, title, sub, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: '#94a3b8',
          background: '#f1f4f7', padding: '3px 8px', borderRadius: 6,
        }}>STEP {step}</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>{title}</h3>
        {sub && <span style={{ fontSize: 12, color: C.muted }}>· {sub}</span>}
      </div>
      {children}
    </div>
  );
}

function ModelRow({ m, selected, onSelect }) {
  const mape = m.val_MAPE != null ? `${m.val_MAPE.toFixed(2)}%` : '—';
  const rmse = m.val_RMSE != null ? m.val_RMSE.toFixed(2) : '—';
  const family = m.card?.family || '—';
  return (
    <button
      onClick={onSelect}
      style={{
        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: '#fff',
        border: `2px solid ${selected ? C.teal : '#e9ecf1'}`,
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 14,
        boxShadow: selected ? `0 4px 14px rgba(13,148,136,.20)` : '0 1px 2px rgba(15,23,41,.03)',
        transition: 'all .12s',
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        border: `2px solid ${selected ? C.teal : '#cbd5e1'}`,
        background: selected ? C.teal : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>{selected ? '✓' : ''}</span>

      <div style={{ minWidth: 100, fontSize: 15, fontWeight: 700, color: C.ink }}>{m.alias}</div>
      <div style={{ minWidth: 80, fontSize: 12, color: C.muted, fontFamily: 'JetBrains Mono' }}>{family}</div>
      <div style={{ minWidth: 110, fontSize: 12.5, color: C.muted, fontFamily: 'JetBrains Mono' }}>
        val MAPE <strong style={{ color: C.ink }}>{mape}</strong>
      </div>
      <div style={{ minWidth: 100, fontSize: 12.5, color: C.muted, fontFamily: 'JetBrains Mono' }}>
        RMSE <strong style={{ color: C.ink }}>{rmse}</strong>
      </div>
      <div style={{ flex: 1 }} />
      <Badge badge={m.badge} />
    </button>
  );
}

function Banner({ color = 'amber', title, children }) {
  const styles = {
    red:    { bg: '#fef5f5', border: '#fecaca', fg: '#991b1b', strong: '#7f1d1d' },
    amber:  { bg: '#fef3c7', border: '#fde68a', fg: '#7f1d1d', strong: '#78350f' },
    teal:   { bg: '#ecfdf5', border: '#a7f3d0', fg: '#065f46', strong: '#064e3b' },
  }[color] || {};
  return (
    <div style={{
      background: styles.bg, border: `1px solid ${styles.border}`, borderRadius: 10,
      padding: '14px 16px', color: styles.fg, fontSize: 13.5, lineHeight: 1.55,
    }}>
      <strong style={{ color: styles.strong }}>{title}</strong>{' '}
      {children}
    </div>
  );
}

function ForecastResult({ data, horizonId, badge }) {
  const days = data.forecast || [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  if (!days.length) {
    return <Banner color="amber" title="No forecast returned.">The engine ran but produced no days.</Banner>;
  }

  const engineLabel = data.requested_model === 'ml' ? 'Gradient Boosting (live)' : 'SARIMAX (live)';
  const alias = data.requested_alias || data.model_used;
  const confidence = data.confidence_pct;
  const total = days.reduce((s, d) => s + d.predicted, 0);
  const avg = total / days.length;
  const busiest = days.reduce((a, b) => (b.predicted > a.predicted ? b : a), days[0]);
  const quietest = days.reduce((a, b) => (b.predicted < a.predicted ? b : a), days[0]);
  const isYearly = horizonId === 'yearly' || days.length > 31;
  const sel = days[Math.min(selectedIdx, days.length - 1)];

  return (
    <div style={{
      background: 'linear-gradient(180deg,#f8fbff 0%,#ffffff 60%)',
      border: `2px solid ${C.teal}`, borderRadius: 16, padding: '22px 24px',
      boxShadow: '0 10px 30px rgba(13,148,136,0.10)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: 1.2 }}>
            Patient arrivals forecast
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginTop: 4, letterSpacing: '-0.4px' }}>
            {alias} · {HORIZONS.find((h) => h.id === horizonId)?.label || `${days.length} days`}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {days.length} day{days.length > 1 ? 's' : ''} from {fmtDay(days[0].date).mon} {fmtDay(days[0].date).dom}
            {' · '}engine: <strong style={{ color: '#334155' }}>{engineLabel}</strong>
            {data.last_actual_date && <> · latest data {data.last_actual_date}</>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {badge && <Badge badge={badge} size="lg" />}
          {confidence != null && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Model confidence</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: confidence >= 75 ? '#15803d' : confidence >= 55 ? '#a16207' : '#b91c1c' }}>
                ~{Math.round(confidence)}%
              </div>
              <div style={{ fontSize: 10.5, color: C.muted }}>
                {data.confidence_basis === 'interval'
                  ? 'based on interval width'
                  : `validation accuracy · MAPE ${data.mape}%`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hero — the selected / first day, big like a weather "today" tile */}
      <HeroDay day={sel} />

      {/* Day strip (weather-style cards) or yearly summary */}
      {isYearly ? (
        <YearlySummary days={days} total={total} avg={avg} busiest={busiest} quietest={quietest} />
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, margin: '18px 0 8px' }}>
            Tap a day for detail
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(96px, 1fr))`,
            gap: 8,
          }}>
            {days.map((d, i) => (
              <DayCard key={d.date} day={d} active={i === selectedIdx} onClick={() => setSelectedIdx(i)} />
            ))}
          </div>
        </>
      )}

      {/* Footer summary stats */}
      <div style={{
        marginTop: 18, paddingTop: 16, borderTop: '1px solid #e9ecf1',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10,
      }}>
        <Stat label="Total over window" val={Math.round(total).toLocaleString()} />
        <Stat label="Average / day"     val={Math.round(avg).toLocaleString()} />
        <Stat label="Busiest day"       val={`${Math.round(busiest.predicted)} · ${fmtDay(busiest.date).mon} ${fmtDay(busiest.date).dom}`} />
        <Stat label="Quietest day"      val={`${Math.round(quietest.predicted)} · ${fmtDay(quietest.date).mon} ${fmtDay(quietest.date).dom}`} />
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
        Forecast generated live from {data.history_window_days?.toLocaleString()} days of real Steve Biko arrivals.
        Shaded range is the 95% confidence interval (±). Validation error (MAPE) {data.mape}% ·
        the catalogue model <strong>{alias}</strong> maps onto the live <strong>{engineLabel}</strong> engine
        until the pre-trained research bundles are wired in.
      </div>
    </div>
  );
}

function HeroDay({ day }) {
  const s = LABEL_STYLE[day.label] || LABEL_STYLE.med;
  const f = fmtDay(day.date);
  return (
    <div style={{
      marginTop: 18, borderRadius: 14, padding: '20px 22px',
      background: `linear-gradient(120deg, ${s.bg} 0%, #ffffff 130%)`,
      border: `1px solid ${s.dot}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: s.fg }}>{f.wd}, {f.mon} {f.dom}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
          background: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: s.fg }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot }} /> {s.word} demand
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, fontWeight: 800, color: C.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(day.predicted)}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>expected patients</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Confidence range</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#334155', marginTop: 4 }}>
          {Math.round(day.lower)} – {Math.round(day.upper)}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          ± {Math.round((day.upper - day.lower) / 2)} patients
        </div>
      </div>
    </div>
  );
}

function DayCard({ day, active, onClick }) {
  const s = LABEL_STYLE[day.label] || LABEL_STYLE.med;
  const f = fmtDay(day.date);
  return (
    <button onClick={onClick} style={{
      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
      background: active ? s.bg : '#fff',
      border: `2px solid ${active ? s.dot : '#e9ecf1'}`,
      borderRadius: 12, padding: '10px 6px 9px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      transition: 'all .12s',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: s.fg }}>{f.wd}</div>
      <div style={{ fontSize: 10.5, color: C.muted }}>{f.mon} {f.dom}</div>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.dot, margin: '2px 0' }} />
      <div style={{ fontSize: 21, fontWeight: 800, color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {Math.round(day.predicted)}
      </div>
      <div style={{ fontSize: 10, color: C.muted }}>{Math.round(day.lower)}–{Math.round(day.upper)}</div>
    </button>
  );
}

function YearlySummary({ days, total, avg, busiest, quietest }) {
  // Roll the 365 daily predictions up into calendar-month subtotals.
  const months = {};
  for (const d of days) {
    const f = fmtDay(d.date);
    const key = `${f.mon}`;
    months[key] = months[key] || { mon: f.mon, sum: 0, n: 0 };
    months[key].sum += d.predicted;
    months[key].n += 1;
  }
  const rows = Object.values(months);
  const maxSum = Math.max(...rows.map((r) => r.sum), 1);
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
        Monthly outlook (predicted patient-days)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => (
          <div key={r.mon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, fontSize: 12, fontWeight: 700, color: C.ink }}>{r.mon}</div>
            <div style={{ flex: 1, background: '#eef2f7', borderRadius: 6, height: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                width: `${(r.sum / maxSum) * 100}%`, height: '100%',
                background: `linear-gradient(90deg, ${C.teal}, ${C.navy})`, borderRadius: 6,
              }} />
            </div>
            <div style={{ width: 70, textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(r.sum).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ForecastError({ result, onTryAnother, onNavigate }) {
  const errCode = result?.detail?.error;
  const needsData = errCode === 'g1_not_merged' || result?.status === 409;
  const isPending = errCode === 'feature_pipeline_pending'
                 || (result?.message || '').includes('feature_pipeline_pending')
                 || result?.status === 501;

  if (needsData) {
    return (
      <div style={{
        background: '#fff', border: '1px solid #bae6fd', borderLeft: `4px solid ${C.navy}`,
        borderRadius: 10, padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>🧱</span>
          <strong style={{ fontSize: 15, color: C.ink }}>One quick step first — build your dataset</strong>
        </div>
        <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
          The forecast reads from <strong>G1 · Daily demand</strong> (your arrivals + calendar + weather, merged).
          It isn't built yet in this session. Open <strong>Prepare</strong>, build the <strong>G1</strong> group,
          then come back and press Start prediction.
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <button onClick={() => onNavigate?.('prepare')} style={{
            background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: '#fff', border: 0,
            borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          }}>Go to Prepare →</button>
          <button onClick={onTryAnother} style={{
            background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8,
            padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          }}>Dismiss</button>
        </div>
      </div>
    );
  }

  const title = isPending
    ? 'Feature pipeline integration pending'
    : 'Forecast temporarily unavailable';
  const text = result?.detail?.message || result?.message || 'Unknown error.';
  return (
    <div style={{
      background: '#fff', border: `1px solid ${isPending ? '#fde68a' : '#fecaca'}`,
      borderLeft: `4px solid ${isPending ? C.amber : C.red}`,
      borderRadius: 10, padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{isPending ? '⏳' : '⚠️'}</span>
        <strong style={{ fontSize: 14, color: C.ink }}>{title}</strong>
        {result?.model_badge && <Badge badge={result.model_badge} />}
      </div>
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{text}</div>
      {isPending && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
          The 6 pre-trained models, their accuracy badges, and per-horizon metrics are already wired and live above.
          The actual run will go live once <code>feature_builder.py</code> from the modeling team is integrated —
          tracking in <code>msc-modelling</code>.
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <button onClick={onTryAnother} style={{
          background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8,
          padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        }}>Try another model</button>
      </div>
    </div>
  );
}

function AboutPanel({ m }) {
  const card = m.card || {};
  return (
    <div style={{
      background: '#fafbfc', border: '1px solid #e9ecf1', borderRadius: 12,
      padding: '18px 22px', marginTop: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
            About this model
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 4 }}>
            {m.alias} <span style={{ color: C.muted, fontSize: 13, fontWeight: 500 }}>· {card.family}</span>
          </div>
        </div>
        <Badge badge={m.badge} size="lg" />
      </div>

      <div style={{ marginTop: 14, fontSize: 13.5, color: '#334155', lineHeight: 1.6 }}>
        {card.description}
      </div>

      <div style={{
        marginTop: 14, display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10,
      }}>
        <Stat label="Validation MAPE"      val={card.performance?.val_MAPE != null ? `${card.performance.val_MAPE.toFixed(2)}%` : '—'} />
        <Stat label="Validation RMSE"      val={card.performance?.val_RMSE != null ? card.performance.val_RMSE.toFixed(2)         : '—'} />
        <Stat label="Weekly avg % error"   val={card.performance?.weekly_avg_pct_error  != null ? card.performance.weekly_avg_pct_error.toFixed(2)  + '%' : '—'} />
        <Stat label="Monthly avg % error"  val={card.performance?.monthly_avg_pct_error != null ? card.performance.monthly_avg_pct_error.toFixed(2) + '%' : '—'} />
        <Stat label="Yearly avg % error"   val={card.performance?.yearly_avg_pct_error  != null ? card.performance.yearly_avg_pct_error.toFixed(2)  + '%' : '—'} />
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
        Training window: {card.training_window || '—'} ·
        Last trained: {card.last_trained_utc ? new Date(card.last_trained_utc).toLocaleDateString() : '—'}
      </div>
    </div>
  );
}

function StartBar({ ready, running, primaryLabel, onRun, summary }) {
  return (
    <div style={{
      background: ready
        ? `linear-gradient(120deg, #0f1f33 0%, #0c2f3a 70%, #0d9488 200%)`
        : '#f1f4f7',
      color: ready ? '#e6f6f4' : C.muted,
      borderRadius: 14, padding: '18px 22px',
      display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      boxShadow: ready ? '0 12px 32px rgba(8,30,40,0.25)' : 'none',
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: ready ? '#5eead4' : '#94a3b8',
          textTransform: 'uppercase', letterSpacing: 1.4,
        }}>
          Ready when you are
        </div>
        <div style={{
          fontSize: 14, fontWeight: 600,
          color: ready ? '#e6f6f4' : C.muted,
          marginTop: 4, lineHeight: 1.5,
        }}>{summary}</div>
      </div>
      <button
        onClick={onRun}
        disabled={!ready || running}
        style={{
          cursor: running ? 'wait' : ready ? 'pointer' : 'not-allowed',
          background: ready
            ? 'linear-gradient(135deg, #5eead4, #0d9488)'
            : '#cbd5e1',
          color: ready ? '#06231f' : '#fff',
          border: 0,
          padding: '15px 30px', borderRadius: 12,
          fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          boxShadow: ready ? '0 8px 24px rgba(13,148,136,0.45)' : 'none',
          opacity: running ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}>
        {running ? '⏳ Predicting…' : `▶ ${primaryLabel}`}
      </button>
    </div>
  );
}

function Stat({ label, val }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e9ecf1', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
        {val}
      </div>
    </div>
  );
}
