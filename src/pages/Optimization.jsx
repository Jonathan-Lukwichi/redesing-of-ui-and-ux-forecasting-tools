import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';
import { LineChart } from '../components/Charts';
import AiPanel from '../components/AiPanel';
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
  const [data, setData] = useState({});           // merged {forecast, staff, supply, impact, meta}
  const [busy, setBusy] = useState({});            // { staff, supply, compare } booleans
  const [error, setError] = useState(null);
  const [model, setModel] = useState('ml');   // default to the most accurate engine (matches Forecast page)
  const [service, setService] = useState(0.95);
  const [kappa, setKappa] = useState(1.65);
  const [fcOptions, setFcOptions] = useState(null); // [{model,label,accuracy_pct,mae,...}]
  const [specialtyNote, setSpecialtyNote] = useState('');
  const [cmp, setCmp] = useState(null);             // forecast comparison result

  // On first load: the forecast options (accuracy per model) + any last solution.
  useEffect(() => {
    let alive = true;
    api.optimization.forecastOptions()
      .then((d) => { if (alive) { setFcOptions(d.options || []); setSpecialtyNote(d.specialty_note || ''); } })
      .catch(() => {});
    api.optimization.last()
      .then((d) => {
        if (alive && d && (d.staff || d.supply)) {
          setData(d);
          if (d.meta?.forecast_model) setModel(d.meta.forecast_model); // keep the selected card in sync with shown results
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const merge = (slice) => setData((prev) => ({ ...prev, ...slice }));
  const setBusyKey = (k, v) => setBusy((b) => ({ ...b, [k]: v }));

  // Handlers take explicit model/kappa/service so a selection can re-run with
  // the NEW value immediately (state updates are async — can't rely on `model`).
  const runStaff = ({ m = model, k = kappa } = {}) => {
    setBusyKey('staff', true); setError(null);
    api.optimization.runStaff({ model: m, kappa: k })
      .then((d) => merge({ forecast: d.forecast, staff: d.staff, impact: d.impact, meta: d.meta }))
      .catch((e) => setError(e.detail?.message || e.message || 'Staff optimization failed'))
      .finally(() => setBusyKey('staff', false));
  };
  const runSupply = ({ m = model, sl = service } = {}) => {
    setBusyKey('supply', true); setError(null);
    api.optimization.runSupply({ model: m, service_level: sl })
      .then((d) => merge({ forecast: d.forecast, supply: d.supply, impact: d.impact, meta: d.meta }))
      .catch((e) => setError(e.detail?.message || e.message || 'Supply optimization failed'))
      .finally(() => setBusyKey('supply', false));
  };
  const runCompare = () => {
    setBusyKey('compare', true); setError(null); setCmp(null);
    api.optimization.compare({ kappa, service_level: service })
      .then((d) => setCmp(d))
      .catch((e) => setError(e.detail?.message || e.message || 'Comparison failed'))
      .finally(() => setBusyKey('compare', false));
  };

  // Selecting a forecast model / changing an input RE-RUNS whatever has already
  // been computed, so the numbers on screen reflect the new choice immediately.
  const selectModel = (m) => {
    if (m === model) return;
    setModel(m);
    if (st) runStaff({ m });
    if (sup) runSupply({ m });
  };
  const changeKappa = (k) => { setKappa(k); if (st) runStaff({ k }); };
  const changeService = (sl) => { setService(sl); if (sup) runSupply({ sl }); };

  const fc = data?.forecast;
  const st = data?.staff;
  const sup = data?.supply;
  const imp = data?.impact;
  const meta = data?.meta;
  const anyRun = st || sup;
  const usedModelLabel = meta?.forecast_model_label || fc?.model_label;
  const usedAccuracy = meta?.forecast_accuracy_pct ?? fc?.accuracy_pct;

  return (
    <div className="content">
      <PageHero
        kicker="Operations · Optimization"
        title="Forecast-driven Optimization"
        sub="Run each optimization to see the hospital's cost BEFORE vs AFTER — and how much next week's forecast lets you save on staffing and supplies."
        image="/images/staff-bg.jpg"
      />

      {/* Controls — which forecast drives the optimization */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Which forecast should drive the optimization?</div>
          <button className="btn btn-sm" onClick={runCompare} disabled={busy.compare}>
            <Icon name="chart" size={13} />{busy.compare ? 'Comparing…' : 'Compare both forecasts'}
          </button>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
            {(fcOptions || [{ model: 'ml', label: 'Best ML model' }, { model: 'statistical', label: 'Best statistical model' }]).map((o) => (
              <button key={o.model} onClick={() => selectModel(o.model)} disabled={busy.staff || busy.supply} style={{
                textAlign: 'left', cursor: busy.staff || busy.supply ? 'wait' : 'pointer', fontFamily: 'inherit',
                border: `2px solid ${model === o.model ? C.navy : '#e5e9f0'}`, borderRadius: 10,
                background: model === o.model ? '#f0f6fc' : '#fff', padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 13.5, color: C.ink }}>{o.label}</strong>
                  {model === o.model
                    ? <span className="tag tag-success" style={{ fontSize: 10 }}>Selected</span>
                    : (o.model === 'ml' && <span className="tag" style={{ fontSize: 10, background: '#dcfce7', color: '#0f766e', border: 'none' }}>Recommended</span>)}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
                  {o.model === 'ml'
                    ? 'Learns from arrivals, calendar and weather — best for most days.'
                    : 'A classic time-series model — a transparent, dependable baseline.'}
                </div>
              </button>
            ))}
          </div>
          {anyRun && (
            <div style={{ fontSize: 11.5, color: C.navy, marginTop: 8 }}>
              {busy.staff || busy.supply ? 'Re-running with the selected forecast…' : 'Selecting a model re-runs the results below with that forecast.'}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.muted }} title="Safety buffer (κ) on per-shift nurse demand">Staffing safety buffer</span>
              <select className="select" value={kappa} onChange={(e) => changeKappa(Number(e.target.value))}>
                <option value={1.0}>Lean (less headroom)</option>
                <option value={1.65}>Standard</option>
                <option value={2.05}>Cautious (more headroom)</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.muted }}>Supply service level</span>
              <select className="select" value={service} onChange={(e) => changeService(Number(e.target.value))}>
                <option value={0.90}>90%</option>
                <option value={0.95}>95%</option>
                <option value={0.98}>98%</option>
                <option value={0.99}>99%</option>
              </select>
            </div>
          </div>

          {specialtyNote && (
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 12, lineHeight: 1.55, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
              <strong>Specialties:</strong> {specialtyNote}
            </div>
          )}
        </div>
      </div>

      {/* Forecast comparison — what accuracy is worth */}
      {cmp && <ForecastComparison cmp={cmp} onUse={selectModel} />}

      {error && (
        <div className="card"><div className="card-body" style={{ color: C.red }}>
          {error} {String(error).includes('G1') && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => onNavigate('prepare')}>Go to Prepare →</button>}
        </div></div>
      )}

      {/* Combined saving banner */}
      {anyRun && imp && (
        <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(110deg,#ecfdf5,#f0fdfa)', border: '1px solid #a7f3d0' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Total saving per year from optimization</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: C.green, lineHeight: 1.1, marginTop: 4 }}>{zarShort(imp.total_saving_annual_zar)}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                Staffing {zarShort(imp.staff_saving_annual_zar)}/yr {st ? '' : '(not run yet)'} · Supplies {zarShort(imp.supply_saving_annual_zar)}/yr {sup ? '' : '(not run yet)'}
              </div>
              {usedModelLabel && (
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
                  Forecast used: <strong style={{ color: C.ink }}>{usedModelLabel}</strong> · validated
                </div>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => onNavigate('actions')}>See recommended actions →</button>
          </div>
        </div>
      )}

      {anyRun && <AiPanel surface="optimization" context={data} label="Read this plan for me" />}

      {/* ════════════════ STAFF ════════════════ */}
      <SectionHeader n="1" title="Staff cost optimization" desc="Cost-minimal lawful roster (integer programme) — staff to the forecast instead of to the busy day." />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Workforce scheduling model</div>
          <button className="btn btn-primary" onClick={() => runStaff()} disabled={busy.staff}>
            <Icon name={busy.staff ? 'refresh' : 'bolt'} size={14} />
            {busy.staff ? 'Optimizing…' : st ? 'Re-run staff optimization' : 'Run staff optimization'}
          </button>
        </div>
        <div className="card-body">
          {!st && <div style={{ color: C.muted, padding: '20px 0' }}>Click <strong>Run staff optimization</strong> to forecast next week and compute the lawful roster — you'll see the cost before vs after.</div>}
          {st && (
            <>
              <SavingsPanel
                beforeLabel="BEFORE — staff for the busiest day, every day"
                afterLabel="AFTER — matched to the forecast"
                before={st.cost.before_zar} after={st.cost.after_zar}
                saving={st.cost.saving_zar} savingPct={st.cost.saving_pct}
                note={`≈ ${zarShort(st.cost.saving_annual_zar)}/year if sustained · own payroll ${zarShort(st.cost.own_payroll_zar)} is the same either way; the saving is agency locum avoided (${Math.round(st.cost.before_locum_hours)}h → ${Math.round(st.cost.after_locum_hours)}h).`}
              />
              <div style={{ fontSize: 11.5, color: C.muted, margin: '14px 0 10px', lineHeight: 1.6 }}>
                Reality check: your {st.kpis.nurses_available} nurses can lawfully cover only <strong>{Math.round(st.kpis.lawful_coverage_pct)}%</strong> of forecast
                demand at 45h/week — meeting it fully needs <strong>~{st.kpis.nurses_needed_lawful} nurses</strong> ({st.kpis.staffing_shortfall} short),
                so <strong>{Math.round(st.kpis.locum_hours)} agency-locum hours</strong> are unavoidable. Optimization can't remove that structural
                shortage — it minimises what you spend covering it.
              </div>
            </>
          )}
        </div>
      </div>

      {st && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><div>
              <div className="card-title">Daily demand vs optimized coverage</div>
              <div className="card-sub">Demand = forecast arrivals → nurse-shifts (incl. {Math.round((data.meta?.kappa ?? 1.65) === 1 ? 84 : (data.meta?.kappa >= 2 ? 98 : 95))}% safety buffer)</div>
            </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                <span><span className="dot" style={{ color: C.navy }} /> Required</span>
                <span><span className="dot" style={{ color: C.teal }} /> Scheduled (own nurses)</span>
              </div>
            </div>
            <div className="card-body">
              <LineChart series={[
                { data: st.demand_vs_coverage.map((d) => d.demand), color: C.navy },
                { data: st.demand_vs_coverage.map((d) => d.scheduled), color: C.teal },
              ]} height={220} xLabels={st.demand_vs_coverage.map((d) => d.day_label)} />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><div className="card-title">Coverage by shift (own nurses)</div></div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              {st.shifts.map((s) => {
                const cov = s.required ? Math.round(s.assigned / s.required * 100) : 100;
                return (
                  <div key={s.shift} style={{ border: '1px solid #eef0f3', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: SHIFT[s.shift] || C.muted }} />
                      <strong style={{ color: C.ink }}>{s.shift}</strong>
                      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: cov >= 60 ? C.green : cov >= 40 ? C.amber : C.red }}>{cov}%</span>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: C.muted }}>Own nurses / required</span>
                      <strong>{s.assigned} / {s.required}</strong>
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: C.muted }}>Needs locum</span>
                      <span style={{ color: s.unfilled > 0 ? C.amber : C.muted }}>{s.unfilled} · {s.locum_hours}h</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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
                    <td className="num">{r.weekly_hours}</td>
                    <td className="num">{zarShort(r.weekly_cost_zar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ════════════════ SUPPLY ════════════════ */}
      <SectionHeader n="2" title="Supply cost optimization" desc="Forecast-scaled (s,S) reorder — order the right amount now to avoid expensive stockouts later." />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Inventory reorder model</div>
          <button className="btn btn-primary" onClick={() => runSupply()} disabled={busy.supply}>
            <Icon name={busy.supply ? 'refresh' : 'bolt'} size={14} />
            {busy.supply ? 'Optimizing…' : sup ? 'Re-run supply optimization' : 'Run supply optimization'}
          </button>
        </div>
        <div className="card-body">
          {!sup && <div style={{ color: C.muted, padding: '20px 0' }}>Click <strong>Run supply optimization</strong> to run the two-stage stochastic (s,S) programme — a Monte-Carlo simulation picks the order-up-to level that minimises expected total cost. You'll see annual cost before vs after.</div>}
          {sup && (
            <>
              <SavingsPanel
                beforeLabel="BEFORE — naive policy, no forecast safety stock"
                afterLabel="AFTER — optimised (s*, S*) via Monte-Carlo"
                before={sup.cost.before_zar} after={sup.cost.after_zar}
                saving={sup.cost.saving_zar} savingPct={sup.cost.saving_pct}
                unit="per year"
                note={`Annual expected total cost over a ${sup.horizon_days}-day rolling horizon × ${sup.n_reps} simulated demand paths · consumption scaled ×${sup.forecast_factor} to the forecast · order ${sup.kpis.items_to_order} of ${sup.kpis.items_total} items now (${zarShort(sup.kpis.order_cost_zar)}).`}
              />
              {sup.cost_breakdown && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>Where the cost sits — annual, by component (ordering K · holding h · stockout p · wastage w):</div>
                  <table className="tbl" style={{ maxWidth: 560 }}>
                    <thead><tr><th>Component</th><th className="num">Before</th><th className="num">After</th><th className="num">Change</th></tr></thead>
                    <tbody>
                      {['stockout', 'ordering', 'holding', 'wastage'].map((k) => {
                        const b = sup.cost_breakdown.before[k], a = sup.cost_breakdown.after[k], dlt = a - b;
                        return (
                          <tr key={k}>
                            <td style={{ textTransform: 'capitalize' }}>{k}{k === 'stockout' ? ' penalty' : k === 'ordering' ? ' (K)' : k === 'holding' ? ' (h)' : ' (w)'}</td>
                            <td className="num">{zarShort(b)}</td>
                            <td className="num">{zarShort(a)}</td>
                            <td className="num" style={{ color: dlt < 0 ? C.green : dlt > 0 ? C.amber : C.muted }}>{dlt < 0 ? '−' : '+'}{zarShort(Math.abs(dlt))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                    Optimization adds forecast-driven safety stock — holding goes up a little, but it slashes the dominant stockout penalty. That trade-off is the whole point.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {sup && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><div>
            <div className="card-title">Recommended orders</div>
            <div className="card-sub">Reorder point s = d·L + Z·σ·√L · order up to S · at {Math.round((sup.service_level) * 100)}% service level</div>
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
      )}

      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 24, lineHeight: 1.6, maxWidth: 760 }}>
        The 45-hour weekly cap is a hard constraint, so any demand that can't be met lawfully is costed as agency locum, not illegal
        overtime. Staffing demand includes a safety buffer from the forecast's residual error. Salaries are the DPSA-scale figures in the
        staff master. Supply "before" cost is the modelled stockout penalty those items would incur if their reorder points went unmanaged.
      </div>
    </div>
  );
}

function ForecastComparison({ cmp, onUse }) {
  const a = cmp.models.statistical, b = cmp.models.ml;
  const c = cmp.comparison;
  const best = c.more_accurate;
  const totalAfter = (m) => m.staff.after_zar + m.supply.after_zar;
  const Row = ({ label, fmt, sa, ml, lowerBetter = true }) => {
    const win = lowerBetter ? (sa <= ml ? 'statistical' : 'ml') : (sa >= ml ? 'statistical' : 'ml');
    return (
      <tr>
        <td style={{ color: C.muted }}>{label}</td>
        <td className="num" style={{ fontWeight: win === 'statistical' ? 700 : 400, color: win === 'statistical' ? C.green : C.ink }}>{fmt(sa)}</td>
        <td className="num" style={{ fontWeight: win === 'ml' ? 700 : 400, color: win === 'ml' ? C.green : C.ink }}>{fmt(ml)}</td>
      </tr>
    );
  };
  const bestLabel = best === 'ml' ? b.label : a.label;
  return (
    <div className="card" style={{ marginBottom: 16, border: '1px solid #c7d2fe' }}>
      <div className="card-header"><div>
        <div className="card-title">Which forecast gives the better plan</div>
        <div className="card-sub">The same optimization, run under each forecast model — compare the resulting cost.</div>
      </div></div>
      <div className="card-body">
        <div style={{ background: '#eef2ff', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
          The <strong>{bestLabel}</strong> runs the hospital
          {' '}<strong style={{ color: C.green }}>{zarShort(c.total_after_diff_zar)}/yr cheaper</strong> —
          {' '}{Math.round(c.staff_locum_diff_hours)} fewer agency-locum hours and {zarShort(c.supply_after_diff_zar)} less tied up in safety stock.
          A sharper forecast makes the whole plan leaner.
        </div>
        <table className="tbl" style={{ maxWidth: 620 }}>
          <thead><tr><th></th><th className="num">{a.label}</th><th className="num">{b.label}</th></tr></thead>
          <tbody>
            <Row label="Staff cost after (per week)" fmt={zarShort} sa={a.staff.after_zar} ml={b.staff.after_zar} />
            <Row label="Locum hours needed" fmt={(v) => Math.round(v) + 'h'} sa={a.staff.locum_hours} ml={b.staff.locum_hours} />
            <Row label="Supply cost after (per year)" fmt={zarShort} sa={a.supply.after_zar} ml={b.supply.after_zar} />
            <Row label="Total saving (per year)" fmt={zarShort} sa={a.total_saving_annual_zar} ml={b.total_saving_annual_zar} lowerBetter={false} />
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-sm btn-primary" onClick={() => onUse(best)}>Use {bestLabel} →</button>
          <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 10 }}>then run each optimization below with this forecast</span>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ n, title, desc }) {
  return (
    <div style={{ margin: '22px 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#1e6091', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{title}</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 5, marginLeft: 36 }}>{desc}</div>
    </div>
  );
}

function SavingsPanel({ beforeLabel, afterLabel, before, after, saving, savingPct, note, unit = 'per week' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1.1fr)', gap: 12, alignItems: 'center' }}>
      <Box label={beforeLabel} value={zarShort(before)} color={C.ink} bg="#f8fafc" sub={unit} />
      <Arrow />
      <Box label={afterLabel} value={zarShort(after)} color={C.navy} bg="#eef5fb" sub={unit} />
      <Arrow />
      <Box label="YOU SAVE" value={zarShort(saving)} color={C.green} bg="#ecfdf5" sub={savingPct ? `${savingPct}% lower · ${unit}` : unit} big />
      {note && <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{note}</div>}
    </div>
  );
}

function Box({ label, value, color, bg, sub, big }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, lineHeight: 1.3, minHeight: 26 }}>{label}</div>
      <div style={{ fontSize: big ? 30 : 24, fontWeight: 800, color, marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Arrow() {
  return <span style={{ fontSize: 22, color: '#94a3b8', textAlign: 'center' }}>→</span>;
}
