import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';
import { LineChart } from '../components/Charts';
import { api } from '../api/client';
import AiPanel from '../components/AiPanel';

const C = { ink: '#0f172a', muted: '#64748b', teal: '#0d9488', navy: '#1e6091', red: '#dc2626', amber: '#d97706' };

const zar = (n) => (n == null ? '—' : 'R ' + Math.round(n).toLocaleString('en-ZA'));
const zarShort = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return 'R ' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return 'R ' + (n / 1e3).toFixed(0) + 'k';
  return 'R ' + Math.round(n);
};
const STATUS = {
  stockout: { tag: 'tag-danger', label: 'At risk' },
  excess:   { tag: 'tag-warning', label: 'Excess' },
  ok:       { tag: 'tag-success', label: 'OK' },
};
const ABC = { A: '#dc2626', B: '#d97706', C: '#0d9488' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Forecast-value demonstration: six inventory policies, ordered as a ladder
// from "no forecast" to "perfect foresight" by how fully each consumes it.
const POLICY_ORDER = ['naive', 's_q', 'r_s', 'ss_static', 'dynamic'];
const POLICY_LABEL = {
  naive:     'Naive monthly bulk',
  s_q:       '(s, Q) reorder / EOQ',
  r_s:       '(R, S) periodic',
  ss_static: 'Static (s, S)',
  dynamic:   'Dynamic forecast base-stock',
  oracle:    'Oracle (perfect foresight)',
};
const POLICY_SHORT = {
  naive: 'Naive', s_q: '(s,Q)', r_s: '(R,S)', ss_static: '(s,S)', dynamic: 'Dynamic', oracle: 'Oracle',
};
const POLICY_COLOR = {
  naive:     '#94a3b8',
  s_q:       '#7c3aed',
  r_s:       '#0ea5e9',
  ss_static: '#d97706',
  dynamic:   '#0d9488',
  oracle:    '#1e6091',
};
// Deployable arms only (oracle is a benchmark ceiling; naive is the status-quo
// floor) — used to pick the "best for you" recommendation.
const DEPLOYABLE = ['s_q', 'r_s', 'ss_static', 'dynamic'];
const LEAD_TIME_CHOICES = [3, 5, 7, 10, 14, 21, 30];

export default function SupplyPlanner() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [compare, setCompare] = useState(null);
  const [sweep, setSweep] = useState(null);
  const [policyErr, setPolicyErr] = useState(null);
  const [cmpLead, setCmpLead] = useState(null);   // null = use mean of demo lead times
  const [cmpBusy, setCmpBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.supply.overview()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      api.supply.compareDemo({}, ctrl.signal),
      api.supply.sweepDemo(ctrl.signal),
    ])
      .then(([c, s]) => { setCompare(c); setSweep(s); })
      .catch((e) => { if (e.name !== 'AbortError') setPolicyErr(e.message || String(e)); });
    return () => ctrl.abort();
  }, []);

  // Re-run the comparison at a user-chosen lead time (the decision-tool knob).
  const runCompareAt = async (leadTime) => {
    setCmpLead(leadTime); setCmpBusy(true); setPolicyErr(null);
    try {
      setCompare(await api.supply.compareDemo({ leadTime }));
    } catch (e) {
      setPolicyErr(e.message || String(e));
    } finally {
      setCmpBusy(false);
    }
  };

  // Best DEPLOYABLE policy for the current comparison (lowest total cost).
  const bestPolicy = compare
    ? DEPLOYABLE.reduce((best, p) => {
        const c = compare.policies[p]?.total_cost_mean;
        if (c == null) return best;
        return best == null || c < compare.policies[best].total_cost_mean ? p : best;
      }, null)
    : null;

  const openItem = async (id) => {
    setSelected(id); setDetail(null);
    try { setDetail(await api.supply.item(id)); } catch { /* ignore */ }
  };

  const items = data?.items || [];
  const cats = [...new Set(items.map((i) => i.category))];
  const filtered = items.filter((it) =>
    filter === 'All' ? true :
    filter === 'At risk' ? it.status === 'stockout' :
    filter === 'A' || filter === 'B' || filter === 'C' ? it.abc_class === filter :
    it.category === filter);

  if (error) return (
    <div className="content"><PageHero kicker="Operations · Supply" title="Supply Planner" sub="Inventory simulation" />
      <div className="card"><div className="card-body" style={{ color: C.red }}>
        Couldn't load supply data: {error}. Make sure the backend is running on port 8000.
      </div></div>
    </div>
  );

  const k = data?.kpis;     // this representative run (matches the table/ABC)
  const ci = data?.ci;      // 30-seed aggregated means + 95% CIs
  return (
    <div className="content">
      <PageHero
        kicker="Operations · Supply"
        title="Supply Planner"
        sub="Inventory, reorder behaviour and stockouts from a 13-month consumption simulation · 30 items · representative run (seed 1059)"
        image="/images/supply-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="filter" size={14} />Filter</button>
          <button className="btn btn-primary"><Icon name="bell" size={14} />Review {data?.items_at_risk ?? 0} at-risk</button>
        </>}
      />

      <div className="grid-kpi">
        <KPI label="Items at risk" value={k ? k.items_at_risk : '—'} foot={`of ${k?.n_items ?? 0} items`} />
        <KPI label="Total cost (this run)" value={k ? zarShort(k.total_cost_zar) : '—'} foot="holding+ordering+stockout+expiry" />
        <KPI label="Stockout penalty" value={k ? zarShort(k.stockout_cost_zar) : '—'} foot="the main cost driver" />
        <KPI label="Inventory value" value={k ? zarShort(k.inventory_value_zar) : '—'} foot="avg stock × price" />
      </div>

      {ci && (
        <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 12 }}>
          Figures are from one representative run. Across 30 simulation runs (95% CI):
          total cost {zarShort(ci.total_annual_cost_zar.mean)} [{zarShort(ci.total_annual_cost_zar.lo)}–{zarShort(ci.total_annual_cost_zar.hi)}] ·
          stockout incidence {ci.stockout_incidence_pct.mean}% [{ci.stockout_incidence_pct.lo}–{ci.stockout_incidence_pct.hi}] ·
          supplier non-performance {ci.non_performance_rate.mean}% · median lead time {ci.lead_time_median_unflagged_days.mean} days.
        </div>
      )}

      {data && <AiPanel surface="supply" context={data} label="Explain the inventory" />}

      {/* ABC value/cost split */}
      {data?.by_abc && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="card-title">ABC analysis · cost & stock value by class</div></div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px, 100%),1fr))', gap: 14 }}>
            {data.by_abc.map((a) => (
              <div key={a.abc_class} style={{ border: '1px solid #eef0f3', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: ABC[a.abc_class] }} />
                  <strong style={{ color: C.ink }}>Class {a.abc_class}</strong>
                  <span style={{ color: C.muted, fontSize: 12 }}>· {a.items} items</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>Total cost</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{zar(a.cost_zar)}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>Avg stock value {zar(a.inventory_value_zar)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Inventory · {items.length} items</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['All', 'At risk', 'A', 'B', 'C', ...cats].map((f) => (
              <button key={f} className="btn btn-sm" onClick={() => setFilter(f)}
                style={filter === f ? { background: '#e8f1f8', color: C.navy, borderColor: C.navy } : {}}>
                {f === 'A' || f === 'B' || f === 'C' ? `Class ${f}` : f}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll" role="region" tabIndex={0} aria-label="Data table (scrolls sideways on small screens)"><table className="tbl">
          <thead>
            <tr><th>Item</th><th>Category</th><th>ABC</th><th className="num">Use/day</th><th className="num">Days cover</th><th className="num">Service</th><th className="num">Stockouts</th><th className="num">Cost</th><th>Status</th></tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan={9} style={{ color: C.muted, padding: 20 }}>Loading inventory…</td></tr>}
            {filtered.map((it) => (
              <tr key={it.item_id} onClick={() => openItem(it.item_id)} style={{ cursor: 'pointer', background: selected === it.item_id ? '#f0f9ff' : undefined }}>
                <td style={{ fontWeight: 500, color: C.ink }}>{it.item_name}</td>
                <td><span className="tag">{it.category}</span></td>
                <td><span style={{ fontWeight: 700, color: ABC[it.abc_class] }}>{it.abc_class}</span></td>
                <td className="num">{it.mean_daily_consumption}</td>
                <td className="num">{it.days_cover ?? '—'}{it.days_cover != null ? 'd' : ''}</td>
                <td className="num">{it.service_level}%</td>
                <td className="num" style={{ color: it.stockout_events > 0 ? C.red : C.muted }}>{it.stockout_events}</td>
                <td className="num">{zarShort(it.total_cost_zar)}</td>
                <td><span className={`tag ${STATUS[it.status].tag}`}>{STATUS[it.status].label}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* Policy comparison — 6-policy ladder, no-forecast → perfect foresight - */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Which reorder policy is best for you? · 6-policy comparison</div>
            <div className="card-sub">
              Six policies simulated over {compare?.sim_horizon_days ?? 60} days × {compare?.n_seeds ?? 3} seeds
              (common random numbers) at mean lead time{' '}
              {compare?.lead_time_mean_days != null ? `${compare.lead_time_mean_days.toFixed(1)}d` : '—'}
              {compare?.basket ? ` · ${compare.basket}` : ''}.
              {bestPolicy && <> Best deployable policy at this lead time: <b style={{ color: POLICY_COLOR[bestPolicy] }}>{POLICY_LABEL[bestPolicy]}</b>.</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.muted, marginRight: 4 }}>Lead time</span>
            {LEAD_TIME_CHOICES.map((L) => (
              <button key={L} className="btn btn-sm" disabled={cmpBusy}
                onClick={() => runCompareAt(L)}
                style={cmpLead === L ? { background: '#e8f1f8', color: C.navy, borderColor: C.navy } : {}}>
                {L}d
              </button>
            ))}
          </div>
        </div>
        <div className="card-body">
          {policyErr && (
            <div style={{ padding: 12, background: '#fef2f2', color: C.red, borderRadius: 6, fontSize: 12 }}>
              Backend error: {policyErr}. The server may be busy or starting up — try again shortly.
            </div>
          )}
          {!compare && !policyErr && (
            <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>Running four policies against the demo basket…</div>
          )}
          {compare && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px, 100%),1fr))', gap: 12 }}>
              {POLICY_ORDER.map((p) => {
                const s = compare.policies[p];
                if (!s) return null;
                const isWinner = p === bestPolicy;
                const isBenchmark = p === 'oracle';
                const delta = s.delta_vs_baseline_pct;
                return (
                  <div key={p} style={{
                    border: `1px solid ${isWinner ? C.teal : '#e4e7eb'}`,
                    borderRadius: 8, padding: '14px 16px',
                    background: isWinner ? '#ecfeff' : 'white',
                    opacity: cmpBusy ? 0.55 : 1, transition: 'opacity .15s',
                    position: 'relative',
                  }}>
                    {isWinner && (
                      <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 9, fontWeight: 700,
                        color: 'white', background: C.teal, borderRadius: 4, padding: '2px 6px', letterSpacing: 0.5 }}>
                        BEST FOR YOU
                      </span>
                    )}
                    <div style={{ fontSize: 10, fontWeight: 700, color: POLICY_COLOR[p], textTransform: 'uppercase', letterSpacing: 1.2, paddingRight: isWinner ? 70 : 0 }}>
                      {POLICY_LABEL[p]}{isBenchmark && <span style={{ color: C.muted, fontWeight: 500 }}> · ceiling</span>}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: C.ink, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
                      {zar(s.total_cost_mean)}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      total cost · {compare.sim_horizon_days}d sim
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, fontSize: 12 }}>
                      <Row label="Service level" value={`${(s.service_level_mean * 100).toFixed(2)}%`} />
                      <Row label="Stockouts" value={s.stockouts_mean.toFixed(1)} />
                      <Row label="Holding" value={zar(s.holding_mean)} />
                      <Row label="Ordering" value={zar(s.ordering_mean)} />
                      <Row
                        label="vs static (s,S)"
                        value={`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
                        valueColor={p === 'ss_static' ? C.muted : delta > 0 ? '#16a34a' : C.red}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Where forecasting pays — cost vs lead time --------------------------- */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Where forecasting pays · cost vs lead time</div>
            <div className="card-sub">
              {sweep?.crossover_lead_time_days
                ? <>The dynamic forecast-driven policy beats the static (s, S) baseline out to a mean lead time of about <b>{sweep.crossover_lead_time_days} days</b>. To the left, feeding the forecast into a base-stock target buys real cost reduction; to the right, the forecast horizon under-covers the lead-time window and the gain fades.</>
                : 'Comparing forecast-driven vs static (s, S) across a range of mean lead times.'}
            </div>
          </div>
        </div>
        <div className="card-body">
          {!sweep && !policyErr && <div style={{ color: C.muted, fontSize: 13 }}>Sweeping lead times…</div>}
          {sweep && (
            <>
              <LineChart
                height={280}
                xLabels={sweep.lead_times.map((L) => `${L}d`)}
                series={POLICY_ORDER.map((p) => ({
                  data: sweep.series[p],
                  color: POLICY_COLOR[p],
                  dashed: p === 'oracle',
                }))}
              />
              <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                {POLICY_ORDER.map((p) => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155' }}>
                    <span style={{ display: 'inline-block', width: 18, height: 3, background: POLICY_COLOR[p], borderRadius: 2 }} />
                    <span style={{ fontWeight: 600 }}>{POLICY_LABEL[p]}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, borderTop: '1px solid #eef0f3', paddingTop: 12, overflowX: 'auto' }}>
                <div className="table-scroll" role="region" tabIndex={0} aria-label="Data table (scrolls sideways on small screens)"><table className="tbl">
                  <thead>
                    <tr>
                      <th className="num">Lead time</th>
                      {POLICY_ORDER.map((p) => (
                        <th key={p} className="num" style={{ color: POLICY_COLOR[p] }}>{POLICY_SHORT[p]}</th>
                      ))}
                      <th className="num">Dyn vs (s,S)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sweep.rows.map((row) => {
                      const positive = row.dynamic_vs_ss_static_pct >= 0;
                      // Cheapest DEPLOYABLE policy in this row → bold it.
                      const best = DEPLOYABLE.reduce((b, p) =>
                        (row.costs[p] != null && (b == null || row.costs[p] < row.costs[b])) ? p : b, null);
                      return (
                        <tr key={row.lead_time_days}>
                          <td className="num" style={{ fontWeight: 600 }}>{row.lead_time_days}d</td>
                          {POLICY_ORDER.map((p) => (
                            <td key={p} className="num" style={{
                              fontWeight: p === best ? 700 : 400,
                              color: p === best ? C.teal : p === 'oracle' ? C.muted : undefined,
                            }}>{zar(row.costs[p])}</td>
                          ))}
                          <td className="num" style={{ fontWeight: 600, color: positive ? '#16a34a' : C.red }}>
                            {positive ? '+' : ''}{row.dynamic_vs_ss_static_pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Item detail */}
      {selected && (
        <div className="card" style={{ marginTop: 16 }}>
          {!detail && <div className="card-body" style={{ color: C.muted }}>Loading item history…</div>}
          {detail && <ItemDetail detail={detail} onClose={() => { setSelected(null); setDetail(null); }} />}
        </div>
      )}
    </div>
  );
}

function ItemDetail({ detail, onClose }) {
  const it = detail.item;
  const series = detail.series || [];
  const stock = series.map((s) => s.stock);
  const consumption = series.map((s) => s.consumption);
  const xLabels = series.filter((_, i) => i % Math.floor(series.length / 6) === 0).map((s) => {
    const d = new Date(s.date + 'T00:00:00'); return MONTHS[d.getMonth()];
  });
  return (
    <>
      <div className="card-header">
        <div>
          <div className="card-title">{it.item_name} <span style={{ color: ABC[it.abc_class], fontWeight: 700 }}>· {it.abc_class}</span></div>
          <div className="card-sub">{it.category} · {it.unit} · {zar(it.unit_price_zar)}/unit · lead time {it.lead_time_days} days · {it.service_level}% service</div>
        </div>
        <button className="btn btn-sm" onClick={onClose}><Icon name="logout" size={12} /> Close</button>
      </div>
      <div className="card-body">
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Stock on hand (units)</div>
        <LineChart series={[{ data: stock, color: C.navy }]} height={180} xLabels={xLabels} />
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, margin: '14px 0 6px' }}>Daily consumption (units)</div>
        <LineChart series={[{ data: consumption, color: C.teal }]} height={140} xLabels={xLabels} />
      </div>
    </>
  );
}

function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor || '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
