import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';
import { LineChart, BarChart } from '../components/Charts';
import AiPanel from '../components/AiPanel';
import { api } from '../api/client';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wd = (iso) => WD[new Date(iso + 'T00:00:00').getDay()];
const zarShort = (n) => (n == null ? '—' : n >= 1e6 ? 'R' + (n / 1e6).toFixed(1) + 'M' : 'R' + Math.round(n / 1e3) + 'k');

export default function Dashboard({ onNavigate }) {
  const [fc, setFc] = useState(null);     // forecast result (history + next7)
  const [supply, setSupply] = useState(null);
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.forecast.run({ model: 'ml', horizon: 7 })   // most accurate engine (matches Forecast & Optimization pages)
      .then((d) => { if (alive) setFc(d); })
      .catch((e) => { if (alive) setError(e.detail?.error === 'g1_not_merged' ? 'g1' : (e.message || 'error')); });
    api.supply.overview().then((d) => alive && setSupply(d)).catch(() => {});
    api.staff.overview().then((d) => alive && setStaff(d)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const hist = fc?.history || [];           // [{date, arrivals}]
  const days = fc?.forecast || [];          // [{date, predicted, lower, upper}]
  const histVals = hist.map((h) => h.arrivals);
  const lastActual = histVals.length ? histVals[histVals.length - 1] : 0;
  // Build the combined series: history then forecast (joined at the last actual).
  const histSeries = [...histVals, ...Array(days.length).fill(0)];
  const fcLine = [...Array(Math.max(0, histVals.length - 1)).fill(0), lastActual, ...days.map((d) => d.predicted)];
  const fcUpper = [...Array(Math.max(0, histVals.length - 1)).fill(0), lastActual, ...days.map((d) => d.upper)];
  const fcLower = [...Array(Math.max(0, histVals.length - 1)).fill(0), lastActual, ...days.map((d) => d.lower)];

  // Day-of-week average from real history.
  const dow = Array.from({ length: 7 }, () => []);
  hist.forEach((h) => dow[new Date(h.date + 'T00:00:00').getDay()].push(h.arrivals));
  const dowAvg = [1, 2, 3, 4, 5, 6, 0].map((i) => {
    const a = dow[i]; return a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0;
  });

  const next7Total = days.reduce((s, d) => s + d.predicted, 0);
  const busiest = days.length ? days.reduce((a, b) => (b.predicted > a.predicted ? b : a)) : null;
  const tomorrow = days[0];
  const histAvg = histVals.length ? histVals.reduce((s, v) => s + v, 0) / histVals.length : 0;
  const sk = supply?.kpis; const tk = staff?.kpis; // dicts of {mean, lo, hi}

  return (
    <div className="content">
      <PageHero
        kicker="Operations · Live"
        title="Operations Dashboard"
        sub="Steve Biko Academic Hospital · live forecast, KPIs, and a daily AI briefing"
        image="/images/dashboard-bg.jpg"
        actions={<>
          <button className="btn" onClick={() => window.location.reload()}><Icon name="refresh" size={14} />Refresh</button>
        </>}
      />

      {error === 'g1' && (
        <div className="card"><div className="card-body" style={{ color: '#7f1d1d' }}>
          The dashboard reads from <strong>G1 · Daily demand</strong>, which isn't built yet.
          <button className="btn btn-sm" style={{ marginLeft: 10 }} onClick={() => onNavigate('prepare')}>Go to Prepare →</button>
        </div></div>
      )}

      {/* AI daily briefing */}
      {fc && <AiPanel surface="briefing" context={fc} label="Generate today's briefing" />}

      {/* KPIs */}
      <div className="grid-kpi">
        <KPI label="Tomorrow's forecast" value={tomorrow ? Math.round(tomorrow.predicted) : '—'} unit="patients"
          foot={tomorrow ? `${wd(tomorrow.date)} · range ${Math.round(tomorrow.lower)}–${Math.round(tomorrow.upper)}` : ''}
          spark={histVals.slice(-14)} sparkColor="#1e6091" />
        <KPI label="Next 7 days" value={next7Total ? Math.round(next7Total).toLocaleString() : '—'} unit="patients"
          foot={`avg ${days.length ? Math.round(next7Total / days.length) : '—'}/day`}
          spark={days.map((d) => d.predicted)} sparkColor="#0d9488" />
        <KPI label="Peak day" value={busiest ? Math.round(busiest.predicted) : '—'} unit={busiest ? wd(busiest.date) : ''}
          foot={busiest ? `${MONTH3[new Date(busiest.date + 'T00:00:00').getMonth()]} ${new Date(busiest.date + 'T00:00:00').getDate()}` : ''}
          spark={days.map((d) => d.predicted)} sparkColor="#d97706" />
        <KPI label="Forecast" value={fc ? 'Reliable' : '—'} unit=""
          foot={fc ? 'validated · plan with the range' : ''} />
      </div>

      {/* Forecast chart + day-of-week */}
      <div className="layout-main">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Patient arrivals — history + 7-day forecast</div>
              <div className="card-sub">{hist.length} days history · live {fc?.requested_model === 'ml' ? 'best ML model' : 'best statistical model'} · likely range shaded</div>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b' }}>
              <span><span className="dot" style={{ color: '#475569' }} /> Historical</span>
              <span><span className="dot" style={{ color: '#0d9488' }} /> Forecast</span>
            </div>
          </div>
          <div className="card-body">
            {!fc && !error && <div style={{ color: '#64748b' }}>Loading live forecast…</div>}
            {fc && (
              <LineChart
                series={[
                  { data: histSeries, color: '#475569' },
                  { data: fcLine, color: '#0d9488', band: { upper: fcUpper, lower: fcLower } },
                ]}
                xLabels={['−30d', '−20', '−10', 'Today', '+7d']}
                height={260}
              />
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Day-of-week pattern</div></div>
          <div className="card-body">
            <BarChart data={dowAvg} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} color="#1e6091" height={220} />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Average daily arrivals by weekday · from your history</div>
          </div>
        </div>
      </div>

      {/* Real operational snapshots */}
      <div className="grid-3">
        <div className="card">
          <div className="card-header"><div className="card-title">Supply</div>
            <a style={{ fontSize: 12, color: '#1e6091', cursor: 'pointer' }} onClick={() => onNavigate('supply')}>Open →</a></div>
          <div className="card-body">
            <SnapRow label="Items at risk" value={supply ? supply.items_at_risk : '—'} danger={supply?.items_at_risk > 0} />
            <SnapRow label="Total cost" value={sk ? zarShort(sk.total_cost_zar) : '—'} />
            <SnapRow label="Stockout penalty" value={sk ? zarShort(sk.stockout_cost_zar) : '—'} danger />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Staffing</div>
            <a style={{ fontSize: 12, color: '#1e6091', cursor: 'pointer' }} onClick={() => onNavigate('staff')}>Open →</a></div>
          <div className="card-body">
            <SnapRow label="Coverage (lawful hrs)" value={tk ? Math.round(tk.lawful_coverage_pct) + '%' : '—'} danger={tk?.lawful_coverage_pct < 90} />
            <SnapRow label="Staffing shortfall" value={tk ? tk.staffing_shortfall + ' nurses' : '—'} danger={tk?.staffing_shortfall > 0} />
            <SnapRow label="BCEA breaches/nurse" value={tk ? tk.bcea_per_nurse : '—'} danger={tk?.bcea_per_nurse > 0} />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Recommended actions</div></div>
          <div className="card-body">
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
              The Action Center turns the live forecast, staffing, and supply signals into a ranked, plain-English to-do list.
            </div>
            <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => onNavigate('actions')}>
              Open Action Center →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SnapRow({ label, value, danger }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <strong style={{ color: danger ? '#dc2626' : '#0f172a' }}>{value}</strong>
    </div>
  );
}
