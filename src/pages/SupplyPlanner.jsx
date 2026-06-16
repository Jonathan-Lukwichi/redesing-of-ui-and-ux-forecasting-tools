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

export default function SupplyPlanner() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let alive = true;
    api.supply.overview()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

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
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
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
        <table className="tbl">
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
        </table>
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
