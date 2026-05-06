import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';

// Fixed scatter points (no Math.random)
const scatterPoints = Array.from({ length: 80 }, (_, i) => {
  const t = i / 79;
  const x = 20 + t * 250;
  const offset = (((i * 7919 + 13) % 23) - 11.5) * 2;
  const y = 180 - t * 160 + offset;
  return { x, y };
});

export default function ModelResults() {
  return (
    <div className="content">
      <PageHero
        kicker="Modeling · Results"
        title="Model Results"
        sub="Comprehensive comparison · Diebold-Mariano tests, residual diagnostics, SHAP explainability across all trained models"
        image="/images/results-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="download" size={14} />Download report</button>
          <button className="btn btn-primary"><Icon name="check" size={14} />Promote LightGBM v3.2</button>
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPI label="Best model" value="LightGBM" unit="v3.2" foot="MAPE 6.4%" />
        <KPI label="Skill score" value="+38" unit="%" trend="vs. naïve" trendDir="up" />
        <KPI label="DM test" value="p < 0.01" foot="significantly better" />
        <KPI label="Coverage" value="94.2" unit="%" foot="95% PI calibrated" />
      </div>

      {/* Comparison table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Model comparison · 7 trained models · 5-fold CV</div>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>#</th><th>Model</th><th className="num">MAPE</th><th className="num">RMSE</th><th className="num">MAE</th><th className="num">sMAPE</th><th className="num">Skill</th><th>DM vs. best</th><th>Diagnostics</th></tr>
          </thead>
          <tbody>
            {[
              [1,'LightGBM v3.2',6.4,11.2,8.4,6.1,'+38%','—','ok'],
              [2,'Stacked ensemble',6.7,11.6,8.8,6.4,'+36%','p=0.42','ok'],
              [3,'XGBoost',7.1,12.6,9.3,6.8,'+33%','p=0.04 *','ok'],
              [4,'LSTM',7.4,13.1,9.7,7.0,'+31%','p=0.02 *','ok'],
              [5,'ANN',7.8,13.8,10.2,7.4,'+28%','p<0.01 **','warn'],
              [6,'SARIMAX',9.2,16.1,12.4,8.8,'+18%','p<0.01 **','warn'],
              [7,'ARIMA',11.4,19.8,15.2,10.8,'+5%','p<0.01 **','fail'],
            ].map((r, i) => (
              <tr key={i} style={{ background: i === 0 ? '#f0f5fa' : 'transparent' }}>
                <td className="num" style={{ width: 28 }}>{r[0]}</td>
                <td>{r[1]}{i === 0 && <span className="tag tag-success" style={{ marginLeft: 8 }}>Champion</span>}</td>
                <td className="num">{r[2]}%</td>
                <td className="num">{r[3]}</td>
                <td className="num">{r[4]}</td>
                <td className="num">{r[5]}%</td>
                <td className="num" style={{ color: '#16a34a', fontWeight: 600 }}>{r[6]}</td>
                <td className="mono" style={{ fontSize: 11 }}>{r[7]}</td>
                <td>
                  {r[8] === 'ok' ? <span className="tag tag-success">Pass</span> :
                   r[8] === 'warn' ? <span className="tag tag-warning">Warn</span> :
                   <span className="tag tag-danger">Fail</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Residual diagnostics · LightGBM</div></div>
          <div style={{ padding: '8px 16px 16px' }}>
            {[
              ['Ljung-Box (Q)','p = 0.34','pass'],
              ['Shapiro-Wilk','p = 0.08','pass'],
              ['Breusch-Pagan','p = 0.21','pass'],
              ['Bias (mean residual)','+1.2','warn'],
              ['ACF lag-1','0.04','pass'],
              ['ACF lag-7','0.11','pass'],
            ].map(([l,v,s]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eef0f3' }}>
                <span style={{ fontSize: 13, color: '#475569' }}>{l}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono tnum" style={{ fontSize: 12, color: '#0f172a' }}>{v}</span>
                  <span className={'tag tag-' + (s === 'pass' ? 'success' : 'warning')}>{s === 'pass' ? '✓' : '!'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Actual vs. predicted</div></div>
          <div className="card-body">
            <svg viewBox="0 0 280 200" width="100%" height="200">
              <line x1="20" y1="180" x2="270" y2="180" stroke="#cbd5e1" />
              <line x1="20" y1="20" x2="20" y2="180" stroke="#cbd5e1" />
              <line x1="20" y1="180" x2="270" y2="20" stroke="#0d9488" strokeDasharray="4 4" strokeWidth="1.5" />
              {scatterPoints.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r="2.5" fill="#1e6091" opacity="0.55" />
              ))}
              <text x="20" y="195" fontSize="10" fill="#64748b">80</text>
              <text x="270" y="195" fontSize="10" fill="#64748b" textAnchor="end">260</text>
              <text x="14" y="180" fontSize="10" fill="#64748b" textAnchor="end">80</text>
              <text x="14" y="24" fontSize="10" fill="#64748b" textAnchor="end">260</text>
            </svg>
            <div style={{ fontSize: 11, color: '#64748b' }}>R² = 0.93 · 244 test points</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">SHAP — top contributors</div></div>
          <div style={{ padding: '8px 16px 16px' }}>
            {[
              ['lag_7',0.42,'+'],
              ['temperature_max',0.31,'−'],
              ['day_of_week',0.24,'+'],
              ['is_holiday',0.18,'+'],
              ['rolling_mean_14',0.14,'+'],
              ['humidity_avg',0.11,'+'],
              ['month',0.08,'+'],
            ].map(([n,v,s]) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                <span className="mono" style={{ width: 110, fontSize: 12, color: '#334155' }}>{n}</span>
                <div style={{ flex: 1, height: 10, background: '#f0f2f5', borderRadius: 2, position: 'relative', display: 'flex' }}>
                  <div style={{ width: '50%', display: 'flex', justifyContent: 'flex-end' }}>
                    {s === '−' && <div style={{ width: `${v * 200}%`, background: '#dc2626' }} />}
                  </div>
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#cbd5e1' }} />
                  <div style={{ width: '50%' }}>
                    {s === '+' && <div style={{ width: `${v * 200}%`, background: '#1e6091' }} />}
                  </div>
                </div>
                <span className="mono tnum" style={{ width: 40, fontSize: 11, textAlign: 'right', color: s === '+' ? '#1e6091' : '#dc2626' }}>{s}{v.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
