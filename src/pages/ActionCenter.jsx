/* Action Center — a ranked to-do list whose decisions OUTLIVE the page.
 *
 * Approve / snooze / dismiss used to be `useState({})`: every decision was gone
 * on refresh, nothing recorded who made it, and "what happened to the thing we
 * approved last Tuesday?" had no answer. Decisions now go to the server, carry
 * the signed-in user, and keep a history — which is the whole point of the
 * loop. A list that forgets is a demo, not an operations tool.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { aiApi } from '../api/aiClient';
import { api } from '../api/client';
import { useSession } from '../auth/SessionContext';
import SignIn from '../auth/SignIn';

const URGENCY = {
  high:   { tag: 'tag-danger',  label: 'High',   dot: 'var(--danger)',  glyph: '!' },
  medium: { tag: 'tag-warning', label: 'Medium', dot: 'var(--warning)', glyph: '•' },
  low:    { tag: 'tag-info',    label: 'Low',    dot: 'var(--brand)',   glyph: '·' },
};
const CAT = { staff: 'Staff', supply: 'Supply', capacity: 'Capacity' };
const TABS = ['All', 'staff', 'supply', 'capacity'];

const STATUS_LABEL = {
  open: null,
  approved:  { text: '✓ Approved',  cls: 'tag-success' },
  snoozed:   { text: '⏲ Snoozed',   cls: 'tag-warning' },
  dismissed: { text: '✕ Dismissed', cls: '' },
  done:      { text: '✓ Done',      cls: 'tag-success' },
};

function when(ts) {
  if (!ts) return null;
  try { return new Date(ts * 1000).toLocaleString(); } catch { return null; }
}

export default function ActionCenter() {
  const { can, user } = useSession();
  const [actions, setActions] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('All');
  const [showDecided, setShowDecided] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  const load = useCallback(() => {
    setActions(null); setError(null);
    aiApi.actions()
      .then((d) => {
        if (d.error) { setError(d.message || 'Could not generate actions.'); setActions([]); }
        else { setActions(d.actions || []); setSummary(d.summary || null); }
      })
      .catch((e) => { setError(e.message || 'Could not reach the assistant.'); setActions([]); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (a, status, extra = {}) => {
    setBusyKey(a.action_key);
    try {
      await api.actions.decide({
        action_key: a.action_key,
        title: a.title,
        category: a.category,
        urgency: a.urgency,
        status,
        ...extra,
      });
      load();
    } catch (e) {
      setError(e.detail?.message || e.message || 'Could not save that decision.');
    } finally {
      setBusyKey(null);
    }
  };

  const all = actions || [];
  const visible = useMemo(() => all.filter((a) => {
    if (tab !== 'All' && a.category !== tab) return false;
    if (!showDecided && (a.status === 'dismissed' || a.status === 'done')) return false;
    return true;
  }), [all, tab, showDecided]);

  const pending = all.filter((a) => a.status === 'open').length;
  const canDecide = can('planner');

  return (
    <div className="content">
      <PageHero
        kicker="Operations · Action Center"
        title="Recommended Actions"
        sub="The assistant turns next week's plan — the lawful roster and reorder list — plus live forecast, staffing and supply signals into a ranked to-do list. Decisions are recorded against your name and kept."
        image="/images/actions-bg.jpg"
        actions={
          <button className="btn" onClick={load}>
            <Icon name="refresh" size={14} />Re-generate
          </button>
        }
      />

      {summary && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-body" style={{ display: 'flex', gap: 'var(--space-m)', flexWrap: 'wrap' }}>
            <Stat label="Open" value={summary.counts?.open ?? 0} />
            <Stat label="Approved" value={summary.counts?.approved ?? 0} />
            <Stat label="Snoozed" value={summary.counts?.snoozed ?? 0} />
            <Stat label="Done" value={summary.counts?.done ?? 0} />
            <Stat label="Overdue" value={summary.overdue ?? 0} tone={summary.overdue ? 'danger' : undefined} />
            <Stat label="Decisions recorded" value={summary.decisions_recorded ?? 0} />
          </div>
        </div>
      )}

      {!canDecide && (
        <div style={{ marginBottom: 14 }}>
          <SignIn
            title="Sign in to act on these"
            sub="You can read the list without signing in. Recording a decision needs the planner role, so the trail always names a real person."
          />
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {actions == null ? 'Generating actions…' : `${pending} open`}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <button key={t} className="btn btn-sm" onClick={() => setTab(t)}
                aria-pressed={tab === t}
                style={tab === t ? { background: 'var(--brand-soft)', color: 'var(--brand)', borderColor: 'var(--brand)' } : {}}>
                {t === 'All' ? 'All' : CAT[t]}
              </button>
            ))}
            <button className="btn btn-sm" onClick={() => setShowDecided((v) => !v)} aria-pressed={showDecided}>
              {showDecided ? 'Hide closed' : 'Show closed'}
            </button>
          </div>
        </div>

        <div style={{ padding: '4px 16px 16px' }}>
          {actions == null && (
            <div style={{ color: 'var(--text-3)', padding: 20 }}>
              Reading the live forecast, staffing and supply signals…
            </div>
          )}
          {error && (
            <div role="alert" style={{ color: 'var(--danger)', padding: 16 }}>
              {error}
              <div style={{ fontSize: 'var(--step--2)', color: 'var(--text-3)', marginTop: 6 }}>
                Check that G1 / G3 are built on Prepare and the assistant key is set.
              </div>
            </div>
          )}
          {actions != null && !error && visible.length === 0 && (
            <div style={{ color: 'var(--success)', padding: 16 }}>
              ✓ Nothing needs attention right now.
            </div>
          )}

          {visible.map((a) => {
            const u = URGENCY[a.urgency] || URGENCY.low;
            const badge = STATUS_LABEL[a.status];
            const dimmed = a.status === 'snoozed' || a.status === 'dismissed';
            const busy = busyKey === a.action_key;
            return (
              <div key={a.action_key} style={{
                display: 'flex', gap: 14, padding: '14px 0',
                borderBottom: '1px solid var(--divider)', opacity: dimmed ? 0.6 : 1,
              }}>
                {/* Glyph as well as colour: urgency must not be signalled by hue alone. */}
                <span aria-hidden="true" style={{
                  width: 16, textAlign: 'center', color: u.dot, fontWeight: 800, marginTop: 2, flexShrink: 0,
                }}>{u.glyph}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`tag ${u.tag}`} style={{ fontSize: 'var(--step--2)' }}>{u.label}</span>
                    <span className="tag" style={{ fontSize: 'var(--step--2)' }}>{CAT[a.category] || a.category}</span>
                    {badge && <span className={`tag ${badge.cls}`} style={{ fontSize: 'var(--step--2)' }}>{badge.text}</span>}
                    <strong style={{ fontSize: 'var(--step--1)', color: 'var(--text)' }}>{a.title}</strong>
                  </div>
                  <div style={{ fontSize: 'var(--step--1)', color: 'var(--text-2)', marginTop: 4, lineHeight: 1.55 }}>
                    {a.reason}
                  </div>
                  {a.decided_by && (
                    <div style={{ fontSize: 'var(--step--2)', color: 'var(--text-3)', marginTop: 6 }}>
                      {a.status} by <strong>{a.decided_by}</strong>
                      {when(a.decided_at) ? ` · ${when(a.decided_at)}` : ''}
                      {a.owner ? ` · owner ${a.owner}` : ''}
                      {a.due_date ? ` · due ${a.due_date}` : ''}
                      {a.note ? ` · “${a.note}”` : ''}
                      {' · '}
                      <button className="btn-link" type="button"
                        onClick={() => setHistoryFor(historyFor === a.action_key ? null : a.action_key)}>
                        {historyFor === a.action_key ? 'hide history' : 'history'}
                      </button>
                    </div>
                  )}
                  {historyFor === a.action_key && <History actionKey={a.action_key} />}
                </div>

                {canDecide && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {a.status === 'open' || a.status === 'snoozed' ? (
                      <>
                        <button className="btn btn-sm btn-primary" disabled={busy}
                          onClick={() => decide(a, 'approved', { owner: user?.username })}>
                          {busy ? '…' : 'Approve'}
                        </button>
                        <button className="btn btn-sm" disabled={busy}
                          onClick={() => decide(a, a.status === 'snoozed' ? 'open' : 'snoozed',
                                                a.status === 'snoozed' ? {} : { snooze_hours: 24 })}>
                          {a.status === 'snoozed' ? 'Unsnooze' : 'Snooze 24h'}
                        </button>
                        <button className="btn btn-sm" style={{ color: 'var(--danger)' }} disabled={busy}
                          onClick={() => decide(a, 'dismissed')}>Dismiss</button>
                      </>
                    ) : (
                      <>
                        {a.status === 'approved' && (
                          <button className="btn btn-sm" disabled={busy}
                            onClick={() => decide(a, 'done')}>Mark done</button>
                        )}
                        <button className="btn btn-sm" disabled={busy}
                          onClick={() => decide(a, 'open')}>Reopen</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {actions != null && visible.length > 0 && (
            <div style={{ fontSize: 'var(--step--2)', color: 'var(--text-3)', marginTop: 12, lineHeight: 1.5 }}>
              Ranked by the assistant from your live numbers. Suggestions only — nothing changes in the
              hospital's systems until a person acts on it. No patient data is used.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--step--2)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{
        fontSize: 'var(--step-3)', fontWeight: 800,
        color: tone === 'danger' ? 'var(--danger)' : 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
    </div>
  );
}

function History({ actionKey }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    api.actions.history({ action_key: actionKey, limit: 20 })
      .then((d) => alive && setRows(d.history || []))
      .catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [actionKey]);

  if (rows == null) return <div style={{ fontSize: 'var(--step--2)', color: 'var(--text-3)', marginTop: 6 }}>Loading history…</div>;
  if (!rows.length) return <div style={{ fontSize: 'var(--step--2)', color: 'var(--text-3)', marginTop: 6 }}>No earlier decisions.</div>;

  return (
    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 'var(--step--2)', color: 'var(--text-3)', lineHeight: 1.7 }}>
      {rows.map((r) => (
        <li key={r.id}>
          <strong>{r.status}</strong> by {r.decided_by}
          {when(r.decided_at) ? ` · ${when(r.decided_at)}` : ''}
          {r.note ? ` · “${r.note}”` : ''}
        </li>
      ))}
    </ul>
  );
}
