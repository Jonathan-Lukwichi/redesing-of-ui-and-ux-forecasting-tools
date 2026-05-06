import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { Sparkline } from '../components/Charts';

const MODELS = [
  { name: 'LightGBM', status: 'complete', mape: 6.4, rmse: 11.2, time: '1m 18s', color: '#1e6091', best: true },
  { name: 'XGBoost', status: 'complete', mape: 7.1, rmse: 12.6, time: '2m 03s', color: '#0d9488' },
  { name: 'Prophet', status: 'complete', mape: 8.3, rmse: 14.8, time: '0m 41s', color: '#d97706' },
  { name: 'TFT (Temporal Fusion)', status: 'running', mape: null, rmse: null, time: '—', color: '#7c3aed' },
  { name: 'Ensemble (avg)', status: 'queued', mape: null, rmse: null, time: '—', color: '#475569' },
  { name: 'Stacked ensemble', status: 'queued', mape: null, rmse: null, time: '—', color: '#475569' },
];

export default function TrainModels() {
  return (
    <div className="content">
      <PageHero
        kicker="Modeling · Step 2"
        title="Train Models"
        sub="Tune & train ML models on engineered features · LightGBM, XGBoost, ARIMA, SARIMAX, ANN, LSTM, hybrids"
        image="/images/train-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="settings" size={14} />HPO</button>
          <button className="btn btn-primary"><Icon name="play" size={14} />Train all</button>
        </>}
      />

      {/* Run status banner */}
      <div className="card" style={{ background: '#f0f5fa', borderColor: '#1e6091', borderLeft: '3px solid #1e6091' }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1e6091', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Icon name="cpu" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Training run #2026-04-30-014 · in progress</div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>3 of 5 models complete · ETA 2m 14s</div>
            <div className="bar" style={{ marginTop: 8 }}>
              <div className="bar-fill" style={{ width: '62%' }} />
            </div>
          </div>
          <button className="btn">Cancel</button>
        </div>
      </div>

      {/* Model cards */}
      <div className="grid-models">
        {MODELS.map((m) => (
          <div key={m.name} className="card" style={{ position: 'relative' }}>
            {m.best && <div style={{ position: 'absolute', top: 12, right: 12 }}><span className="tag tag-success">Best</span></div>}
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: m.color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="cpu" size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {m.status === 'complete' ? 'Trained · ' + m.time :
                     m.status === 'running' ? <span style={{ color: '#1e6091' }}>● Training…</span> :
                     'Waiting in queue'}
                  </div>
                </div>
              </div>

              <div className="grid-3" style={{ gap: 8 }}>
                {[['MAPE', m.mape ? m.mape + '%' : '—'], ['RMSE', m.rmse ?? '—'], ['MAE', m.mape ? (m.mape * 1.5).toFixed(1) : '—']].map(([l, v]) => (
                  <div key={l} style={{ padding: 8, background: '#fafbfc', borderRadius: 4 }}>
                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{l}</div>
                    <div className="mono tnum" style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginTop: 1 }}>{v}</div>
                  </div>
                ))}
              </div>

              {m.mape && (
                <div style={{ marginTop: 12 }}>
                  <Sparkline data={[20,15,12,9,8,7,m.mape]} color={m.color} width={280} height={32} />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Validation MAPE across 7 CV folds</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                {m.status === 'complete' && <>
                  <button className="btn btn-sm">Inspect</button>
                  <button className="btn btn-sm">Tune</button>
                  <button className="btn btn-sm" style={{ marginLeft: 'auto' }}>Deploy</button>
                </>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Feature importance */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Feature importance · LightGBM (best model)</div>
          <div className="card-sub">SHAP values · top 12 features</div>
        </div>
        <div style={{ padding: '8px 16px 16px' }}>
          {[
            ['lag_7',0.95],['temperature_max',0.78],['day_of_week',0.66],['lag_1',0.58],
            ['rolling_mean_14',0.51],['is_holiday',0.43],['humidity_avg',0.36],['month',0.31],
            ['air_quality_idx',0.24],['is_school_day',0.19],['lag_30',0.15],['precipitation',0.11],
          ].map(([n, v]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }}>
              <span className="mono" style={{ width: 160, fontSize: 12, color: '#334155' }}>{n}</span>
              <div style={{ flex: 1, height: 12, background: '#f0f2f5', borderRadius: 2, position: 'relative' }}>
                <div style={{ height: '100%', width: `${v * 100}%`, background: '#1e6091', borderRadius: 2 }} />
              </div>
              <span className="mono tnum" style={{ width: 60, fontSize: 12, color: '#0f172a', textAlign: 'right' }}>{v.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
