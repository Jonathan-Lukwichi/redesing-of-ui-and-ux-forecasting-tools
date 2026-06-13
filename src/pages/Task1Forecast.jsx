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
  { id: '1d',      label: '1 day ahead',  sub: 'tomorrow only' },
  { id: '7d',      label: '7 days ahead', sub: 'day-by-day' },
  { id: 'monthly', label: 'Monthly',      sub: '30-day aggregate' },
  { id: 'yearly',  label: 'Yearly',       sub: '365-day aggregate' },
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

export default function Task1Forecast({ onNavigate }) {
  const [models, setModels]   = useState(null);
  const [error,  setError]    = useState(null);
  const [alias,  setAlias]    = useState(null);
  const [horizon, setHorizon] = useState('7d');
  const [startDate, setStartDate] = useState(isoTomorrow());
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
      const res = await api.task1.forecast({ alias, horizon, start_date: startDate });
      setResult({ ok: true, data: res });
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
        ready={!!alias && !!horizon && !!startDate}
        running={running}
        primaryLabel={result ? 'Re-run prediction' : 'Start prediction'}
        onRun={run}
        summary={alias
          ? `${alias} · ${horizon} · starting ${startDate}`
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

      {/* Step 3 — Start date */}
      <Section step="3" title="Start date" sub="First date of the forecast window.">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{
            fontFamily: 'inherit', fontSize: 14, padding: '10px 12px',
            border: '1px solid #cbd5e1', borderRadius: 8, color: C.ink, minWidth: 180,
          }}
        />
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
            Will run <strong>{alias}</strong> ({selected.card?.family || '—'}) on the <strong>{horizon}</strong> horizon, starting <strong>{startDate}</strong>.
          </div>
        )}
      </div>

      {/* Result panel */}
      {result && (result.ok
        ? <ForecastResult data={result.data} />
        : <ForecastError result={result} onTryAnother={() => setResult(null)} />)}

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
            {data.forecast_dates?.length} day(s) starting {data.forecast_dates?.[0]}
          </div>
        </div>
        <Badge badge={data.badge} size="lg" />
      </div>
      {data.warning && <Banner color="amber" title="Note:">{data.warning}</Banner>}
      <div style={{ marginTop: 12 }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e9ecf1' }}>
              <th style={{ padding: '8px 10px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Date</th>
              <th style={{ padding: '8px 10px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Predicted</th>
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
        {data.aggregated_horizon_total != null && (
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: C.navy }}>
            Total over horizon: {Math.round(data.aggregated_horizon_total).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

function ForecastError({ result, onTryAnother }) {
  const isPending = result?.detail?.error === 'feature_pipeline_pending'
                 || (result?.message || '').includes('feature_pipeline_pending')
                 || result?.status === 501;
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
