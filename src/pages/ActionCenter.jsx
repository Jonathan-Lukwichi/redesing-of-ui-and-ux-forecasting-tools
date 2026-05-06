import { useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';

const ACTIONS = [
  {
    p: 'danger', t: 'Critical', tab: 'Staff',
    title: 'Add 2 RNs to Thursday May 7 PM shift',
    desc: 'Forecast shows +18% peak (232 patients). Current schedule has 28 RNs; optimal is 32. Estimated wait time impact if unstaffed: +47 min.',
    tags: ['Staff', 'Thu May 7', 'PM shift'],
    impact: '$8.4k',
    why: 'ED arrival forecast is 232 (95% PI: 204-260). DOW pattern + heatwave forecast for Thu both push demand.',
  },
  {
    p: 'danger', t: 'Critical', tab: 'Supply',
    title: 'Reorder N95 respirators (3M 1860)',
    desc: 'Stock at 78 units, ROP is 120. At forecast burn rate of 24/day, projected stockout in 3.2 days. Lead time is 5 days.',
    tags: ['Supply', 'PPE', '5d lead'],
    impact: 'Prevent stockout',
    why: 'Respiratory case forecast is 396 over next 7 days (+12% vs. baseline).',
  },
  {
    p: 'warning', t: 'High', tab: 'Capacity',
    title: 'Open cardiac overflow capacity',
    desc: 'Cardiac admissions forecast at 309 (vs. 285 capacity). Activate 6-bed overflow on telemetry floor 3.',
    tags: ['Capacity', 'Cardiac'],
    impact: '$12.0k',
    why: 'Cardiac forecast +8.4% vs. trailing 4-week average.',
  },
  {
    p: 'warning', t: 'High', tab: 'Supply',
    title: 'Reorder IV Saline 1L (200 units)',
    desc: 'Days cover at 2.8 days. Suggested order: 400 units to reach 7-day buffer.',
    tags: ['Supply', 'Fluids'],
    impact: 'Prevent stockout',
    why: 'Higher-than-usual saline burn rate over past 14 days.',
  },
  {
    p: 'info', t: 'Medium', tab: 'Staff',
    title: 'Approve shift swap: Dr. Chen Wed AM ↔ Fri PM',
    desc: 'Coverage maintained on both days. No overtime impact.',
    tags: ['Staff', 'Approval'],
    impact: '—',
  },
  {
    p: 'warning', t: 'High', tab: 'Capacity',
    title: 'Pre-position trauma bay 4 for weekend surge',
    desc: 'Historical pattern shows +14% trauma on Sat/Sun following events. City marathon scheduled Saturday.',
    tags: ['Capacity', 'Trauma', 'Sat May 9'],
    impact: '$6.2k',
    why: 'City marathon event detected in calendar data; past 3 marathon weekends averaged 198 trauma arrivals.',
  },
  {
    p: 'info', t: 'Medium', tab: 'Supply',
    title: 'Review excess elastic bandage inventory',
    desc: '412 units on hand vs. 200 ROP (28 days cover). Consider returning or redistributing excess stock.',
    tags: ['Supply', 'Wound', 'Excess'],
    impact: '—',
  },
];

const TABS = ['All', 'Staff', 'Supply', 'Capacity'];

export default function ActionCenter() {
  const [tab, setTab] = useState('All');
  const [dismissed, setDismissed] = useState(new Set());

  const visible = ACTIONS.filter((a) => !dismissed.has(a.title) && (tab === 'All' || a.tab === tab));
  const counts = Object.fromEntries(TABS.map((t) => [t, t === 'All' ? ACTIONS.length : ACTIONS.filter((a) => a.tab === t).length]));

  return (
    <div className="content">
      <PageHero
        kicker="Operations · Action Center"
        title="Action Center"
        sub="Prioritized recommendations from the forecasting engine · staff, supply, and capacity moves with quantified impact"
        image="/images/actions-bg.jpg"
        actions={<button className="btn"><Icon name="download" size={14} />Export</button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPI label="Critical" value="2" foot="resolve today" />
        <KPI label="High priority" value="4" foot="this week" />
        <KPI label="Estimated savings" value="$48k" trend="this week" trendDir="up" />
        <KPI label="Resolution rate" value="91" unit="%" trend="+4%" trendDir="up" foot="last 30 days" />
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
            {t} <span className="tag" style={{ marginLeft: 6 }}>{counts[t]}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((a) => (
          <div key={a.title} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ width: 4, alignSelf: 'stretch', background: a.p === 'danger' ? '#dc2626' : a.p === 'warning' ? '#d97706' : '#2563eb', borderRadius: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={'tag tag-' + a.p}>{a.t}</span>
                  {a.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                  {a.impact !== '—' && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginLeft: 'auto' }}>Impact: {a.impact}</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{a.title}</div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{a.desc}</div>
                {a.why && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: '#fafbfc', borderRadius: 6, fontSize: 12, color: '#64748b' }}>
                    <strong style={{ color: '#1e6091' }}>Why:</strong> {a.why}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 110 }}>
                <button className="btn btn-primary btn-sm">Approve</button>
                <button className="btn btn-sm">Snooze</button>
                <button className="btn btn-sm" onClick={() => setDismissed((prev) => new Set([...prev, a.title]))}>Dismiss</button>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            No actions in this category.
          </div>
        )}
      </div>
    </div>
  );
}
