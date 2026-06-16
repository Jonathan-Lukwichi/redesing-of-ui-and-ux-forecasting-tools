import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';
import { LineChart } from '../components/Charts';
import { api } from '../api/client';
import AiPanel from '../components/AiPanel';

const C = { ink: '#0f172a', muted: '#64748b', teal: '#0d9488', navy: '#1e6091', red: '#dc2626', amber: '#d97706' };
const zar = (n) => (n == null ? '—' : 'R ' + Math.round(n).toLocaleString('en-ZA'));
const zarShort = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return 'R ' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return 'R ' + (n / 1e3).toFixed(0) + 'k';
  return 'R ' + Math.round(n);
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHIFT = { Day: '#f59e0b', Evening: '#1e6091', Night: '#6366f1' };
const CAT_SHORT = { 'Professional Nurse': 'PN', 'Enrolled Nurse': 'EN', 'Enrolled Nursing Auxiliary': 'ENA' };

export default function StaffPlanner() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [catFilter, setCatFilter] = useState('All');

  useEffect(() => {
    let alive = true;
    api.staff.overview()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  if (error) return (
    <div className="content"><PageHero kicker="Operations · Staff" title="Staff Planner" sub="Scheduling simulation" />
      <div className="card"><div className="card-body" style={{ color: C.red }}>
        Couldn't load staffing data: {error}. Make sure the backend is running on port 8000.
      </div></div>
    </div>
  );

  const k = data?.kpis;   // this representative run
  const ci = data?.ci;    // 30-seed aggregated means + 95% CIs
  const daily = data?.daily || [];
  const required = daily.map((d) => d.required);
  const staffed = daily.map((d) => d.staffed);
  const xLabels = daily.filter((_, i) => i % Math.floor((daily.length || 6) / 6) === 0)
    .map((d) => MONTHS[new Date(d.date + 'T00:00:00').getMonth()]);
  const cats = [...new Set((data?.staff || []).map((s) => s.category))];
  const staffRows = (data?.staff || []).filter((s) => catFilter === 'All' || s.category === catFilter);

  return (
    <div className="content">
      <PageHero
        kicker="Operations · Staff"
        title="Staff Planner"
        sub="Nurse rostering, coverage and payroll from a 13-month scheduling simulation driven by real ED arrivals · 23 active nurses (of 30 posts) · BCEA logged, not enforced · representative run (seed 10059)"
        image="/images/staff-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="refresh" size={14} />Re-optimize</button>
          <button className="btn btn-primary"><Icon name="check" size={14} />Approve roster</button>
        </>}
      />

      <div className="grid-kpi">
        <KPI label="Coverage" value={k ? k.coverage_pct : '—'} unit="%" foot="staffed vs required" />
        <KPI label="Annual payroll" value={k ? zarShort(k.annual_payroll_zar) : '—'}
          foot={`${k?.n_active_staff ?? 0} active nurses`} />
        <KPI label="Mean weekly hours" value={k ? k.mean_weekly_hours : '—'} unit="h"
          foot="12-hour shifts · SA norm" />
        <KPI label="BCEA breaches / nurse" value={k ? k.bcea_per_nurse : '—'}
          foot="45h/week · logged, not enforced" />
      </div>

      {ci && (
        <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 12 }}>
          Figures are from one representative run ({k?.n_active_staff} of 30 posts filled, rest vacant). BCEA limits are
          <strong> logged, not enforced</strong> — 12-hour shifts and ~58h weeks are the documented SA public-hospital norm,
          so the high breach counts are realistic, not a bug. Across 30 runs (95% CI):
          coverage {ci.coverage_pct.mean}% [{ci.coverage_pct.lo}–{ci.coverage_pct.hi}] ·
          payroll {zarShort(ci.annual_payroll_zar.mean)} ·
          BCEA {Math.round(ci.bcea_violations_per_staff.mean)}/nurse · locum share {ci.locum_share_pct.mean}%.
        </div>
      )}

      {data && <AiPanel surface="staff" context={data} label="Explain the roster" />}

      {/* Coverage chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Daily coverage · required vs staffed nurses</div>
            <div className="card-sub">Demand is driven by daily ED arrivals</div>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <span><span className="dot" style={{ color: C.navy }} /> Required</span>
            <span><span className="dot" style={{ color: C.teal }} /> Staffed</span>
          </div>
        </div>
        <div className="card-body">
          {!data && <div style={{ color: C.muted }}>Loading…</div>}
          {data && <LineChart series={[
            { data: required, color: C.navy },
            { data: staffed, color: C.teal },
          ]} height={220} xLabels={xLabels} />}
        </div>
      </div>

      {/* Shift breakdown */}
      {data?.shifts && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="card-title">Shifts · demand & cost by time of day</div></div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            {data.shifts.map((s) => (
              <div key={s.shift} style={{ border: '1px solid #eef0f3', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: SHIFT[s.shift] || C.muted }} />
                  <strong style={{ color: C.ink }}>{s.shift}</strong>
                </div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: C.muted }}>Avg nurses</span>
                  <strong>{s.avg_filled} / {s.avg_required}</strong>
                </div>
                <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: C.muted }}>Unfilled · locum</span>
                  <span style={{ color: s.unfilled > 0 ? C.amber : C.muted }}>{s.unfilled} · {s.locum_hours}h</span>
                </div>
                <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: C.muted }}>Cost</span>
                  <strong>{zarShort(s.cost_zar)}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff roster table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Nursing staff · {data?.staff?.length ?? 0}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['All', ...cats].map((f) => (
              <button key={f} className="btn btn-sm" onClick={() => setCatFilter(f)}
                style={catFilter === f ? { background: '#e8f1f8', color: C.navy, borderColor: C.navy } : {}}>
                {f === 'All' ? 'All' : CAT_SHORT[f] || f}
              </button>
            ))}
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>Staff</th><th>Role</th><th className="num">Skill</th><th className="num">Days worked</th><th className="num">Reg hrs</th><th className="num">OT hrs</th><th className="num">Avg wk hrs</th><th className="num">Sick</th><th className="num">Payroll</th><th className="num">BCEA</th></tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan={10} style={{ color: C.muted, padding: 20 }}>Loading staff…</td></tr>}
            {staffRows.map((s) => (
              <tr key={s.staff_id}>
                <td style={{ fontWeight: 500, color: C.ink }} className="mono">{s.staff_id}</td>
                <td><span className="tag">{CAT_SHORT[s.category] || s.category}</span></td>
                <td className="num">{s.skill_level}</td>
                <td className="num">{s.days_worked}</td>
                <td className="num">{s.regular_hours}</td>
                <td className="num" style={{ color: s.overtime_hours > 0 ? C.amber : C.muted }}>{s.overtime_hours}</td>
                <td className="num">{s.avg_weekly_hours}</td>
                <td className="num" style={{ color: C.muted }}>{s.days_sick}</td>
                <td className="num">{zarShort(s.payroll_cost_zar)}</td>
                <td className="num" style={{ color: s.bcea_violations > 0 ? C.red : C.muted }}>{s.bcea_violations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
