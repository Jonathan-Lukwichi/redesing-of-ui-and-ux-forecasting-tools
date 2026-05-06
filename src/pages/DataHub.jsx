import { useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';

const TABS = ['Patient arrivals', 'Weather', 'Calendar', 'Reason codes'];

export default function DataHub() {
  const [tab, setTab] = useState(0);
  const [source, setSource] = useState('Epic FHIR API');

  return (
    <div className="content">
      <PageHero
        kicker="Data · Sources"
        title="Data Hub"
        sub="Connect, upload, and validate the source data feeding your forecasts · Patient arrivals, weather, calendar, ICD-10 codes"
        image="/images/hero-bg1.jpg"
        actions={<>
          <button className="btn"><Icon name="cloud" size={14} />Connect API</button>
          <button className="btn btn-primary"><Icon name="upload" size={14} />Upload CSV</button>
        </>}
      />

      {/* Source tiles */}
      <div className="grid-kpi">
        {[
          { name: 'Patient arrivals', desc: 'ED encounter records', count: '847,392 rows', status: 'Connected', color: 'success', icon: 'hospital', source: 'Epic FHIR' },
          { name: 'Weather', desc: 'Hourly temp, humidity, conditions', count: '2,847 days', status: 'Connected', color: 'success', icon: 'cloud', source: 'NOAA API' },
          { name: 'Calendar', desc: 'Holidays, school schedules, events', count: '366 days', status: 'Connected', color: 'success', icon: 'file', source: 'CSV upload' },
          { name: 'Reason codes', desc: 'ICD-10 chief complaint', count: '—', status: 'Not connected', color: 'warning', icon: 'table', source: 'Optional' },
        ].map((s) => (
          <div key={s.name} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: s.color === 'success' ? 'var(--accent-soft)' : 'var(--warning-soft)', color: s.color === 'success' ? 'var(--accent)' : 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={s.icon} size={16} />
              </div>
              <span className={'tag tag-' + s.color}><span className="dot" /> {s.status}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{s.name}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid #eef0f3' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.source}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>{s.count}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + config */}
      <div className="card">
        <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div className="tabs" style={{ marginBottom: 0, border: 'none' }}>
            {TABS.map((t, i) => (
              <div key={t} className={'tab' + (tab === i ? ' active' : '')} onClick={() => setTab(i)}>{t}</div>
            ))}
          </div>
        </div>

        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
          {/* Source config */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Source</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Epic FHIR API', 'Supabase / Postgres', 'CSV upload', 'S3 / Snowflake'].map((o) => (
                <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid ' + (source === o ? '#1e6091' : '#e4e7eb'), borderRadius: 6, fontSize: 13, cursor: 'pointer', background: source === o ? '#e8f1f8' : 'white', color: source === o ? '#1e6091' : '#334155', fontWeight: source === o ? 500 : 400 }}>
                  <input type="radio" name="source" checked={source === o} onChange={() => setSource(o)} style={{ margin: 0 }} />
                  {o}
                </label>
              ))}
            </div>

            <div style={{ marginTop: 20, fontSize: 12, fontWeight: 600, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Date range</div>
            <div className="field-group" style={{ marginBottom: 8 }}>
              <input className="input" defaultValue="2023-01-01" />
            </div>
            <div className="field-group">
              <input className="input" defaultValue="2026-04-30" />
            </div>
            <div className="helper" style={{ marginTop: 6 }}>Covers 1,216 days · 3 years 4 months</div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}>
              <Icon name="refresh" size={14} /> Sync now
            </button>
          </div>

          {/* Preview */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Preview · patient_arrivals</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>847,392 rows · 11 columns · last sync 2m ago</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="tag tag-success">Schema valid</span>
                <span className="tag">0.3% missing</span>
              </div>
            </div>
            <div style={{ border: '1px solid #e4e7eb', borderRadius: 6, overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr><th>encounter_id</th><th>arrival_ts</th><th>category</th><th>acuity</th><th>age_band</th><th className="num">los_min</th></tr>
                </thead>
                <tbody>
                  {[
                    ['enc_2491083','2026-04-30 23:47','Respiratory','ESI-3','65+',184],
                    ['enc_2491082','2026-04-30 23:42','Cardiac','ESI-2','45-64',312],
                    ['enc_2491081','2026-04-30 23:38','Trauma','ESI-2','18-44',245],
                    ['enc_2491080','2026-04-30 23:31','GI','ESI-3','18-44',156],
                    ['enc_2491079','2026-04-30 23:24','Infectious','ESI-3','0-17',92],
                    ['enc_2491078','2026-04-30 23:18','Respiratory','ESI-4','65+',138],
                    ['enc_2491077','2026-04-30 23:11','Cardiac','ESI-1','65+',421],
                  ].map((r, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ color: '#1e6091' }}>{r[0]}</td>
                      <td className="mono">{r[1]}</td>
                      <td><span className="tag" style={{ fontSize: 10 }}>{r[2]}</span></td>
                      <td className="mono">{r[3]}</td>
                      <td>{r[4]}</td>
                      <td className="num">{r[5]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid-kpi" style={{ marginTop: 16 }}>
              {[
                { l: 'Total rows', v: '847,392', c: '#0f172a' },
                { l: 'Date coverage', v: '100%', c: '#16a34a' },
                { l: 'Missing values', v: '2,541', c: '#d97706' },
                { l: 'Duplicates', v: '0', c: '#16a34a' },
              ].map((s) => (
                <div key={s.l} style={{ padding: '10px 12px', background: '#fafbfc', border: '1px solid #eef0f3', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: s.c, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
