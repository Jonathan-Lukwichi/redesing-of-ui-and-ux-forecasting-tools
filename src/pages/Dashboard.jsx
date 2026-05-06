import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';
import { LineChart, BarChart, Donut } from '../components/Charts';

const last30 = [120,135,128,142,148,138,145,152,160,155,148,162,158,165,170,168,172,175,168,178,180,175,182,188,184,190,186,192,195,198];
const next7 = [195,200,218,232,215,188,174];
const dowAvg = [142,156,168,175,184,162,138];
const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const histActual = [...last30, ...Array(7).fill(null)];
const forecastLine = [...Array(29).fill(null), last30[29], ...next7];
const forecastUpper = [...Array(29).fill(null), last30[29], ...next7.map((v) => v * 1.12)];
const forecastLower = [...Array(29).fill(null), last30[29], ...next7.map((v) => v * 0.88)];

export default function Dashboard({ onNavigate }) {
  return (
    <div className="content">
      <PageHero
        kicker="Operations · Live"
        title="Operations Dashboard"
        sub="Memorial General Hospital · pipeline status, KPIs, today's forecast and open actions"
        image="/images/dashboard-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="refresh" size={14} />Refresh</button>
          <button className="btn"><Icon name="download" size={14} />Export</button>
        </>}
      />

      {/* Pipeline status */}
      <div className="steps">
        <div className="step done"><span className="step-num">✓</span>Data ingested</div>
        <span className="step-arrow">›</span>
        <div className="step done"><span className="step-num">✓</span>4 models trained</div>
        <span className="step-arrow">›</span>
        <div className="step current"><span className="step-num">3</span>Forecasts ready</div>
        <span className="step-arrow">›</span>
        <div className="step done"><span className="step-num">✓</span>Staff plan</div>
        <span className="step-arrow">›</span>
        <div className="step done"><span className="step-num">✓</span>Supply plan</div>
        <div style={{ marginLeft: 'auto', paddingRight: 8 }}>
          <span className="tag tag-success"><span className="dot" /> Pipeline healthy</span>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPI label="Today's forecast" value="195" unit="patients" trend="+8.3%" trendDir="up" foot="vs. 30-day avg" spark={last30.slice(-14)} sparkColor="#1e6091" />
        <KPI label="7-day total" value="1,422" unit="patients" trend="+5.1%" trendDir="up" foot="vs. last week" spark={next7} sparkColor="#0d9488" />
        <KPI label="Peak day" value="232" unit="Thu" trend="+18.4%" trendDir="up" foot="vs. baseline" spark={[180,195,210,232,215,188,174]} sparkColor="#d97706" />
        <KPI label="Best model MAPE" value="6.4" unit="%" trend="-0.8%" trendDir="up" foot="LightGBM v3.2" spark={[8.2,7.8,7.5,7.1,6.9,6.6,6.4]} sparkColor="#7c3aed" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Patient arrivals — 30 day history + 7 day forecast</div>
              <div className="card-sub">LightGBM model · 95% prediction interval shaded</div>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b' }}>
              <span><span className="dot" style={{ color: '#475569' }} /> Historical</span>
              <span><span className="dot" style={{ color: '#0d9488' }} /> Forecast</span>
              <span><span className="dot" style={{ color: '#0d9488', opacity: 0.3 }} /> 95% PI</span>
            </div>
          </div>
          <div className="card-body">
            <LineChart
              series={[
                { data: histActual.map((v) => v ?? 0), color: '#475569' },
                { data: forecastLine.map((v) => v ?? 0), color: '#0d9488', band: { upper: forecastUpper.map((v) => v ?? 0), lower: forecastLower.map((v) => v ?? 0) } },
              ]}
              xLabels={['−30d','−25','−20','−15','−10','−5','Today','+2','+4','+6','+7d']}
              height={260}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Day-of-week pattern</div></div>
          <div className="card-body">
            <BarChart data={dowAvg} labels={days} color="#1e6091" height={220} />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Average daily arrivals by weekday · last 12 weeks</div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Model leaderboard</div>
            <a style={{ fontSize: 12, color: '#1e6091', cursor: 'pointer' }} onClick={() => onNavigate('results')}>View all</a>
          </div>
          <table className="tbl">
            <thead><tr><th>Model</th><th>MAPE</th><th>RMSE</th></tr></thead>
            <tbody>
              <tr><td><span className="tag tag-brand">LightGBM</span></td><td className="num">6.4%</td><td className="num">11.2</td></tr>
              <tr><td><span className="tag">XGBoost</span></td><td className="num">7.1%</td><td className="num">12.6</td></tr>
              <tr><td><span className="tag">Prophet</span></td><td className="num">8.3%</td><td className="num">14.8</td></tr>
              <tr><td><span className="tag">SARIMA</span></td><td className="num">9.7%</td><td className="num">17.2</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Clinical category mix</div></div>
          <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Donut size={140} thickness={22} data={[
              { value: 28, color: '#1e6091' },
              { value: 22, color: '#0d9488' },
              { value: 16, color: '#d97706' },
              { value: 14, color: '#7c3aed' },
              { value: 11, color: '#dc2626' },
              { value: 9, color: '#475569' },
            ]} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, flex: 1 }}>
              {[['Respiratory',28,'#1e6091'],['Cardiac',22,'#0d9488'],['Trauma',16,'#d97706'],['GI',14,'#7c3aed'],['Infectious',11,'#dc2626'],['Other',9,'#475569']].map(([n,v,c]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, background: c, borderRadius: 2 }} />
                  <span style={{ flex: 1, color: '#334155' }}>{n}</span>
                  <span className="tnum mono" style={{ color: '#0f172a', fontWeight: 600, fontSize: 11 }}>{v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Open actions</div>
            <span className="tag tag-warning">12 pending</span>
          </div>
          <div style={{ padding: '0 16px' }}>
            {[
              { p: 'danger', t: 'Add 2 RNs to Thursday PM shift', s: 'Forecast spike +18%' },
              { p: 'warning', t: 'Reorder 80 N95 masks', s: 'ROP reached' },
              { p: 'warning', t: 'Cardiac overflow plan', s: 'Beds projected 94%' },
              { p: 'info', t: 'Approve Dr. Chen swap', s: 'Wed AM ↔ Fri PM' },
            ].map((a, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: i < 3 ? '1px solid #eef0f3' : 'none', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className={'tag tag-' + a.p} style={{ marginTop: 2 }}>
                  {a.p === 'danger' ? 'Critical' : a.p === 'warning' ? 'High' : 'Med'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{a.t}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{a.s}</div>
                </div>
              </div>
            ))}
            <div style={{ padding: '10px 0' }}>
              <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('actions')}>
                View all actions →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
