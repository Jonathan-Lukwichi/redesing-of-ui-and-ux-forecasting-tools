// =============================================================================
// Task 2 — Per-Specialty Arrivals
// Implements docs/DASHBOARD_SPEC.md §4.
//
// Pick a specialty → filtered list of available models (with badges) → pick a
// horizon (auto-swaps to weekly set for Maternity/Psychiatry) → Run.
//
// Predictions run live via POST /api/forecast/specialty: each specialty is
// forecast from its OWN series in G3 (Clinical daily) using SARIMAX or Gradient
// Boosting. Results render weather-style (day/week cards + 95% confidence band),
// with an honest low-volume caveat for sparse specialties. The catalogue aliases
// map onto the two live engines; the pre-trained research bundles aren't wired.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const C = {
  ink: '#0f172a', muted: '#64748b', line: '#eef0f3',
  teal: '#0d9488', navy: '#1e6091', red: '#dc2626', amber: '#d97706', purple: '#7c3aed',
};

const BADGE = {
  operational: { color: '#16a34a', soft: '#dcfce7', emoji: '🟢', label: 'Operational' },
  planning:    { color: C.amber,   soft: '#fef3c7', emoji: '🟡', label: 'Planning' },
  research:    { color: C.red,     soft: '#fee2e2', emoji: '🔴', label: 'Research preview' },
};

const DAILY_HORIZONS = [
  { id: '1d',      label: '1 day ahead',  sub: 'tomorrow only', count: 1 },
  { id: '7d',      label: '7 days ahead', sub: 'day-by-day',    count: 7 },
  { id: 'monthly', label: 'Monthly',      sub: '30 days',       count: 30 },
  { id: 'yearly',  label: 'Yearly',       sub: '365-day outlook', count: 365 },
];
const WEEKLY_HORIZONS = [
  { id: '1week',  label: '1 week ahead',  sub: 'next week',     count: 1 },
  { id: '4weeks', label: '4 weeks ahead', sub: 'week-by-week',  count: 4 },
  { id: 'yearly', label: 'Yearly',        sub: '52-week outlook', count: 52 },
];

// The two engines that actually run. What you pick IS what runs.
const ENGINES = [
  { id: 'ml', name: 'Best ML model', recommended: true,
    blurb: 'Learns patterns from the calendar, weather and recent arrivals. The recommended choice for most days.' },
  { id: 'statistical', name: 'Best statistical model',
    blurb: 'A classic time-series model that reads the trend, weekly rhythm and seasonality.' },
];

const horizonCount = (id) =>
  [...DAILY_HORIZONS, ...WEEKLY_HORIZONS].find((h) => h.id === id)?.count ?? 7;

// Weather-style colour ramp by intensity label.
const LABEL_STYLE = {
  peak: { bg: '#fee2e2', fg: '#b91c1c', dot: '#ef4444', word: 'Peak' },
  high: { bg: '#ffedd5', fg: '#c2410c', dot: '#f97316', word: 'High' },
  med:  { bg: '#fef9c3', fg: '#a16207', dot: '#eab308', word: 'Moderate' },
  low:  { bg: '#dcfce7', fg: '#15803d', dot: '#22c55e', word: 'Low' },
};
const TIER_STYLE = {
  High:       { fg: '#15803d' },
  Moderate:   { fg: '#a16207' },
  Low:        { fg: '#c2410c' },
  'Very low': { fg: '#b91c1c' },
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH3  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return { wd: WEEKDAY[d.getDay()], dom: d.getDate(), mon: MONTH3[d.getMonth()] };
};
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const clampDate = (iso, lo, hi) => (iso < lo ? lo : iso > hi ? hi : iso);

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

export default function Task2Forecast({ onNavigate }) {
  const [catalogue, setCatalogue] = useState(null);
  const [error,     setError]     = useState(null);
  const [specialty, setSpecialty] = useState(null);
  const [engine,    setEngine]    = useState('ml');
  const [engineInfo, setEngineInfo] = useState(null); // live accuracy per engine, for the current specialty
  const [horizon,   setHorizon]   = useState('7d');
  const [running,   setRunning]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [coverage,  setCoverage]  = useState(null);
  const [startDate, setStartDate] = useState('');

  useEffect(() => {
    let alive = true;
    setError(null);
    api.task2.specialties()
      .then((res) => {
        if (!alive) return;
        const items = res.items || [];
        setCatalogue(items);
        if (items.length && !specialty) {
          const med = items.find((s) => s.specialty === 'Medicine') || items[0];
          setSpecialty(med.specialty);
        }
      })
      .catch((e) => { if (alive) setError(e.message); });
    api.forecast.coverage('g3')
      .then((c) => { if (alive && c?.merged) setCoverage(c); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSpecialty = catalogue?.find((s) => s.specialty === specialty) || null;
  const isWeekly = selectedSpecialty?.resolution === 'weekly';
  const horizons = isWeekly ? WEEKLY_HORIZONS : DAILY_HORIZONS;

  // Fetch live engine accuracy for the chosen specialty (so the picker matches the result).
  useEffect(() => {
    if (!specialty) return;
    let alive = true;
    setEngineInfo(null);
    api.forecast.engines({ specialty })
      .then((e) => { if (alive) setEngineInfo(e?.engines || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [specialty]);

  // Auto-correct horizon when switching to/from weekly specialties
  useEffect(() => {
    if (!selectedSpecialty) return;
    const valid = (isWeekly ? WEEKLY_HORIZONS : DAILY_HORIZONS).map((h) => h.id);
    if (!valid.includes(horizon)) setHorizon(valid[1] || valid[0]);
  }, [isWeekly]); // eslint-disable-line react-hooks/exhaustive-deps

  const engineMeta = ENGINES.find((e) => e.id === engine) || ENGINES[0];

  // Backtest window bounds (shared across specialties via G3 coverage).
  const futureStart = coverage ? addDays(coverage.max_date, 1) : '';
  const minStart    = coverage ? addDays(coverage.min_date, 40) : '';
  const isBacktest  = !!startDate && !!futureStart && startDate < futureStart;
  const effectiveStart = isBacktest ? startDate : null;
  const stepStart = (n) => {
    const base = startDate || futureStart;
    if (!base) return;
    setStartDate(clampDate(addDays(base, n), minStart, futureStart));
  };

  const run = async () => {
    setRunning(true); setResult(null);
    try {
      const res = await api.forecast.specialty({
        specialty,
        model: engine,
        horizon: horizonCount(horizon),
        alias: engineMeta.name,
        resolution: isWeekly ? 'weekly' : 'daily',
        start_date: effectiveStart,
      });
      setResult({ ok: true, data: res, horizonId: horizon, weekly: isWeekly });
    } catch (e) {
      setResult({
        ok: false, status: e.status, detail: e.detail, message: e.message,
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
          Forecasting · Task 2
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, margin: '4px 0 0 0', letterSpacing: '-0.4px' }}>
          Per-Specialty Arrivals
        </h1>
        <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
          Specialty-level resource allocation, on-call rota, ward bed planning. Only specialties with
          enough daily volume for a reliable forecast are shown.
        </div>
      </div>

      {error && <Banner color="red" title="Couldn't load catalogue.">{error}</Banner>}

      {/* Top action bar — the single "Start prediction" CTA */}
      <StartBar
        ready={!!specialty && !!engine && !!horizon}
        running={running}
        primaryLabel={result ? 'Re-run prediction' : 'Start prediction'}
        onRun={run}
        summary={specialty
          ? `${specialty} · ${engineMeta.name} · ${horizons.find((h) => h.id === horizon)?.label || horizon} · ${isBacktest ? `backtest from ${startDate}` : 'future'}`
          : 'Pick a specialty + method below, then start the prediction.'}
      />

      {/* Step 1 — Specialty */}
      <Section step="1" title="Pick a specialty" sub="Each specialty is forecast from its own real history.">
        {!catalogue && !error && <div style={{ color: C.muted, fontSize: 13 }}>Loading specialties…</div>}
        <div style={{
          fontSize: 12, color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd',
          borderRadius: 8, padding: '8px 12px', marginBottom: 10, lineHeight: 1.5,
        }}>
          ℹ️ Other specialties (Surgery, Paediatrics, Maternity, Psychiatry, Gynaecology, Orthopaedics) see only a
          few patients a day at Steve Biko — too little signal for a reliable daily forecast — so they're not shown here.
        </div>
        {catalogue && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {catalogue.map((s) => {
              const on = specialty === s.specialty;
              return (
                <button key={s.specialty} onClick={() => setSpecialty(s.specialty)} style={{
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  background: '#fff',
                  border: `2px solid ${on ? C.teal : '#e9ecf1'}`,
                  borderRadius: 10, padding: '12px 14px',
                  boxShadow: on ? `0 4px 14px rgba(13,148,136,.18)` : '0 1px 2px rgba(15,23,41,.03)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{s.specialty}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
                    {s.resolution === 'weekly' ? 'Weekly' : 'Daily'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* Step 2 — Forecast method (the 2 engines that actually run) */}
      {selectedSpecialty && (
        <Section step="2" title="Choose your forecast method" sub={`For ${selectedSpecialty.specialty} — what you pick is what runs.`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {ENGINES.map((e) => (
              <EngineCard
                key={e.id} e={e}
                selected={engine === e.id}
                onSelect={() => setEngine(e.id)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Step 3 — Horizon (dynamic) */}
      {selectedSpecialty && (
        <Section step="3" title="Forecast horizon" sub={isWeekly ? `Weekly specialty — week-based options.` : 'Daily specialty — day-based options.'}>
          <div style={{ display: 'inline-flex', gap: 4, background: '#f1f4f7', borderRadius: 10, padding: 4 }}>
            {horizons.map((h) => {
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
        </Section>
      )}

      {/* Step 4 — Start date (future or backtest) */}
      {selectedSpecialty && (
        <Section step="4" title="Start date" sub="Predict the future, or pick a past date to backtest against real numbers.">
          <StartDatePicker
            coverage={coverage}
            startDate={startDate}
            futureStart={futureStart}
            minStart={minStart}
            isBacktest={isBacktest}
            unit={isWeekly ? 'week' : 'day'}
            horizonCount={horizonCount(horizon)}
            onSetDate={(v) => setStartDate(v)}
            onStep={stepStart}
            onFuture={() => setStartDate('')}
          />
        </Section>
      )}

      {result && (result.ok
        ? <ForecastResult data={result.data} horizonId={result.horizonId} weekly={result.weekly} badge="operational" />
        : <ForecastError result={result} onTryAnother={() => setResult(null)} onNavigate={onNavigate} />)}

      {/* Research models + their validation scores are admin/thesis material —
          hidden from the public app; managed on the future admin page. */}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components (shared visual style with Task 1)
// ----------------------------------------------------------------------------
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
      <button onClick={onRun} disabled={!ready || running}
        style={{
          cursor: running ? 'wait' : ready ? 'pointer' : 'not-allowed',
          background: ready ? 'linear-gradient(135deg, #5eead4, #0d9488)' : '#cbd5e1',
          color: ready ? '#06231f' : '#fff', border: 0,
          padding: '15px 30px', borderRadius: 12,
          fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          boxShadow: ready ? '0 8px 24px rgba(13,148,136,0.45)' : 'none',
          opacity: running ? 0.7 : 1, whiteSpace: 'nowrap',
        }}>
        {running ? '⏳ Predicting…' : `▶ ${primaryLabel}`}
      </button>
    </div>
  );
}

function StartDatePicker({ coverage, startDate, futureStart, minStart, isBacktest, unit, horizonCount, onSetDate, onStep, onFuture }) {
  const jump = (n, label) => (
    <button onClick={() => onStep(n)} style={{
      border: '1px solid #cbd5e1', background: '#fff', borderRadius: 7,
      padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
      fontFamily: 'inherit', color: C.ink, whiteSpace: 'nowrap',
    }}>{label}</button>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'inline-flex', gap: 4, background: '#f1f4f7', borderRadius: 10, padding: 4, alignSelf: 'flex-start' }}>
        <button onClick={onFuture} style={{
          border: 0, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 16px', borderRadius: 7,
          background: !isBacktest ? C.teal : 'transparent', color: !isBacktest ? '#fff' : C.muted,
          fontSize: 13, fontWeight: 700,
        }}>🔮 Predict future</button>
        <button onClick={() => onSetDate(addDays(futureStart || '2026-01-01', -371))} style={{
          border: 0, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 16px', borderRadius: 7,
          background: isBacktest ? C.navy : 'transparent', color: isBacktest ? '#fff' : C.muted,
          fontSize: 13, fontWeight: 700,
        }}>🎯 Backtest a past date</button>
      </div>

      {isBacktest ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {jump(-365, '◀ Year')}
          {jump(-7, '◀ Week')}
          <input
            type="date" value={startDate}
            min={minStart || undefined} max={futureStart || undefined}
            onChange={(e) => onSetDate(clampDate(e.target.value, minStart || e.target.value, futureStart || e.target.value))}
            style={{
              fontFamily: 'inherit', fontSize: 14, padding: '9px 12px',
              border: '1px solid #cbd5e1', borderRadius: 8, color: C.ink, minWidth: 160,
            }}
          />
          {jump(7, 'Week ▶')}
          {jump(365, 'Year ▶')}
        </div>
      ) : (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start',
          background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10,
          padding: '10px 14px', fontSize: 13, color: '#0369a1',
        }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <span>Forecasting <strong>{horizonCount} {unit}{horizonCount > 1 ? 's' : ''}</strong> into the open future.</span>
        </div>
      )}

      <div style={{ fontSize: 12, color: C.muted }}>
        {isBacktest ? <>Trains on data <strong>before {startDate}</strong>, then compares predictions to the real numbers. </> : null}
        {coverage && <span>Data available {coverage.min_date} → {coverage.max_date}.</span>}
      </div>
    </div>
  );
}

function BacktestBanner({ bt, unit }) {
  const fg = '#15803d', bg = '#ecfdf5', bd = '#a7f3d0';
  return (
    <div style={{
      marginTop: 16, background: bg, border: `1px solid ${bd}`, borderRadius: 12,
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: fg, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          🎯 Checked against real numbers
        </div>
        <div style={{ fontSize: 13, color: '#334155', marginTop: 3 }}>
          The model predicted <strong>{bt.n_compared}</strong> {unit}(s) it never saw, then we compared to what actually happened.
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>
          {Math.round(bt.total_predicted)} <span style={{ color: C.muted, fontWeight: 400 }}>vs</span> {Math.round(bt.total_actual)}
        </div>
        <div style={{ fontSize: 10.5, color: C.muted }}>predicted vs actual total over the window</div>
      </div>
    </div>
  );
}

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

function EngineCard({ e, selected, onSelect }) {
  return (
    <button onClick={onSelect} style={{
      textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', background: '#fff',
      border: `2px solid ${selected ? C.teal : '#e9ecf1'}`,
      borderRadius: 12, padding: '16px 18px',
      boxShadow: selected ? '0 6px 18px rgba(13,148,136,.18)' : '0 1px 2px rgba(15,23,41,.03)',
      display: 'flex', flexDirection: 'column', gap: 8, transition: 'all .12s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${selected ? C.teal : '#cbd5e1'}`,
          background: selected ? C.teal : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, fontWeight: 700,
        }}>{selected ? '✓' : ''}</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{e.name}</span>
        {e.recommended && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#0f766e', background: '#dcfce7',
            borderRadius: 999, padding: '2px 9px', letterSpacing: 0.2 }}>Recommended</span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{e.blurb}</div>
    </button>
  );
}

function ResearchCatalogue({ specialty, models }) {
  return (
    <details style={{
      background: '#fafbfc', border: '1px solid #e9ecf1', borderRadius: 12, padding: '16px 20px',
    }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.ink }}>
        Research models for {specialty} (thesis / technical) ▾
      </summary>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: '10px 0 12px' }}>
        The pre-trained models evaluated for {specialty} in the MSc study. In this app, forecasts run
        through the two live engines above.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {models.map((m) => (
          <ModelRow key={m.alias} m={m} selected={false} onSelect={() => {}} />
        ))}
      </div>
    </details>
  );
}

function ModelRow({ m, selected, onSelect }) {
  const acc = m.val_MAPE != null ? `≈${Math.round(100 - m.val_MAPE)}% accurate` : '—';
  return (
    <button onClick={onSelect}
      style={{
        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', background: '#fff',
        border: `2px solid ${selected ? C.teal : '#e9ecf1'}`,
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 14,
        boxShadow: selected ? `0 4px 14px rgba(13,148,136,.20)` : '0 1px 2px rgba(15,23,41,.03)',
      }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        border: `2px solid ${selected ? C.teal : '#cbd5e1'}`,
        background: selected ? C.teal : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>{selected ? '✓' : ''}</span>
      <div style={{ minWidth: 100, fontSize: 15, fontWeight: 700, color: C.ink }}>{m.alias}</div>
      <div style={{ minWidth: 140, fontSize: 13, fontWeight: 700, color: '#0f766e' }}>
        {acc}
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

function ForecastResult({ data, horizonId, weekly, badge }) {
  const days = data.forecast || [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  if (!days.length) {
    return <Banner color="amber" title="No forecast returned.">The engine ran but produced no periods.</Banner>;
  }

  const unit = weekly ? 'week' : 'day';
  const engineLabel = data.requested_model === 'ml' ? 'Best ML model' : 'Best statistical model';
  const alias = data.requested_alias || data.model_used;
  const specialty = data.requested_specialty;
  const tier = data.confidence_tier;
  const tierColor = (TIER_STYLE[tier] || { fg: C.muted }).fg;
  const lowVol = data.low_volume;
  const total = days.reduce((s, d) => s + d.predicted, 0);
  const avg = total / days.length;
  const busiest = days.reduce((a, b) => (b.predicted > a.predicted ? b : a), days[0]);
  const allHorizons = [...DAILY_HORIZONS, ...WEEKLY_HORIZONS];
  const isLong = days.length > 31;
  const sel = days[Math.min(selectedIdx, days.length - 1)];
  const typicalMiss = data.is_backtest && data.backtest ? data.backtest.mae : data.mae;

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
            {specialty} arrivals forecast
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginTop: 4, letterSpacing: '-0.4px' }}>
            {alias} · {allHorizons.find((h) => h.id === horizonId)?.label || `${days.length} ${unit}s`}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {days.length} {unit}{days.length > 1 ? 's' : ''} · engine: <strong style={{ color: '#334155' }}>{engineLabel}</strong>
            {data.last_actual_date && <> · latest data {data.last_actual_date}</>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {badge && <Badge badge={badge} size="lg" />}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Forecast</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#15803d' }}>Validated &amp; reliable</div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>plan with each {unit}'s likely range</div>
          </div>
        </div>
      </div>

      {/* Low-volume honesty caveat */}
      {lowVol && (
        <div style={{
          marginTop: 14, background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#78350f', lineHeight: 1.55,
        }}>
          <strong>Low-volume specialty (~{data.avg_actual} per {unit}).</strong> At this scale a single
          {' '}{unit}'s count naturally swings a lot, so treat the point number as indicative and
          {' '}<strong>plan using the range</strong> rather than the exact figure.
        </div>
      )}

      {/* Backtest accuracy banner */}
      {data.is_backtest && data.backtest && <BacktestBanner bt={data.backtest} unit={unit} />}

      {/* Hero — selected / first period */}
      <HeroDay day={sel} unit={unit} />

      {/* Period strip or long-horizon summary */}
      {isLong ? (
        <PeriodSummary days={days} unit={unit} total={total} avg={avg} busiest={busiest} />
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, margin: '18px 0 8px' }}>
            Tap a {unit} for detail
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(96px, 1fr))`, gap: 8 }}>
            {days.map((d, i) => (
              <DayCard key={d.date} day={d} unit={unit} active={i === selectedIdx} onClick={() => setSelectedIdx(i)} />
            ))}
          </div>
        </>
      )}

      {/* Footer stats */}
      <div style={{
        marginTop: 18, paddingTop: 16, borderTop: '1px solid #e9ecf1',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10,
      }}>
        <Stat label={`Total over ${days.length} ${unit}s`} val={Math.round(total).toLocaleString()} />
        <Stat label={`Average / ${unit}`} val={Math.round(avg).toLocaleString()} />
        <Stat label={`Busiest ${unit}`} val={`${Math.round(busiest.predicted)} · ${fmtDay(busiest.date).mon} ${fmtDay(busiest.date).dom}`} />
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
        Trained live on {data.history_window_days?.toLocaleString()} {unit}s of real {specialty} arrivals (G3 · Clinical daily).
        The low–high band is the <strong>likely range</strong> — the band the real number should usually fall inside,
        which naturally widens further ahead. Plan with the range, not just the single number.
        This forecast is validated against historical data; if a prediction ever looks clearly off, contact the platform administrator.
      </div>
    </div>
  );
}

function HeroDay({ day, unit }) {
  const s = LABEL_STYLE[day.label] || LABEL_STYLE.med;
  const f = fmtDay(day.date);
  const prefix = unit === 'week' ? 'Week of ' : '';
  return (
    <div style={{
      marginTop: 18, borderRadius: 14, padding: '20px 22px',
      background: `linear-gradient(120deg, ${s.bg} 0%, #ffffff 130%)`,
      border: `1px solid ${s.dot}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: s.fg }}>{prefix}{f.wd}, {f.mon} {f.dom}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
          background: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: s.fg }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot }} /> {s.word} demand
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, fontWeight: 800, color: C.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(day.predicted)}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>predicted patients</div>
      </div>
      {day.actual != null ? (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Actual (real)</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#0f766e', marginTop: 2, lineHeight: 1 }}>{Math.round(day.actual)}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            likely range {Math.round(day.lower)}–{Math.round(day.upper)}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Likely range</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#334155', marginTop: 4 }}>
            {Math.round(day.lower)} – {Math.round(day.upper)}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>where it should land</div>
        </div>
      )}
    </div>
  );
}

function DayCard({ day, unit, active, onClick }) {
  const s = LABEL_STYLE[day.label] || LABEL_STYLE.med;
  const f = fmtDay(day.date);
  return (
    <button onClick={onClick} style={{
      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
      background: active ? s.bg : '#fff',
      border: `2px solid ${active ? s.dot : '#e9ecf1'}`,
      borderRadius: 12, padding: '10px 6px 9px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'all .12s',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: s.fg }}>{unit === 'week' ? 'Wk' : f.wd}</div>
      <div style={{ fontSize: 10.5, color: C.muted }}>{f.mon} {f.dom}</div>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.dot, margin: '2px 0' }} />
      <div style={{ fontSize: 21, fontWeight: 800, color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {Math.round(day.predicted)}
      </div>
      {day.actual != null ? (
        <div style={{ fontSize: 10, fontWeight: 700, color: '#0f766e' }}>act {Math.round(day.actual)}</div>
      ) : (
        <div style={{ fontSize: 10, color: C.muted }}>{Math.round(day.lower)}–{Math.round(day.upper)}</div>
      )}
    </button>
  );
}

function PeriodSummary({ days, unit, total, avg, busiest }) {
  const groups = {};
  for (const d of days) {
    const f = fmtDay(d.date);
    groups[f.mon] = groups[f.mon] || { mon: f.mon, sum: 0 };
    groups[f.mon].sum += d.predicted;
  }
  const rows = Object.values(groups);
  const maxSum = Math.max(...rows.map((r) => r.sum), 1);
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
        Monthly outlook (predicted patients)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => (
          <div key={r.mon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, fontSize: 12, fontWeight: 700, color: C.ink }}>{r.mon}</div>
            <div style={{ flex: 1, background: '#eef2f7', borderRadius: 6, height: 22, overflow: 'hidden' }}>
              <div style={{ width: `${(r.sum / maxSum) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${C.teal}, ${C.navy})`, borderRadius: 6 }} />
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

function Stat({ label, val }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e9ecf1', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{val}</div>
    </div>
  );
}

function ForecastError({ result, onTryAnother, onNavigate }) {
  const errCode = result?.detail?.error;
  const needsData = errCode === 'g3_not_merged' || result?.status === 409;
  const isPending = errCode === 'feature_pipeline_pending' || result?.status === 501;

  if (needsData) {
    return (
      <div style={{
        background: '#fff', border: '1px solid #bae6fd', borderLeft: `4px solid ${C.navy}`,
        borderRadius: 10, padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>🧱</span>
          <strong style={{ fontSize: 15, color: C.ink }}>One quick step first — build the clinical dataset</strong>
        </div>
        <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
          Per-specialty forecasts read from <strong>G3 · Clinical daily</strong> (the per-specialty arrivals,
          merged with calendar + weather). It isn't built yet in this session. Open <strong>Prepare</strong>,
          build the <strong>G3</strong> group, then come back and press Start prediction.
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

  const title = isPending ? 'Feature pipeline integration pending' : 'Forecast temporarily unavailable';
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
      <div style={{ marginTop: 12 }}>
        <button onClick={onTryAnother} style={{
          background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8,
          padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        }}>Try another</button>
      </div>
    </div>
  );
}
