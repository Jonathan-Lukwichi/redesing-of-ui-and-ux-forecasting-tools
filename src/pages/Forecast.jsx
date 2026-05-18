import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { LineChart } from '../components/Charts';
import { api } from '../api/client';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDayLabel(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]} ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

const CAT_ROWS = [
  ['Respiratory', 'respiratory'],
  ['Cardiac', 'cardiac'],
  ['Trauma', 'trauma'],
  ['GI', 'gi'],
  ['Infectious', 'infectious'],
  ['Neurological', 'neurological'],
  ['Other', 'other'],
];

export default function Forecast() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api.forecastDemo(ctrl.signal)
      .then((res) => setData(res))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [reloadKey]);

  const rerun = () => setReloadKey((k) => k + 1);

  return (
    <div className="content">
      <PageHero
        kicker={data ? `Forecast · ${data.model_used}` : 'Forecast · Live'}
        title="Patient Forecast"
        sub="7-day-ahead patient arrival predictions with 95% prediction intervals · informs staffing and supply"
        image="/images/forecast-bg.jpg"
        actions={<>
          <button className="btn" onClick={rerun} disabled={loading}>
            <Icon name="refresh" size={14} />{loading ? 'Loading…' : 'Re-run'}
          </button>
          <button className="btn btn-primary"><Icon name="download" size={14} />Export</button>
        </>}
      />

      {error && (
        <div className="card" style={{ borderColor: '#dc2626', background: '#fef5f5' }}>
          <div className="card-body" style={{ color: '#991b1b' }}>
            <strong>Backend unreachable.</strong> {error}
            <div style={{ marginTop: 6, fontSize: 12, color: '#7f1d1d' }}>
              Start the API with <code>cd api &amp;&amp; uvicorn main:app --reload</code> on port 8000.
            </div>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="card"><div className="card-body" style={{ color: '#64748b' }}>Loading forecast…</div></div>
      )}

      {data && <ForecastView data={data} />}
    </div>
  );
}

function ForecastView({ data }) {
  const forecast = data.forecast || [];
  const history = data.history || [];

  const histVals = history.map((h) => h.arrivals);
  const fc = forecast.map((f) => f.predicted);
  const upper = forecast.map((f) => f.upper);
  const lower = forecast.map((f) => f.lower);
  const horizon = fc.length;

  const handoff = histVals.length ? histVals[histVals.length - 1] : null;
  const lineData = [
    { data: [...histVals, ...Array(horizon).fill(null)], color: '#475569' },
    {
      data: [...Array(histVals.length - 1).fill(null), handoff, ...fc],
      color: '#0d9488',
      band: {
        upper: [...Array(histVals.length - 1).fill(null), handoff, ...upper],
        lower: [...Array(histVals.length - 1).fill(null), handoff, ...lower],
      },
    },
  ];

  const xLabels = ['−30d', '−25', '−20', '−15', '−10', '−5', 'Today', '+2', '+4', '+6', `+${horizon}d`];

  const categoryTotals = CAT_ROWS.map(([label, key]) => {
    const daily = forecast.map((f) => f.categories?.[key] || 0);
    const total = daily.reduce((s, v) => s + v, 0);
    return { label, daily, total };
  });

  const qualityRows = buildQualityRows(data);

  return (
    <>
      <div className="grid-7">
        {forecast.map((f) => {
          const lvl = f.label;
          const tag = lvl === 'peak' ? 'danger' : lvl === 'high' ? 'warning' : lvl === 'med' ? 'info' : 'success';
          const isPeak = lvl === 'peak';
          const pi = Math.max(1, Math.round((f.upper - f.lower) / 2));
          return (
            <div key={f.date} className="card" style={{
              padding: 12, textAlign: 'center',
              borderColor: isPeak ? '#dc2626' : '#e4e7eb',
              borderWidth: isPeak ? 2 : 1,
              background: isPeak ? '#fef5f5' : 'white',
            }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{fmtDayLabel(f.date)}</div>
              <div className="tnum" style={{ fontSize: 28, fontWeight: 600, color: '#0f172a', margin: '6px 0', letterSpacing: '-0.5px' }}>{Math.round(f.predicted)}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>±{pi} (95% PI)</div>
              <div style={{ marginTop: 6 }}>
                <span className={'tag tag-' + tag} style={{ fontSize: 10 }}>
                  {lvl === 'peak' ? 'Peak day' : lvl === 'high' ? 'High' : lvl === 'med' ? 'Normal' : 'Low'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">30-day history + {horizon}-day forecast</div>
            <div className="card-sub">95% prediction interval · MAE on holdout: {data.mae} patients · MAPE: {data.mape}%</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ background: '#e8f1f8', color: '#1e6091', borderColor: '#1e6091' }}>Daily</button>
            <button className="btn btn-sm">Hourly</button>
            <button className="btn btn-sm">Weekly</button>
          </div>
        </div>
        <div className="card-body">
          <LineChart series={lineData} xLabels={xLabels} height={260} />
        </div>
      </div>

      <div className="layout-wide">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Forecast by clinical category</div>
            <div className="card-sub">Seasonal proportions · {horizon}-day total</div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Category</th>
                {forecast.map((f) => <th key={f.date}>{fmtDayLabel(f.date).split(' ').slice(0, 1)[0]}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {categoryTotals.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {row.daily.map((v, i) => <td key={i} className="num">{Math.round(v)}</td>)}
                  <td className="num" style={{ fontWeight: 600 }}>{Math.round(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Forecast quality</div></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {qualityRows.map((s) => (
              <div key={s.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#334155' }}>{s.l}</span>
                  <span className="mono tnum" style={{ color: s.c, fontWeight: 600 }}>{s.v}</span>
                </div>
                <div className="bar"><div className="bar-fill" style={{ width: s.b + '%', background: s.c }} /></div>
              </div>
            ))}
            <div style={{ marginTop: 8, padding: 12, background: '#fafbfc', borderRadius: 6, fontSize: 12, color: '#475569' }}>
              <strong style={{ color: '#0f172a' }}>Model:</strong> {data.model_used}. {data.message}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function buildQualityRows(data) {
  const mape = data.mape;
  const mae = data.mae;
  const mapeColor = mape <= 8 ? '#16a34a' : mape <= 15 ? '#d97706' : '#dc2626';
  const mapeBar = Math.max(0, Math.min(100, 100 - mape * 4));
  return [
    { l: 'MAPE (holdout)', v: `${mape}%`, c: mapeColor, b: mapeBar },
    { l: 'MAE (holdout)', v: `${mae} patients`, c: mapeColor, b: mapeBar },
    { l: 'Coverage (95% PI)', v: '95% nominal', c: '#16a34a', b: 95 },
    { l: 'Horizon', v: `${data.horizon} days`, c: '#1e6091', b: 100 },
  ];
}
