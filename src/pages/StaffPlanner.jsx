import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';

export default function StaffPlanner() {
  return (
    <div className="content">
      <PageHero
        kicker="Planning · Staff"
        title="Staff Planner"
        sub="Optimal RN, MD, and tech schedules for the 7-day forecast · coverage, overtime, and weekly cost"
        image="/images/staff-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="refresh" size={14} />Re-optimize</button>
          <button className="btn btn-primary"><Icon name="check" size={14} />Approve</button>
        </>}
      />

      <div className="grid-kpi">
        <KPI label="Coverage" value="94.2" unit="%" trend="+2.1%" trendDir="up" foot="vs. last week" />
        <KPI label="Total staff/wk" value="312" unit="shifts" foot="48 RNs · 12 MDs · 18 techs" />
        <KPI label="Overtime" value="84" unit="hrs" trend="-23%" trendDir="up" foot="vs. last week" />
        <KPI label="Weekly cost" value="$184k" trend="-$42k" trendDir="up" foot="vs. baseline" />
      </div>

      {/* Schedule grid */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Weekly schedule · May 4–10</div>
            <div className="card-sub">Demand vs. scheduled coverage</div>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <span><span className="dot" style={{ color: '#1e6091' }} /> Demand</span>
            <span><span className="dot" style={{ color: '#0d9488' }} /> Scheduled</span>
            <span><span className="dot" style={{ color: '#d97706' }} /> Overtime</span>
          </div>
        </div>
        <div className="card-body">
          <svg viewBox="0 0 800 280" width="100%" height="280" preserveAspectRatio="none">
            {[0, 1, 2, 3, 4].map((i) => <line key={i} x1="40" x2="780" y1={20 + i * 50} y2={20 + i * 50} stroke="#eef0f3" />)}
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <text key={d} x={40 + (i + 0.5) * 105} y={272} textAnchor="middle" fontSize="11" fill="#64748b">{d}</text>
            ))}
            {[20, 25, 30, 35, 40].map((v, i) => {
              const y = 220 - (v - 20) * 10;
              return <text key={v} x={32} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{v}</text>;
            })}
            {[28, 30, 35, 38, 36, 28, 25].map((demand, i) => {
              const sched = [27, 30, 33, 35, 35, 27, 26][i];
              const ot = Math.max(0, demand - sched);
              const cx = 40 + (i + 0.5) * 105;
              const dh = (demand - 20) * 10;
              const sh = (sched - 20) * 10;
              const oh = ot * 10;
              return (
                <g key={i}>
                  <rect x={cx - 36} y={220 - dh} width={24} height={dh} fill="#1e6091" rx="2" />
                  <rect x={cx - 8} y={220 - sh} width={24} height={sh} fill="#0d9488" rx="2" />
                  <rect x={cx + 20} y={220 - oh} width={24} height={oh} fill="#d97706" rx="2" />
                  <text x={cx} y={245} textAnchor="middle" fontSize="10" fill="#64748b">{demand}/{sched}{ot > 0 ? `+${ot}OT` : ''}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Roster table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Roster · 32 RNs scheduled</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="select" style={{ width: 130, height: 30, fontSize: 12 }}>
              <option>RNs</option>
              <option>MDs</option>
              <option>Techs</option>
            </select>
            <input className="input" placeholder="Search staff…" style={{ width: 200, height: 30, fontSize: 12 }} />
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>Staff</th><th>Role</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th><th className="num">Hrs</th><th>Status</th></tr>
          </thead>
          <tbody>
            {[
              ['E. Rodriguez', 'RN-3', 'D', 'D', '—', 'D', 'D', '—', '—', 32, 'ok'],
              ['M. Chen', 'RN-2', '—', 'N', 'N', 'N', '—', 'N', '—', 40, 'ok'],
              ['K. Patel', 'RN-4', 'D', 'D', 'D', 'D*', 'D', '—', '—', 44, 'overtime'],
              ['A. Johnson', 'RN-2', '—', '—', 'D', 'D', 'D', 'D', '—', 32, 'ok'],
              ['S. Kim', 'RN-3', 'N', 'N', '—', 'N*', 'N*', '—', '—', 48, 'overtime'],
              ['J. Williams', 'RN-1', '—', 'D', 'D', 'D', 'D', '—', 'D', 40, 'ok'],
              ['T. Garcia', 'RN-3', '—', '—', '—', 'D?', 'D', 'D', 'D', 28, 'open'],
            ].map((r) => (
              <tr key={r[0]}>
                <td style={{ fontWeight: 500, color: '#0f172a' }}>{r[0]}</td>
                <td><span className="tag">{r[1]}</span></td>
                {r.slice(2, 9).map((v, i) => {
                  const isOT = String(v).includes('*');
                  const isOpen = String(v).includes('?');
                  return (
                    <td key={i} className="mono" style={{ textAlign: 'center' }}>
                      {v === '—' ? <span style={{ color: '#cbd5e1' }}>—</span> :
                       <span style={{
                         padding: '2px 6px', borderRadius: 3, fontWeight: 600,
                         background: isOpen ? '#fdf3e3' : isOT ? '#fbeaea' : String(v).startsWith('D') ? '#e8f1f8' : '#f0eafe',
                         color: isOpen ? '#d97706' : isOT ? '#dc2626' : String(v).startsWith('D') ? '#1e6091' : '#7c3aed',
                       }}>{String(v).replace('?', '')}</span>}
                    </td>
                  );
                })}
                <td className="num">{r[9]}</td>
                <td>
                  {r[10] === 'ok' ? <span className="tag tag-success">OK</span> :
                   r[10] === 'overtime' ? <span className="tag tag-warning">OT</span> :
                   <span className="tag tag-danger">Open</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
