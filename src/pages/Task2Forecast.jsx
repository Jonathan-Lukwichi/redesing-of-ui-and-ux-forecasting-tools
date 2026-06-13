// =============================================================================
// Task 2 — Per-Specialty Arrivals
// Implements docs/DASHBOARD_SPEC.md §4.
//
// Pick a specialty → filtered list of available models (with badges) → pick a
// horizon (auto-swaps to weekly set for Maternity/Psychiatry) → start date → Run.
//
// /api/task2/forecast is stubbed 501 until feature_builder.py from msc-modelling
// is integrated. Until then the UI is fully wired against real metadata.
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
  { id: '1d',      label: '1 day ahead',  sub: 'tomorrow only' },
  { id: '7d',      label: '7 days ahead', sub: 'day-by-day' },
  { id: 'monthly', label: 'Monthly',      sub: '30-day aggregate' },
  { id: 'yearly',  label: 'Yearly',       sub: '365-day aggregate' },
];
const WEEKLY_HORIZONS = [
  { id: '1week',  label: '1 week ahead',  sub: 'next week' },
  { id: '4weeks', label: '4 weeks ahead', sub: 'week-by-week' },
  { id: 'yearly', label: 'Yearly',        sub: '52-week aggregate' },
];

const isoTomorrow = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
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

export default function Task2Forecast({ onNavigate }) {
  const [catalogue, setCatalogue] = useState(null);
  const [error,     setError]     = useState(null);
  const [specialty, setSpecialty] = useState(null);
  const [alias,     setAlias]     = useState(null);
  const [horizon,   setHorizon]   = useState('7d');
  const [startDate, setStartDate] = useState(isoTomorrow());
  const [running,   setRunning]   = useState(false);
  const [result,    setResult]    = useState(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    api.task2.specialties()
      .then((res) => {
        if (!alive) return;
        const items = res.items || [];
        setCatalogue(items);
        if (items.length && !specialty) {
          // Default: Medicine (highest-quality models)
          const med = items.find((s) => s.specialty === 'Medicine') || items[0];
          setSpecialty(med.specialty);
        }
      })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSpecialty = catalogue?.find((s) => s.specialty === specialty) || null;
  const isWeekly = selectedSpecialty?.resolution === 'weekly';
  const horizons = isWeekly ? WEEKLY_HORIZONS : DAILY_HORIZONS;

  // Auto-correct horizon when switching to/from weekly specialties
  useEffect(() => {
    if (!selectedSpecialty) return;
    const valid = (isWeekly ? WEEKLY_HORIZONS : DAILY_HORIZONS).map((h) => h.id);
    if (!valid.includes(horizon)) setHorizon(valid[1] || valid[0]);
  }, [isWeekly]);

  // Auto-pick the first available model when specialty changes
  useEffect(() => {
    if (!selectedSpecialty) return;
    const first = (selectedSpecialty.models || [])[0]?.alias;
    if (first && !selectedSpecialty.models.find((m) => m.alias === alias)) {
      setAlias(first);
    }
  }, [specialty]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedModel = (selectedSpecialty?.models || []).find((m) => m.alias === alias) || null;

  const run = async () => {
    setRunning(true); setResult(null);
    try {
      const res = await api.task2.forecast({ specialty, alias, horizon, start_date: startDate });
      setResult({ ok: true, data: res });
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
          Specialty-level resource allocation, on-call rota, ward bed planning. 7 specialties · 13 trained models.
        </div>
      </div>

      {error && <Banner color="red" title="Couldn't load catalogue.">{error}</Banner>}

      {/* Top action bar — primary "Start prediction" CTA */}
      <StartBar
        ready={!!specialty && !!alias && !!horizon && !!startDate}
        running={running}
        primaryLabel={result ? 'Re-run prediction' : 'Start prediction'}
        onRun={run}
        summary={specialty && alias
          ? `${specialty} · ${alias} · ${horizon} · starting ${startDate}`
          : 'Pick a specialty + model below, then start the prediction.'}
      />

      {/* Step 1 — Specialty */}
      <Section step="1" title="Pick a specialty" sub="Each specialty has its own trained models.">
        {!catalogue && !error && <div style={{ color: C.muted, fontSize: 13 }}>Loading specialties…</div>}
        {catalogue && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {catalogue.map((s) => {
              const on = specialty === s.specialty;
              const bestBadge = s.models?.[0]?.badge;
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
                    {s.resolution === 'weekly' ? 'Weekly · ' : ''}{s.models?.length || 0} model(s)
                  </div>
                  {bestBadge && <div style={{ marginTop: 8 }}><Badge badge={bestBadge} /></div>}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* Step 2 — Model list (filtered to specialty) */}
      {selectedSpecialty && (
        <Section step="2" title="Pick a model" sub={`Available for ${selectedSpecialty.specialty}, sorted by badge then by MAPE.`}>
          {selectedSpecialty.models?.length === 0 ? (
            <Banner color="amber" title="No models for this specialty.">
              The handover catalogue doesn't ship trained models here.
            </Banner>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedSpecialty.models.map((m) => (
                <ModelRow key={m.alias} m={m} selected={alias === m.alias} onSelect={() => setAlias(m.alias)} />
              ))}
            </div>
          )}
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

      {/* Step 4 — Start date */}
      {selectedSpecialty && (
        <Section step="4" title="Start date" sub="First date of the forecast window.">
          <input
            type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            style={{
              fontFamily: 'inherit', fontSize: 14, padding: '10px 12px',
              border: '1px solid #cbd5e1', borderRadius: 8, color: C.ink, minWidth: 180,
            }}
          />
        </Section>
      )}

      {/* Bottom run button — second touchpoint after configuring */}
      {selectedSpecialty && (
        <div>
          <button onClick={run} disabled={!alias || running}
            style={{
              cursor: running ? 'wait' : alias ? 'pointer' : 'not-allowed',
              background: alias ? `linear-gradient(135deg, ${C.teal}, ${C.navy})` : '#cbd5e1',
              color: '#fff', border: 0,
              padding: '14px 28px', borderRadius: 10,
              fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
              boxShadow: alias ? '0 8px 22px rgba(13,148,136,0.35)' : 'none',
              opacity: running ? 0.7 : 1,
            }}>
            {running ? 'Predicting…' : `▶ ${result ? 'Re-run' : 'Start'} prediction — ${specialty}, ${alias || '…'}`}
          </button>
          {selectedModel && (
            <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
              <strong>{specialty}</strong> / <strong>{alias}</strong> on the <strong>{horizon}</strong> horizon, starting <strong>{startDate}</strong>.
            </div>
          )}
        </div>
      )}

      {result && (result.ok
        ? <ForecastResult data={result.data} />
        : <ForecastError result={result} onTryAnother={() => setResult(null)} />)}
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
      <div style={{ minWidth: 130, fontSize: 12.5, color: C.muted, fontFamily: 'JetBrains Mono' }}>
        val MAPE <strong style={{ color: C.ink }}>{mape}</strong>
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

function ForecastResult({ data }) {
  return (
    <div style={{
      background: '#fff', border: `2px solid ${C.teal}`, borderRadius: 12, padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>
            Forecast — {data.alias}, {data.horizon}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            {data.forecast_dates?.length} period(s) starting {data.forecast_dates?.[0]}
          </div>
        </div>
        <Badge badge={data.badge} size="lg" />
      </div>
      {data.warning && <Banner color="amber" title="Note:">{data.warning}</Banner>}
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 10 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e9ecf1' }}>
            <th style={{ padding: '8px 10px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Date</th>
            <th style={{ padding: '8px 10px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Predicted</th>
          </tr>
        </thead>
        <tbody>
          {(data.forecast_dates || []).map((d, i) => (
            <tr key={d} style={{ borderBottom: '1px solid #f3f5f8' }}>
              <td style={{ padding: '8px 10px' }}>{d}</td>
              <td style={{ padding: '8px 10px', fontWeight: 700, color: C.ink }}>
                {(data.point_forecasts || [])[i]?.toFixed(0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ForecastError({ result, onTryAnother }) {
  const isPending = result?.detail?.error === 'feature_pipeline_pending' || result?.status === 501;
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
      {isPending && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
          The catalogue, badges, and metrics are real. The actual forecast run goes live once
          <code> feature_builder.py</code> from the modeling team is integrated.
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button onClick={onTryAnother} style={{
          background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8,
          padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        }}>Try another</button>
      </div>
    </div>
  );
}
