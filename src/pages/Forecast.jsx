import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { LineChart } from '../components/Charts';

const hist = Array.from({ length: 30 }, (_, i) => 145 + Math.sin(i / 3) * 18 + i * 0.4);
const fc = [188, 195, 218, 232, 215, 188, 174];
const upper = fc.map((v) => v * 1.12);
const lower = fc.map((v) => v * 0.88);

export default function Forecast() {
  return (
    <div className="content">
      <PageHero
        kicker="Forecast · Live"
        title="Patient Forecast"
        sub="7-day-ahead patient arrival predictions with 95% prediction intervals · informs staffing and supply"
        image="/images/forecast-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="refresh" size={14} />Re-run</button>
          <button className="btn btn-primary"><Icon name="download" size={14} />Export</button>
        </>}
      />

      {/* Forecast cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
        {[
          ['Mon May 4', 188, 'low'],
          ['Tue May 5', 195, 'med'],
          ['Wed May 6', 218, 'high'],
          ['Thu May 7', 232, 'peak'],
          ['Fri May 8', 215, 'high'],
          ['Sat May 9', 188, 'med'],
          ['Sun May 10', 174, 'low'],
        ].map(([d, v, lvl]) => {
          const tag = lvl === 'peak' ? 'danger' : lvl === 'high' ? 'warning' : lvl === 'med' ? 'info' : 'success';
          const isPeak = lvl === 'peak';
          return (
            <div key={d} className="card" style={{
              padding: 12, textAlign: 'center',
              borderColor: isPeak ? '#dc2626' : '#e4e7eb',
              borderWidth: isPeak ? 2 : 1,
              background: isPeak ? '#fef5f5' : 'white',
            }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{d}</div>
              <div className="tnum" style={{ fontSize: 28, fontWeight: 600, color: '#0f172a', margin: '6px 0', letterSpacing: '-0.5px' }}>{v}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>±{Math.round(v * 0.12)} (95% PI)</div>
              <div style={{ marginTop: 6 }}>
                <span className={'tag tag-' + tag} style={{ fontSize: 10 }}>
                  {lvl === 'peak' ? 'Peak day' : lvl === 'high' ? 'High' : lvl === 'med' ? 'Normal' : 'Low'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main chart */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">30-day history + 7-day forecast</div>
            <div className="card-sub">95% prediction interval · 7-day MAE on holdout: 11.4 patients</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ background: '#e8f1f8', color: '#1e6091', borderColor: '#1e6091' }}>Daily</button>
            <button className="btn btn-sm">Hourly</button>
            <button className="btn btn-sm">Weekly</button>
          </div>
        </div>
        <div className="card-body">
          <LineChart
            series={[
              { data: [...hist, ...Array(7).fill(null)], color: '#475569' },
              {
                data: [...Array(29).fill(null), hist[29], ...fc],
                color: '#0d9488',
                band: { upper: [...Array(29).fill(null), hist[29], ...upper], lower: [...Array(29).fill(null), hist[29], ...lower] },
              },
            ]}
            xLabels={['−30d', '−25', '−20', '−15', '−10', '−5', 'Today', '+2', '+4', '+6', '+7d']}
            height={260}
          />
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Forecast by clinical category</div>
            <div className="card-sub">Seasonal proportions · 7-day total</div>
          </div>
          <table className="tbl">
            <thead><tr><th>Category</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th><th className="num">Total</th></tr></thead>
            <tbody>
              {[
                ['Respiratory', 53, 55, 61, 65, 60, 53, 49, 396],
                ['Cardiac', 41, 43, 48, 51, 47, 41, 38, 309],
                ['Trauma', 30, 31, 35, 37, 34, 30, 28, 225],
                ['GI', 26, 27, 31, 32, 30, 26, 24, 196],
                ['Infectious', 21, 21, 24, 26, 24, 21, 19, 156],
                ['Other', 17, 18, 19, 21, 20, 17, 16, 128],
              ].map((r) => (
                <tr key={r[0]}>
                  <td>{r[0]}</td>
                  {r.slice(1, 8).map((v, i) => <td key={i} className="num">{v}</td>)}
                  <td className="num" style={{ fontWeight: 600 }}>{r[8]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Forecast quality</div></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { l: 'MAPE (last 30d)', v: '6.4%', c: '#16a34a', b: 92 },
              { l: 'Coverage (95% PI)', v: '94.2%', c: '#16a34a', b: 94 },
              { l: 'Bias', v: '+1.2', c: '#d97706', b: 70 },
              { l: 'Sharpness', v: 'Good', c: '#16a34a', b: 86 },
            ].map((s) => (
              <div key={s.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#334155' }}>{s.l}</span>
                  <span className="mono tnum" style={{ color: s.c, fontWeight: 600 }}>{s.v}</span>
                </div>
                <div className="bar"><div className="bar-fill" style={{ width: s.b + '%', background: s.c }} /></div>
              </div>
            ))}
            <div style={{ marginTop: 8, padding: 12, background: '#fafbfc', borderRadius: 6, fontSize: 12, color: '#475569' }}>
              <strong style={{ color: '#0f172a' }}>Recommendation:</strong> Forecast quality is good. Thursday peak is well-supported by the past 8 weeks of data.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
