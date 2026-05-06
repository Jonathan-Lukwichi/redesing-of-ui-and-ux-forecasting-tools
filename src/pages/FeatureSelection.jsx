import { useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';
import { LineChart, Sparkline } from '../components/Charts';

export default function FeatureSelection() {
  const [method, setMethod] = useState('By Lasso coef');

  return (
    <div className="content">
      <PageHero
        kicker="Modeling · Feature selection"
        title="Feature Selection"
        sub="Reduce 74 features to a parsimonious set using Lasso, mutual information, and gradient-boosting importance"
        image="/images/prepare-bg.jpg"
        actions={<button className="btn btn-primary"><Icon name="play" size={14} />Run selection</button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPI label="Selected" value="18" unit="of 74" foot="76% reduction" />
        <KPI label="Method" value="Lasso CV" foot="α = 0.024" />
        <KPI label="Test MAPE" value="6.8" unit="%" trend="-0.4%" trendDir="up" foot="vs. all features" />
        <KPI label="Train time" value="−42" unit="%" foot="faster downstream" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Selected features (top 18)</div>
            <select className="select" style={{ width: 160, height: 30, fontSize: 12 }} value={method} onChange={(e) => setMethod(e.target.value)}>
              {['By Lasso coef', 'By GB importance', 'By Mutual Info'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <table className="tbl">
            <thead><tr><th>Feature</th><th>Family</th><th className="num">|β|</th><th className="num">GB imp.</th><th className="num">MI</th><th>Status</th></tr></thead>
            <tbody>
              {[
                ['lag_7','Lag',0.812,0.95,0.71],
                ['temperature_max','Weather',0.624,0.78,0.58],
                ['day_of_week','Temporal',0.541,0.66,0.52],
                ['lag_1','Lag',0.487,0.58,0.47],
                ['rolling_mean_14','Rolling',0.421,0.51,0.42],
                ['is_holiday','Calendar',0.384,0.43,0.39],
                ['humidity_avg','Weather',0.312,0.36,0.34],
                ['month','Temporal',0.267,0.31,0.29],
                ['air_quality_idx','Weather',0.214,0.24,0.22],
                ['is_school_day','Calendar',0.184,0.19,0.18],
                ['lag_30','Lag',0.142,0.15,0.16],
                ['precipitation','Weather',0.118,0.11,0.13],
              ].map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: '#1e6091' }}>{r[0]}</td>
                  <td><span className="tag" style={{ fontSize: 10 }}>{r[1]}</span></td>
                  <td className="num">{r[2].toFixed(3)}</td>
                  <td className="num">{r[3].toFixed(2)}</td>
                  <td className="num">{r[4].toFixed(2)}</td>
                  <td><span className="tag tag-success">Selected</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Lasso path</div></div>
          <div className="card-body">
            <LineChart
              series={[
                { data: [0.95,0.82,0.71,0.58,0.42,0.31,0.24,0.18,0.12,0.08,0.05,0.03], color: '#1e6091' },
                { data: [0.78,0.66,0.54,0.42,0.31,0.22,0.17,0.13,0.09,0.06,0.04,0.02], color: '#0d9488' },
                { data: [0.66,0.55,0.44,0.32,0.23,0.17,0.13,0.10,0.07,0.05,0.03,0.02], color: '#d97706' },
                { data: [0.58,0.47,0.38,0.28,0.20,0.15,0.11,0.08,0.06,0.04,0.03,0.01], color: '#7c3aed' },
              ]}
              xLabels={['10⁻³','','10⁻²','','α=0.024','','10⁻¹','','1','','10']}
              height={200}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Coefficient magnitude vs. regularization · vertical line shows optimal α</div>
          </div>

          <div className="card-header" style={{ borderTop: '1px solid #eef0f3' }}>
            <div className="card-title">CV score</div>
          </div>
          <div className="card-body">
            <Sparkline data={[8.4,7.8,7.2,6.9,6.8,6.85,7.1,7.4,7.9,8.6]} color="#1e6091" width={300} height={60} />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Test MAPE bottoms at 18 features · α = 0.024</div>
          </div>
        </div>
      </div>
    </div>
  );
}
