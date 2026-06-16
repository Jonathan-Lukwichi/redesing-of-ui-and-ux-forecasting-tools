import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';
import { LineChart } from '../components/Charts';
import { api } from '../api/client';

const C = { ink: '#0f172a', muted: '#64748b', teal: '#0d9488', navy: '#1e6091', red: '#dc2626', amber: '#d97706', green: '#15803d' };
const SHIFT = { Day: '#f59e0b', Evening: '#1e6091', Night: '#6366f1' };
const CAT_SHORT = { 'Professional Nurse': 'PN', 'Enrolled Nurse': 'EN', 'Enrolled Nursing Auxiliary': 'ENA' };
const zar = (n) => (n == null ? '—' : 'R ' + Math.round(n).toLocaleString('en-ZA'));
const zarShort = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return 'R ' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return 'R ' + (n / 1e3).toFixed(0) + 'k';
  return 'R ' + Math.round(n);
};

export default function Optimization({ onNavigate }) {
  const [data, setData] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [model, setModel] = useState('statistical');
  const [service, setService] = useState(0.95);

  // On first load, show the last solution if one exists (no auto-solve).
  useEffect(() => {
    let alive = true;
    api.optimization.last()
      .then((d) => { if (alive && d && d.staff) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const run = () => {
    setRunning(true); setError(null);
    api.optimization.run({ model, service_level: service })
      .then((d) => setData(d))
      .catch((e) => setError(e.detail?.message || e.message || 'Optimization failed'))
      .finally(() => setRunning(false));
  };

  const fc = data?.forecast;
  const st = data?.staff;
  const sup = data?.supply;
  const sk = st?.kpis;
  const uk = sup?.kpis;
  const imp = data?.impact;

  return (
    <div className="content">
      <PageHero
        kicker="Operations · Optimization"
        title="Forecast-driven Optimization"
        sub="Turn next week's demand forecast into the cost-minimal LAWFUL nurse roster (integer programme) and a (s,S) reorder plan — and see how much it improves operations."
        image="/images/staff-bg.jpg"
        actions={<>
          <button className="btn btn-primary" onClick={run} disabled={running}>
            <Icon name={running ? 'refresh' : 'bolt'} size={14} />
            {running ? 'Optimizing…' : data ? 'Re-run optimization' : 'Run optimization'}
          </button>
        </>}
      />

      {/* Controls */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Forecast engine</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['statistical', 'Statistical'], ['ml', 'Machine learning']].map(([v, l]) => (
                <button key={v} className="btn btn-sm" onClick={() => setModel(v)}
                  style={model === v ? { background: '#e8f1f8', color: C.navy, borderColor: C.navy } : {}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Supply service level</span>
            <select className="select" value={service} onChange={(e) => setService(Number(e.target.value))}>
              <option value={0.90}>90%</option>
              <option value={0.95}>95%</option>
              <option value={0.98}>98%</option>
              <option value={0.99}>99%</option>
            </select>
          </div>
          <div style={{ flex: 1 }} />
          {fc && (
            <div style={{ fontSize: 11.5, color: C.muted }}>
              Driven by: <strong style={{ color: C.ink }}>{fc.source}</strong>
              {fc.accuracy_pct != null && <> · forecast accuracy ≈{Math.round(fc.accuracy_pct)}%</>}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="card"><div className="card-body" style={{ color: C.red }}>
          {error} {error.includes('G1') && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => onNavigate('prepare')}>Go to Prepare →</button>}
        </div></div>
      )}

      {!data && !error && (
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
          <Icon name="bolt" size={28} />
          <div style={{ marginTop: 12, fontSize: 15, color: C.ink, fontWeight: 600 }}>No optimization run yet</div>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            Click <strong>Run optimization</strong> to forecast next week's arrivals and compute the optimal staff roster and reorder plan.
          </div>
        </div></div>
      )}

      {data && (
        <>
          {/* IMPACT banner */}
          <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${C.teal}` }}>
            <div className="card-header"><div>
              <div className="card-title">How this plan improves operations</div>
              <div className="card-sub">Week of {fc?.week_starting} · solved in {data.meta?.solve_time_seconds}s ({data.meta?.solver})</div>
            </div></div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
              <Impact label="Lawful coverage" value={`${Math.round(sk.lawful_coverage_pct)}%`}
                sub={`vs ${Math.round(sk.baseline_coverage_pct)}% with a flat roster`} good={sk.lawful_coverage_pct >= 90} />
              <Impact label="Nurses still short" value={sk.staffing_shortfall} unit="nurses"
                sub={`need ~${sk.nurses_needed_lawful} at 45h/wk, have ${sk.nurses_available}`} good={sk.staffing_shortfall === 0} />
              <Impact label="Locum hours needed" value={Math.round(sk.locum_hours)} unit="h"
                sub="to lawfully close the gap" good={sk.locum_hours === 0} />
              <Impact label="Locum saved by matching peaks" value={zarShort(sk.weekly_savings_zar)}
                sub={`${sk.savings_pct}% vs naive flat roster`} good />
              <Impact label="Items to reorder" value={uk.items_to_order} unit={`of ${uk.items_total}`}
                sub={`${zarShort(uk.order_cost_zar)} order this week`} good={uk.items_at_risk_now === 0} />
              <Impact label="Stockout risk addressed" value={zarShort(uk.stockout_risk_addressed_zar)}
                sub="penalty these orders prevent" good />
            </div>
          </div>

          {/* ── STAFF ─────────────────────────────────────────────── */}
          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: '20px 0 10px', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Staff roster · cost-minimal lawful schedule
          </div>

          <div className="grid-kpi">
            <KPI label="Lawful coverage" value={Math.round(sk.lawful_coverage_pct)} unit="%"
              foot={`${sk.total_filled_slots}/${sk.total_required_slots} shift-slots filled`} />
            <KPI label="Nurses used" value={sk.nurses_used} unit={`of ${sk.nurses_available}`}
              foot={`each capped at the legal 45h/week`} />
            <KPI label="Weekly payroll" value={zarShort(sk.weekly_payroll_zar)}
              foot={`+ ${zarShort(sk.locum_cost_zar)} locum`} />
            <KPI label="Shortfall" value={sk.staffing_shortfall} unit="nurses"
              foot={`${Math.round(sk.locum_hours)} locum hours to cover lawfully`} />
          </div>

          <div style={{ fontSize: 11.5, color: C.muted, margin: '4px 0 14px' }}>
            A flat roster of the same nurses would cover only <strong>{Math.round(sk.baseline_coverage_pct)}%</strong>;
            matching the forecast peaks lifts it to <strong>{Math.round(sk.lawful_coverage_pct)}%</strong> and saves
            <strong> {zar(sk.weekly_savings_zar)}</strong> in locum this week. The remaining gap is the structural
            nurse shortage — meeting forecast demand lawfully needs <strong>~{sk.nurses_needed_lawful} nurses</strong>.
          </div>

          {/* Demand vs coverage */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><div>
              <div className="card-title">Daily demand vs optimized coverage</div>
              <div className="card-sub">Demand = forecast arrivals → nurse-shifts (incl. 95% safety buffer)</div>
            </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                <span><span className="dot" style={{ color: C.navy }} /> Required</span>
                <span><span className="dot" style={{ color: C.teal }} /> Scheduled</span>
              </div>
            </div>
            <div className="card-body">
              <LineChart series={[
                { data: st.demand_vs_coverage.map((d) => d.demand), color: C.navy },
                { data: st.demand_vs_coverage.map((d) => d.scheduled), color: C.teal },
              ]} height={220} xLabels={st.demand_vs_coverage.map((d) => d.day_label)} />
            </div>
          </div>

          {/* Shift breakdown */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><div className="card-title">Coverage by shift</div></div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              {st.shifts.map((s) => {
                const cov = s.required ? Math.round(s.assigned / s.required * 100) : 100;
                return (
                  <div key={s.shift} style={{ border: '1px solid #eef0f3', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: SHIFT[s.shift] || C.muted }} />
                      <strong style={{ color: C.ink }}>{s.shift}</strong>
                      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: cov >= 90 ? C.green : cov >= 60 ? C.amber : C.red }}>{cov}%</span>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: C.muted }}>Filled / required</span>
                      <strong>{s.assigned} / {s.required}</strong>
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: C.muted }}>Unfilled · locum</span>
                      <span style={{ color: s.unfilled > 0 ? C.amber : C.muted }}>{s.unfilled} · {s.locum_hours}h</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Roster */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header"><div className="card-title">Optimized roster · {st.roster.filter((r) => r.n_shifts > 0).length} nurses scheduled</div></div>
            <table className="tbl">
              <thead>
                <tr><th>Nurse</th><th>Role</th><th>Assigned shifts</th><th className="num">Shifts</th><th className="num">Weekly hrs</th><th className="num">Cost</th></tr>
              </thead>
              <tbody>
                {st.roster.filter((r) => r.n_shifts > 0).map((r) => (
                  <tr key={r.staff_id}>
                    <td className="mono" style={{ fontWeight: 500, color: C.ink }}>{r.staff_id}</td>
                    <td><span className="tag">{CAT_SHORT[r.category] || r.category}</span></td>
                    <td style={{ fontSize: 11.5 }}>
                      {r.shifts_assigned.map((s) => {
                        const sh = s.split('-')[1];
                        return <span key={s} className="tag" style={{ marginRight: 4, background: (SHIFT[sh] || '#eef') + '22', color: SHIFT[sh] || C.muted, border: 'none' }}>{s}</span>;
                      })}
                    </td>
                    <td className="num">{r.n_shifts}</td>
                    <td className="num" style={{ color: r.weekly_hours > 45 ? C.red : C.ink }}>{r.weekly_hours}</td>
                    <td className="num">{zarShort(r.weekly_cost_zar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── SUPPLY ────────────────────────────────────────────── */}
          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: '8px 0 10px', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Supply reorder · forecast-scaled (s,S) plan
          </div>

          <div className="grid-kpi">
            <KPI label="Items to order now" value={uk.items_to_order} unit={`of ${uk.items_total}`}
              foot="below their reorder point" />
            <KPI label="This week's order" value={zarShort(uk.order_cost_zar)}
              foot="total purchase value" />
            <KPI label="Stockout risk addressed" value={zarShort(uk.stockout_risk_addressed_zar)}
              foot="penalty these orders prevent" />
            <KPI label="Demand factor" value={`×${sup.forecast_factor}`}
              foot={`consumption scaled to the forecast`} />
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header"><div>
              <div className="card-title">Recommended orders</div>
              <div className="card-sub">Reorder point s = d·L + Z·σ·√L · order up to S · at {Math.round(service * 100)}% service level</div>
            </div></div>
            <table className="tbl">
              <thead>
                <tr><th>Item</th><th>ABC</th><th className="num">On hand</th><th className="num">Proj/day</th><th className="num">Reorder pt</th><th className="num">Order up to</th><th className="num">Order qty</th><th className="num">Cost</th><th>Status</th></tr>
              </thead>
              <tbody>
                {sup.orders.map((o) => (
                  <tr key={o.item_id}>
                    <td style={{ color: C.ink }}>{o.item_name}</td>
                    <td><span className="tag">{o.abc_class}</span></td>
                    <td className="num">{o.on_hand}</td>
                    <td className="num">{o.proj_daily}</td>
                    <td className="num">{o.reorder_point}</td>
                    <td className="num">{o.order_up_to}</td>
                    <td className="num" style={{ fontWeight: o.order_qty > 0 ? 600 : 400, color: o.order_qty > 0 ? C.ink : C.muted }}>{o.order_qty || '—'}</td>
                    <td className="num">{o.order_cost_zar ? zarShort(o.order_cost_zar) : '—'}</td>
                    <td>
                      <span className={'tag ' + (o.status === 'order_now' ? 'tag-warning' : o.status === 'excess' ? 'tag-info' : 'tag-success')}>
                        {o.status === 'order_now' ? 'Order now' : o.status === 'excess' ? 'Excess' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: 11.5, color: C.muted, maxWidth: 620, lineHeight: 1.6 }}>
              The 45-hour weekly cap is enforced as a hard constraint, so any demand that can't be met lawfully appears
              as a locum shortfall rather than illegal overtime. Demand includes a 95% safety buffer from the forecast's
              residual error. Salaries are the DPSA-scale figures in the staff master.
            </div>
            <button className="btn btn-primary" onClick={() => onNavigate('actions')}>
              See recommended actions →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Impact({ label, value, unit, sub, good }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: good ? C.green : C.ink, marginTop: 4, lineHeight: 1.1 }}>
        {value}{unit && <span style={{ fontSize: 13, fontWeight: 500, color: C.muted, marginLeft: 4 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}
