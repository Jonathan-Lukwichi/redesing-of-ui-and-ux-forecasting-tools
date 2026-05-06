import { useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';

const RECIPES = [
  { n: 'Temporal', c: 12, ex: 'day_of_week, month, quarter, day_of_year, week_of_year, is_weekend', on: true },
  { n: 'Calendar', c: 8, ex: 'is_holiday, days_to_holiday, is_school_day, is_payday', on: true },
  { n: 'Lags', c: 21, ex: 'lag_1, lag_2, … lag_7, lag_14, lag_30 (target × 7 horizons)', on: true },
  { n: 'Rolling stats', c: 18, ex: 'rolling_mean_7/14/30, rolling_std_7/14, rolling_max', on: true },
  { n: 'Weather', c: 11, ex: 'temp_max, humidity_avg, precip, dew_point, AQI, wind_speed', on: true },
  { n: 'Fourier (yearly)', c: 4, ex: 'sin/cos pairs at periods 365.25, 7', on: false },
];

export default function FeatureStudio() {
  const [enabled, setEnabled] = useState(() => Object.fromEntries(RECIPES.map((r) => [r.n, r.on])));

  const toggle = (name) => setEnabled((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="content">
      <PageHero
        kicker="Modeling · Feature engineering"
        title="Feature Studio"
        sub="Generate temporal, calendar, weather, and lag features · build train/val/test splits and CV folds"
        image="/images/prepare-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="refresh" size={14} />Regenerate</button>
          <button className="btn btn-primary"><Icon name="check" size={14} />Save features</button>
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPI label="Total features" value="74" foot="from 11 columns" />
        <KPI label="Train / Val / Test" value="70 / 15 / 15" unit="%" foot="time-ordered" />
        <KPI label="CV folds" value="5" foot="expanding window" />
        <KPI label="Multicollinearity" value="2" foot="pairs |r|>0.95" />
      </div>

      {/* Feature builder */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Feature recipes</div>
          <span className="tag tag-success">74 features built</span>
        </div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {RECIPES.map((r) => {
            const on = enabled[r.n];
            return (
              <div key={r.n} style={{ border: '1px solid ' + (on ? '#1e6091' : '#e4e7eb'), borderRadius: 8, padding: 14, background: on ? '#f0f5fa' : 'white', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{r.n}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{r.c} features</div>
                  </div>
                  <button
                    onClick={() => toggle(r.n)}
                    style={{ width: 36, height: 20, borderRadius: 10, border: 'none', background: on ? '#1e6091' : '#cbd5e1', cursor: 'pointer', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}
                  >
                    <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.15s' }} />
                  </button>
                </div>
                <div className="mono" style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>{r.ex}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Split & CV viz */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Temporal split · 1,216 days</div></div>
          <div className="card-body">
            <div style={{ display: 'flex', height: 30, borderRadius: 4, overflow: 'hidden', border: '1px solid #e4e7eb' }}>
              <div style={{ flex: 70, background: '#1e6091', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>Train · 851d</div>
              <div style={{ flex: 15, background: '#0d9488', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>Val · 183d</div>
              <div style={{ flex: 15, background: '#d97706', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>Test · 182d</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#64748b' }}>
              <span className="mono">2023-01-01</span>
              <span className="mono">2025-05-01</span>
              <span className="mono">2025-11-01</span>
              <span className="mono">2026-04-30</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Cross-validation · expanding window</div></div>
          <div className="card-body">
            {[1,2,3,4,5].map((f) => {
              const tw = 30 + f * 10;
              return (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span className="mono" style={{ width: 36, fontSize: 11, color: '#64748b' }}>F{f}</span>
                  <div style={{ flex: 1, height: 14, background: '#f0f2f5', borderRadius: 2, display: 'flex' }}>
                    <div style={{ width: tw + '%', background: '#1e6091' }} />
                    <div style={{ width: '10%', background: '#0d9488' }} />
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, display: 'flex', gap: 12 }}>
              <span><span className="dot" style={{ color: '#1e6091' }} /> Train</span>
              <span><span className="dot" style={{ color: '#0d9488' }} /> Validate</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
