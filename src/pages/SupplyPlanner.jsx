import { useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';
import { Sparkline } from '../components/Charts';

const ITEMS = [
  { sku: 'N95-3M-1860', n: 'N95 Respirator (3M 1860)', c: 'PPE', h: 78, r: 120, d: 3.2, s: 'low', spark: [200, 180, 160, 140, 120, 100, 78] },
  { sku: 'GLOVE-NIT-M', n: 'Nitrile gloves (M)', c: 'PPE', h: 4200, r: 3000, d: 14.0, s: 'ok', spark: [4400, 4350, 4300, 4280, 4250, 4220, 4200] },
  { sku: 'IV-SAL-1L', n: 'IV Saline 1L', c: 'Fluids', h: 142, r: 200, d: 2.8, s: 'low', spark: [320, 280, 240, 200, 180, 160, 142] },
  { sku: 'SYRG-10ML', n: 'Syringe 10mL', c: 'Disposable', h: 1840, r: 800, d: 22.0, s: 'ok', spark: [1900, 1880, 1870, 1860, 1850, 1845, 1840] },
  { sku: 'OXY-MASK-A', n: 'Oxygen mask (adult)', c: 'Resp', h: 64, r: 80, d: 4.1, s: 'low', spark: [160, 140, 120, 100, 90, 75, 64] },
  { sku: 'EPI-1MG', n: 'Epinephrine 1mg', c: 'Pharm', h: 218, r: 150, d: 18.5, s: 'ok', spark: [240, 235, 230, 225, 222, 220, 218] },
  { sku: 'BAND-EL-4', n: 'Elastic bandage 4"', c: 'Wound', h: 412, r: 200, d: 28.0, s: 'excess', spark: [380, 390, 395, 400, 405, 410, 412] },
];

export default function SupplyPlanner() {
  const [filter, setFilter] = useState('All');

  const filtered = filter === 'All' ? ITEMS :
    filter === 'At ROP' ? ITEMS.filter((it) => it.h < it.r) :
    filter === 'Low stock' ? ITEMS.filter((it) => it.s === 'low') :
    ITEMS.filter((it) => it.s === 'excess');

  return (
    <div className="content">
      <PageHero
        kicker="Planning · Supply"
        title="Supply Planner"
        sub="Inventory levels, reorder points, and projected stockouts driven by the demand forecast · 247 SKUs across PPE, fluids, pharm, disposables"
        image="/images/supply-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="filter" size={14} />Filter</button>
          <button className="btn btn-primary"><Icon name="bell" size={14} />Send orders (3)</button>
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPI label="Service level" value="98.2" unit="%" trend="+0.4%" trendDir="up" foot="last 30 days" />
        <KPI label="Items at ROP" value="3" trend="+1" trendDir="down" foot="reorder needed" />
        <KPI label="Stockouts (forecast)" value="0" foot="next 7 days" />
        <KPI label="Inventory value" value="$1.42M" foot="across 247 SKUs" />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Inventory · 247 SKUs</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['All', 'At ROP', 'Low stock', 'Excess'].map((f) => (
              <button
                key={f}
                className="btn btn-sm"
                onClick={() => setFilter(f)}
                style={filter === f ? { background: '#e8f1f8', color: '#1e6091', borderColor: '#1e6091' } : {}}
              >{f}</button>
            ))}
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>SKU</th><th>Item</th><th>Category</th><th className="num">On hand</th><th className="num">ROP</th><th className="num">Days cover</th><th>Trend</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.sku}>
                <td className="mono" style={{ color: '#1e6091' }}>{it.sku}</td>
                <td style={{ fontWeight: 500, color: '#0f172a' }}>{it.n}</td>
                <td><span className="tag">{it.c}</span></td>
                <td className="num">{it.h}</td>
                <td className="num" style={{ color: '#64748b' }}>{it.r}</td>
                <td className="num">{it.d}d</td>
                <td><Sparkline data={it.spark} color={it.s === 'low' ? '#dc2626' : it.s === 'excess' ? '#d97706' : '#0d9488'} width={80} height={22} /></td>
                <td>
                  {it.s === 'low' ? <span className="tag tag-danger">Below ROP</span> :
                   it.s === 'excess' ? <span className="tag tag-warning">Excess</span> :
                   <span className="tag tag-success">OK</span>}
                </td>
                <td><button className="btn btn-sm">Order</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
