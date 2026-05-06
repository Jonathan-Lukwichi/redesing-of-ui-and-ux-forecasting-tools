import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { LineChart } from '../components/Charts';

const series = Array.from({ length: 60 }, (_, i) => 140 + Math.sin(i / 4) * 25 + i * 0.4);

export default function Baselines() {
  return (
    <div className="content">
      <PageHero
        kicker="Modeling · Step 1"
        title="Baseline Models"
        sub="Establish a benchmark before training ML models · naïve, seasonal naïve, exponential smoothing, Holt-Winters, SARIMA"
        image="/images/prepare-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="refresh" size={14} />Retrain</button>
          <button className="btn btn-primary"><Icon name="play" size={14} />Run all</button>
        </>}
      />

      <div className="layout-aside">
        {/* Configuration */}
        <div className="card">
          <div className="card-header"><div className="card-title">Configuration</div></div>
          <div className="card-body">
            <div className="field-group" style={{ marginBottom: 14 }}>
              <label className="label">Target</label>
              <select className="select"><option>Patient arrivals (daily)</option></select>
            </div>
            <div className="field-group" style={{ marginBottom: 14 }}>
              <label className="label">Train / test split</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" defaultValue="80" />
                <input className="input" defaultValue="20" />
              </div>
            </div>
            <div className="field-group" style={{ marginBottom: 14 }}>
              <label className="label">Forecast horizon</label>
              <select className="select"><option>7 days</option><option>14 days</option></select>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: '#334155', margin: '16px 0 10px' }}>Baselines to run</div>
            {[
              ['Naïve (last value)', true],
              ['Seasonal naïve (lag-7)', true],
              ['Moving average', true],
              ['Exponential smoothing', true],
              ['Holt-Winters', true],
              ['SARIMA', false],
            ].map(([n, on]) => (
              <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked={on} /> {n}
              </label>
            ))}

            <div style={{ marginTop: 16, padding: 12, background: '#fafbfc', borderRadius: 6, fontSize: 12, color: '#64748b' }}>
              <strong style={{ color: '#0f172a' }}>Why baselines?</strong> Any ML model must beat these benchmarks to be worth deploying.
            </div>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Baseline forecast — test fold</div>
                <div className="card-sub">Last 244 days · all 5 baselines overlaid</div>
              </div>
            </div>
            <div className="card-body">
              <LineChart
                series={[
                  { data: series, color: '#94a3b8' },
                  { data: series.map((v) => v * 1.02), color: '#1e6091', dashed: true },
                  { data: series.map((v) => v * 0.95), color: '#0d9488', dashed: true },
                  { data: series.map((v) => v * 1.06), color: '#d97706', dashed: true },
                ]}
                xLabels={['','−200d','','−150','','−100','','−50','','Today']}
                height={220}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Baseline performance · ranked by MAPE</div></div>
            <table className="tbl">
              <thead><tr><th>#</th><th>Model</th><th>MAPE</th><th>RMSE</th><th>MAE</th><th>Train (s)</th><th></th></tr></thead>
              <tbody>
                {[
                  [1,'Holt-Winters',9.2,16.1,12.4,0.3,'best'],
                  [2,'SARIMA',9.7,17.2,13.0,4.1,''],
                  [3,'Seasonal naïve (lag-7)',11.4,19.8,15.2,0.0,''],
                  [4,'Exponential smoothing',12.8,22.0,17.1,0.2,''],
                  [5,'Moving avg (7d)',14.1,24.2,18.6,0.0,''],
                  [6,'Naïve',18.4,31.5,24.0,0.0,'worst'],
                ].map((r, i) => (
                  <tr key={i} style={{ background: i === 0 ? '#f0f5fa' : 'transparent' }}>
                    <td style={{ width: 30 }} className="num">{r[0]}</td>
                    <td>{r[1]}{r[6] === 'best' && <span className="tag tag-success" style={{ marginLeft: 8 }}>Best</span>}</td>
                    <td className="num">{r[2]}%</td>
                    <td className="num">{r[3]}</td>
                    <td className="num">{r[4]}</td>
                    <td className="num">{r[5]}s</td>
                    <td style={{ width: 60 }}><a style={{ fontSize: 12, color: '#1e6091', cursor: 'pointer' }}>Inspect</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
