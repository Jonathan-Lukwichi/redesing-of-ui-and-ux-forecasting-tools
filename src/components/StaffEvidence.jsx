import { useState } from 'react';
import Icon from './Icon';
import { api } from '../api/client';

/* Step 3 evidence card (Plan C2): the rostering-strategy comparison, moved
   from the Staff Planner. On demand only. Only the lawful forecast-driven
   roster is deployable (it is exactly what "Run staff optimization" builds);
   every unlawful strategy renders as a badged benchmark. Oracle is gone. */

const C = { ink: '#0f172a', muted: '#64748b', teal: '#0d9488', navy: '#1e6091', red: '#dc2626', amber: '#d97706' };
const zarShort = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return 'R ' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return 'R ' + (n / 1e3).toFixed(0) + 'k';
  return 'R ' + Math.round(n);
};

const STRAT_ORDER = ['peak', 'mean', 'forecast_lawful', 'forecast_ot', 'forecast_stochastic'];
const STRAT_LABEL = {
  peak: 'Fixed peak roster', mean: 'Historical-mean roster',
  forecast_lawful: 'Forecast · lawful (45h)', forecast_ot: 'Forecast · overtime',
  forecast_stochastic: 'Forecast · safety-staffed',
};
const STRAT_COLOR = {
  peak: '#94a3b8', mean: '#d97706', forecast_lawful: '#0d9488',
  forecast_ot: '#7c3aed', forecast_stochastic: '#0ea5e9',
};
const ARRIVAL_CHOICES = [50, 64, 78, 90];

function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: C.muted, minWidth: 0 }}>{label}</span>
      <span className="tnum" style={{ fontWeight: 600, color: valueColor || C.ink, flexShrink: 0 }}>{value}</span>
    </div>
  );
}

export default function StaffEvidence() {
  const [strat, setStrat] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadBusy, setLoadBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [arrivals, setArrivals] = useState(null);

  const run = async (meanArrivals = arrivals) => {
    setBusy(true); setErr(null);
    try { setStrat(await api.staff.strategyCompareDemo(meanArrivals != null ? { meanArrivals } : {})); }
    catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };
  const loadLast = async () => {
    setLoadBusy(true); setErr(null);
    try {
      const d = await api.staff.strategyCompareLast();
      if (d?.result) setStrat(d.result);
      else setErr('No previous strategy comparison on the server yet.');
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoadBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 16, border: '1px solid #bae6fd' }}>
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          <div className="card-title">Why the lawful forecast-driven roster? · strategy evidence</div>
          <div className="card-sub">
            Five rostering strategies for the same nurse pool. Only the{' '}
            <b style={{ color: STRAT_COLOR.forecast_lawful }}>lawful roster</b> is deployable —
            it is exactly what <b>Run staff optimization</b> builds. The rest are benchmarks:
            they reach coverage only by scheduling unlawful hours.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={loadLast} disabled={loadBusy}>
            <Icon name="refresh" size={12} /> {loadBusy ? 'Loading…' : 'Load last results'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => run()} disabled={busy}>
            <Icon name="users" size={13} /> {busy ? 'Comparing…' : 'Compare strategies'}
          </button>
        </div>
      </div>
      <div className="card-body">
        {err && <div style={{ padding: 12, background: '#fef2f2', color: C.red, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>{err}</div>}

        {!strat && (
          <div style={{ color: C.muted, fontSize: 13, padding: '4px 0' }}>
            Press <strong>Compare strategies</strong> to simulate the five rostering regimes
            at your chosen demand level. Nothing runs until you ask.
          </div>
        )}

        {strat && (
          <>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: C.muted, marginRight: 4 }}>Arrivals/day</span>
              {ARRIVAL_CHOICES.map((a) => (
                <button key={a} className="btn btn-sm" disabled={busy}
                  onClick={() => { setArrivals(a); run(a); }}
                  style={arrivals === a ? { background: '#e8f1f8', color: C.navy, borderColor: C.navy } : {}}>
                  {a}
                </button>
              ))}
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>
                {strat.n_active} nurses · {strat.sim_weeks} weeks · ~{Math.round(strat.mean_arrivals)}/day
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(190px, 100%),1fr))', gap: 12, opacity: busy ? 0.55 : 1, transition: 'opacity .15s' }}>
              {STRAT_ORDER.map((s) => {
                const d = strat.strategies?.[s];
                if (!d) return null;
                const isRec = s === strat.recommended;
                const unlawful = d.bcea_breach_weeks_pct > 0;
                return (
                  <div key={s} style={{
                    border: `1px solid ${isRec ? C.teal : '#e4e7eb'}`,
                    borderStyle: isRec ? 'solid' : 'dashed',
                    borderRadius: 8, padding: '14px 14px',
                    background: isRec ? '#ecfeff' : 'white',
                    display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
                  }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: STRAT_COLOR[s], textTransform: 'uppercase', letterSpacing: 1 }}>
                        {STRAT_LABEL[s]}
                      </span>
                      {isRec
                        ? <span style={{ fontSize: 9, fontWeight: 700, color: 'white', background: C.teal, borderRadius: 4, padding: '2px 6px' }}>DEPLOYABLE · WHAT RUN BUILDS</span>
                        : <span style={{ fontSize: 9, fontWeight: 600, color: unlawful ? C.red : C.muted }}>benchmark · not deployable{unlawful ? ' (unlawful hours)' : ''}</span>}
                    </div>
                    <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 4 }}>
                      {zarShort(d.annual_cost_zar)}<span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}> /yr</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, fontSize: 12 }}>
                      <Row label="Lawful coverage" value={`${d.lawful_coverage_pct}%`} />
                      <Row label="Mean weekly hrs" value={`${d.mean_weekly_hours}h`}
                        valueColor={d.mean_weekly_hours > strat.lawful_weekly_cap_h ? C.red : '#16a34a'} />
                      <Row label="BCEA breach wks" value={`${d.bcea_breach_weeks_pct}%`}
                        valueColor={d.bcea_breach_weeks_pct > 0 ? C.amber : '#16a34a'} />
                      <Row label="Overtime" value={zarShort(d.overtime_cost_zar)} />
                      <Row label="Locum" value={zarShort(d.locum_cost_zar)} />
                      <Row label="Shortfall" value={`${d.staffing_shortfall_nurses} nurses`} valueColor={C.muted} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14, padding: '10px 12px', background: '#fafbfc', border: '1px solid #eef0f3', borderRadius: 8, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
              The <b>staffing shortfall is identical across every strategy</b> — it's set by demand,
              not by the roster: a <b>hiring problem</b>. The forecast's value is doing the coverage{' '}
              <i>lawfully and cheaply</i>; the benchmarks buy marginal coverage with unlawful overwork
              or over-cost. This system refuses to deploy an unlawful roster by construction.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
