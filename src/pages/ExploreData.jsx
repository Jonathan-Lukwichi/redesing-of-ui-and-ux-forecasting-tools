import { useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { LineChart, Heatmap } from '../components/Charts';

const TABS = ['Time series', 'Distribution', 'Seasonality', 'Correlations', 'Stationarity tests'];

const series = Array.from({ length: 60 }, (_, i) => 140 + Math.sin(i / 4) * 25 + Math.cos(i / 9) * 18 + (i * 0.5));

// Fixed heatmap data (7 rows × 24 cols)
const heatData = [
  [58,42,45,51,68,82,94,108,125,130,128,120,110,105,98,102,115,122,118,110,95,82,68,54],
  [52,40,43,49,65,79,91,105,122,128,126,118,108,103,96,100,113,120,116,108,92,78,64,50],
  [60,44,47,53,70,84,96,110,127,132,130,122,112,107,100,104,117,124,120,112,97,84,70,56],
  [65,48,51,57,74,88,100,114,131,136,134,126,116,111,104,108,121,128,124,116,101,88,74,60],
  [62,46,49,55,72,86,98,112,129,134,132,124,114,109,102,106,119,126,122,114,99,86,72,58],
  [48,35,38,44,61,75,87,101,118,123,121,113,103,98,91,95,108,115,111,103,88,75,61,47],
  [42,30,33,39,56,70,82,96,113,118,116,108,98,93,86,90,103,110,106,98,83,70,56,42],
];

export default function ExploreData() {
  const [tab, setTab] = useState(0);

  return (
    <div className="content">
      <PageHero
        kicker="Data · EDA"
        title="Explore Data"
        sub="Distributions, seasonality, correlations · informs feature selection and model choice"
        image="/images/explore-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="filter" size={14} />Filters</button>
          <button className="btn"><Icon name="download" size={14} />Export</button>
        </>}
      />

      <div className="tabs">
        {TABS.map((t, i) => (
          <div key={t} className={'tab' + (tab === i ? ' active' : '')} onClick={() => setTab(i)}>
            {i === 0 && <Icon name="chart" size={13} />}{t}
          </div>
        ))}
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        {[
          { l: 'Mean', v: '164.2' },
          { l: 'Median', v: '162.0' },
          { l: 'Std dev', v: '28.4' },
          { l: 'Min / Max', v: '82 / 251' },
          { l: 'Trend', v: '+0.42 /d', c: '#16a34a' },
          { l: 'Strongest cycle', v: '7.0 d' },
        ].map((s) => (
          <div key={s.l} style={{ padding: '10px 14px', background: 'white', border: '1px solid #e4e7eb', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.l}</div>
            <div className="mono tnum" style={{ fontSize: 17, fontWeight: 600, color: s.c || '#0f172a', marginTop: 2 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Main time series */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Patient arrivals — full history with trend & seasonality</div>
            <div className="card-sub">Daily, 2023-01-01 → 2026-04-30</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm">Raw</button>
            <button className="btn btn-sm" style={{ background: '#e8f1f8', color: '#1e6091', borderColor: '#1e6091' }}>Decomposed</button>
            <button className="btn btn-sm">Log</button>
          </div>
        </div>
        <div className="card-body">
          <LineChart
            series={[
              { data: series, color: '#475569' },
              { data: series.map((_, i) => 140 + i * 0.5), color: '#1e6091', dashed: true },
            ]}
            xLabels={['2023','Q2','Q3','Q4','2024','Q2','Q3','Q4','2025','Q2','Q3']}
            height={220}
          />
        </div>
      </div>

      {/* Seasonality + correlations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Hour-of-day × day-of-week heatmap</div>
            <div className="card-sub">Average patient arrivals</div>
          </div>
          <div className="card-body">
            <Heatmap
              data={heatData}
              rows={['Mon','Tue','Wed','Thu','Fri','Sat','Sun']}
              cols={Array.from({ length: 24 }, (_, i) => (i % 4 === 0 ? `${i}:00` : ''))}
              height={220}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#64748b' }}>
              <span>Lower</span>
              <div style={{ display: 'flex', gap: 1 }}>
                {[0.15,0.3,0.45,0.6,0.75,0.9].map((o) => (
                  <div key={o} style={{ width: 24, height: 8, background: `rgba(30,96,145,${o})` }} />
                ))}
              </div>
              <span>Higher</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Top correlations with target</div></div>
          <div style={{ padding: '4px 16px 16px' }}>
            {[
              ['temperature_max', -0.72, '#1e6091'],
              ['day_of_week', 0.61, '#1e6091'],
              ['is_holiday', 0.54, '#1e6091'],
              ['humidity_avg', 0.43, '#1e6091'],
              ['lag_7', 0.38, '#1e6091'],
              ['precipitation', -0.31, '#dc2626'],
              ['is_school_day', 0.24, '#1e6091'],
              ['air_quality', -0.18, '#dc2626'],
            ].map(([n, v, c]) => {
              const w = Math.abs(v) * 100;
              const isNeg = v < 0;
              return (
                <div key={n} style={{ padding: '8px 0', borderBottom: '1px solid #eef0f3' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span className="mono" style={{ color: '#334155' }}>{n}</span>
                    <span className="mono tnum" style={{ color: c, fontWeight: 600 }}>{v > 0 ? '+' : ''}{v}</span>
                  </div>
                  <div style={{ position: 'relative', height: 4, background: '#f0f2f5', borderRadius: 2 }}>
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#cbd5e1' }} />
                    <div style={{ position: 'absolute', left: isNeg ? `${50 - w / 2}%` : '50%', width: `${w / 2}%`, top: 0, bottom: 0, background: c, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
