import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { Heatmap, BarChart } from '../components/Charts';

const missingData = [
  [0.5,0.2,0.1,0.8,0.3,0.6,0.4,0.2,0.1,0.9,0.7,0.3],
  [0.2,0.1,0.3,0.4,0.5,0.2,0.3,0.1,0.2,0.4,0.3,0.2],
  [0.3,0.4,0.2,0.1,0.6,0.3,0.5,0.4,0.3,0.2,0.1,0.4],
  [0.1,0.2,0.4,0.3,0.2,0.1,0.2,0.3,0.1,0.2,0.3,0.1],
  [0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],
  [1.2,1.5,1.8,2.1,1.4,0.8,1.1,1.6,2.0,1.7,1.3,0.9],
];

export default function PrepareData() {
  return (
    <div className="content">
      <PageHero
        kicker="Data · Step 2"
        title="Prepare Data"
        sub="Fuse patient, weather, calendar, and reason-code datasets · build target columns and clean edge cases"
        image="/images/prepare-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="refresh" size={14} />Re-fuse</button>
          <button className="btn btn-primary"><Icon name="check" size={14} />Save processed</button>
        </>}
      />

      <div className="steps">
        <div className="step done"><span className="step-num">✓</span>Inputs validated</div>
        <span className="step-arrow">›</span>
        <div className="step done"><span className="step-num">✓</span>Datasets merged</div>
        <span className="step-arrow">›</span>
        <div className="step current"><span className="step-num">3</span>Targets built (1–7d)</div>
        <span className="step-arrow">›</span>
        <div className="step"><span className="step-num">4</span>Categories aggregated</div>
        <span className="step-arrow">›</span>
        <div className="step"><span className="step-num">5</span>Save to cache</div>
      </div>

      <div className="layout-aside">
        {/* Settings */}
        <div className="card">
          <div className="card-header"><div className="card-title">Fusion settings</div></div>
          <div className="card-body">
            <div className="field-group" style={{ marginBottom: 12 }}>
              <label className="label">Join key</label>
              <select className="select"><option>arrival_date</option><option>datetime</option></select>
            </div>
            <div className="field-group" style={{ marginBottom: 12 }}>
              <label className="label">Forecast lags (days)</label>
              <input className="input" defaultValue="1, 2, 3, 4, 5, 6, 7" />
              <div className="helper">Build Target_1 … Target_7</div>
            </div>
            <div className="field-group" style={{ marginBottom: 12 }}>
              <label className="label">Edge handling</label>
              <select className="select"><option>Strict drop NA</option><option>Forward fill</option></select>
            </div>
            {['Aggregate clinical categories (6→3)', 'Detect duplicate columns', 'One-hot encode categoricals'].map((l, i) => (
              <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked={i < 2} /> {l}
              </label>
            ))}
          </div>
        </div>

        {/* Schema preview */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Merged dataset · processed_df</div>
              <div className="card-sub">1,216 rows × 47 columns · ready for feature engineering</div>
            </div>
            <span className="tag tag-success">Schema valid</span>
          </div>
          <table className="tbl">
            <thead><tr><th>Column</th><th>Type</th><th>Source</th><th className="num">Non-null</th><th className="num">Unique</th><th>Sample</th></tr></thead>
            <tbody>
              {[
                ['arrival_date','date','patient',1216,1216,'2026-04-30'],
                ['Total_Arrivals','int','patient',1216,184,'195'],
                ['Target_1 … Target_7','int','derived',1209,184,'188 / 195 / 218'],
                ['temperature_max','float','weather',1216,1102,'82.4'],
                ['humidity_avg','float','weather',1214,891,'64.2'],
                ['precipitation','float','weather',1216,412,'0.12'],
                ['is_holiday','bool','calendar',1216,2,'false'],
                ['is_school_day','bool','calendar',1216,2,'true'],
                ['day_of_week','int','derived',1216,7,'3'],
                ['respiratory_pct','float','reason',1216,612,'0.28'],
                ['cardiac_pct','float','reason',1216,584,'0.22'],
              ].map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: '#1e6091' }}>{r[0]}</td>
                  <td><span className="tag" style={{ fontSize: 10 }}>{r[1]}</span></td>
                  <td>{r[2]}</td>
                  <td className="num">{r[3].toLocaleString()}</td>
                  <td className="num">{r[4]}</td>
                  <td className="mono">{r[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid-3">
        <div className="card">
          <div className="card-header"><div className="card-title">Missing data heatmap</div></div>
          <div className="card-body">
            <Heatmap data={missingData} rows={['Total_Arr','Temp','Humidity','Precip','Holiday','Reason']} cols={['J','F','M','A','M','J','J','A','S','O','N','D']} height={170} />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>2,541 missing values · 0.3% of cells · concentrated in reason codes</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Target distribution</div></div>
          <div className="card-body">
            <BarChart data={[12,38,92,184,312,256,158,84,32,14]} labels={['80','100','120','140','160','180','200','220','240','260']} height={170} color="#0d9488" />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Histogram · arrivals/day · approx. normal, slight right skew</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Validation summary</div></div>
          <div style={{ padding: '8px 16px 16px' }}>
            {[
              ['Row count','1,216','#0f172a'],
              ['Date coverage','100%','#16a34a'],
              ['Missing values','2,541 (0.3%)','#d97706'],
              ['Duplicates','0','#16a34a'],
              ['Targets built','7 / 7','#16a34a'],
              ['Categoricals','12 columns','#0f172a'],
            ].map(([l,v,c]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eef0f3', fontSize: 13 }}>
                <span style={{ color: '#475569' }}>{l}</span>
                <span className="mono" style={{ color: c, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
