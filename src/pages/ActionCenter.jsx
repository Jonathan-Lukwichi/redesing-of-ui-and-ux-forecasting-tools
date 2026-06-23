import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { aiApi } from '../api/aiClient';

const URGENCY = {
  high:   { tag: 'tag-danger',  label: 'High',   dot: '#dc2626' },
  medium: { tag: 'tag-warning', label: 'Medium', dot: '#d97706' },
  low:    { tag: 'tag-info',    label: 'Low',    dot: '#1e6091' },
};
const CAT = { staff: 'Staff', supply: 'Supply', capacity: 'Capacity' };
const TABS = ['All', 'staff', 'supply', 'capacity'];

export default function ActionCenter() {
  const [actions, setActions] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('All');
  const [state, setState] = useState({}); // id -> 'approved'|'snoozed'|'dismissed'

  const load = () => {
    setActions(null); setError(null);
    aiApi.actions()
      .then((d) => {
        if (d.error) { setError(d.message || 'Could not generate actions.'); setActions([]); }
        else setActions(d.actions || []);
      })
      .catch((e) => { setError(e.message || 'error'); setActions([]); });
  };
  useEffect(load, []);

  const visible = (actions || []).filter((a) =>
    (tab === 'All' || a.category === tab) && state[a.id] !== 'dismissed');
  const pending = (actions || []).filter((a) => !state[a.id]).length;
  const set = (id, v) => setState((s) => ({ ...s, [id]: v }));

  return (
    <div className="content">
      <PageHero
        kicker="Operations · Action Center"
        title="Recommended Actions"
        sub="The Analyst Assistant turns next week's optimization plan — the lawful roster and reorder list — plus live forecast, staffing and supply signals into a ranked to-do list. Nothing happens until you approve."
        image="/images/actions-bg.jpg"
        actions={<>
          <button className="btn" onClick={load}><Icon name="refresh" size={14} />Re-generate</button>
        </>}
      />

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {actions == null ? 'Generating actions…' : `${pending} pending`}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TABS.map((t) => (
              <button key={t} className="btn btn-sm" onClick={() => setTab(t)}
                style={tab === t ? { background: '#e8f1f8', color: '#1e6091', borderColor: '#1e6091' } : {}}>
                {t === 'All' ? 'All' : CAT[t]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '4px 16px 16px' }}>
          {actions == null && (
            <div style={{ color: '#64748b', padding: 20 }}>
              Reading the live forecast, staffing, and supply signals…
            </div>
          )}
          {error && (
            <div style={{ color: '#7f1d1d', padding: 16 }}>
              {error}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                Make sure the data is built (G1 / G3 on Prepare) and the assistant key is set.
              </div>
            </div>
          )}
          {actions != null && !error && visible.length === 0 && (
            <div style={{ color: '#15803d', padding: 16 }}>✓ Nothing needs attention right now.</div>
          )}

          {visible.map((a) => {
            const u = URGENCY[a.urgency] || URGENCY.low;
            const st = state[a.id];
            return (
              <div key={a.id} style={{
                display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid #eef0f3',
                opacity: st === 'snoozed' ? 0.55 : 1,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.dot, marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`tag ${u.tag}`} style={{ fontSize: 10 }}>{u.label}</span>
                    <span className="tag" style={{ fontSize: 10 }}>{CAT[a.category] || a.category}</span>
                    <strong style={{ fontSize: 14, color: '#0f172a' }}>{a.title}</strong>
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', marginTop: 4, lineHeight: 1.55 }}>{a.reason}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  {st === 'approved' ? (
                    <span className="tag tag-success" style={{ alignSelf: 'center' }}>✓ Approved</span>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => set(a.id, 'approved')}>Approve</button>
                      <button className="btn btn-sm" onClick={() => set(a.id, st === 'snoozed' ? undefined : 'snoozed')}>
                        {st === 'snoozed' ? 'Unsnooze' : 'Snooze'}
                      </button>
                      <button className="btn btn-sm" style={{ color: '#b91c1c' }} onClick={() => set(a.id, 'dismissed')}>Dismiss</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {actions != null && visible.length > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, lineHeight: 1.5 }}>
              AI-ranked from your live numbers. Suggestions only — nothing is changed until you approve. No patient data is used.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
