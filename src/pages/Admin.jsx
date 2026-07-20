import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { aiApi } from '../api/aiClient';

const C = { ink: '#0f172a', muted: '#64748b', teal: '#0d9488', navy: '#1e6091', red: '#dc2626', amber: '#d97706', green: '#15803d', line: '#eef0f3' };

// NOTE: client-side gate only — a deliberate placeholder. Production must replace
// this with real authentication / role-based access control (RBAC).
const ADMIN_CODE = 'hf-admin-2026';

// Real model identities (hidden from the public app; shown only here, to the
// accountable admin — resolves the transparency vs. no-bias tension).
const REAL_NAME = { ml: 'Gradient Boosting (XGBoost-family)', statistical: 'SARIMAX' };

export default function Admin() {
  const [code, setCode] = useState('');
  const [ok, setOk] = useState(false);

  if (!ok) {
    return (
      <div className="content">
        <PageHero kicker="Restricted · Governance" title="Admin & AI Governance"
          sub="Authorised users only. Real model identities, performance figures and the AI audit trail live here." image="/images/dashboard-bg.jpg" />
        <div className="card" style={{ maxWidth: 460 }}>
          <div className="card-body">
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
              This area exposes information kept out of the public app (exact model names, accuracy, and the AI audit log). Enter the admin code to continue.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="password" value={code} onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setOk(code === ADMIN_CODE)}
                placeholder="Admin code" className="input"
                style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit' }} />
              <button className="btn btn-primary" onClick={() => setOk(code === ADMIN_CODE)}>Unlock</button>
            </div>
            {code && code !== ADMIN_CODE && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>Incorrect code.</div>}
            <div style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>Demo gate only — replace with real authentication in production.</div>
          </div>
        </div>
      </div>
    );
  }
  return <AdminContent />;
}

function AdminContent() {
  const [usage, setUsage] = useState(null);
  const [engines, setEngines] = useState(null);
  const [audit, setAudit] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => {
    aiApi.usage().then(setUsage).catch(() => {});
    aiApi.audit(60).then(setAudit).catch((e) => setErr(e.message));
    api.forecast.engines({ group: 'g1' }).then((d) => setEngines(d?.engines || null)).catch(() => {});
  };
  useEffect(load, []);

  return (
    <div className="content">
      <PageHero kicker="Restricted · Governance" title="Admin & AI Governance"
        sub="AI system card, model performance (real figures), usage, and the durable audit trail."
        image="/images/dashboard-bg.jpg"
        actions={<button className="btn" onClick={load}><Icon name="refresh" size={14} />Refresh</button>} />

      {/* ── AI SYSTEM CARD ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${C.navy}` }}>
        <div className="card-header"><div className="card-title">AI System Card</div>
          <span className="tag" style={{ fontSize: 10 }}>Responsible-AI documentation</span></div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18 }}>
          <Field label="Intended use" v="Operational decision-support: forecast ED arrivals and turn them into staffing rosters and supply reorder plans. Explanations and a read-only assistant for managers and charge nurses." />
          <Field label="NOT intended for" v="Clinical decisions about individual patients, diagnosis, triage or treatment. The assistant cannot prescribe care and must not be used as a medical device." danger />
          <Field label="Human oversight" v="The AI is READ-ONLY. It can look up and explain, but never changes a schedule, places an order or moves stock. A human reviews and approves every action (Action Center / Staff / Supply / Optimization)." />
          <Field label="Data sent to the AI" v="Aggregate operational numbers only — forecasts, staffing KPIs, supply counts. NO patient-level / personal data ever reaches the model, so POPIA cross-border (s72) personal-information rules are not engaged by the AI layer." />
          <Field label="Provider & models" v="Anthropic Claude API via a server-side proxy (key never exposed to the browser). Cost-tiered: a fast model for explanations, a reasoning model for chat/actions. Outputs are confidentiality-scrubbed (hospital identity) and grounded (no invented numbers)." />
          <Field label="Known limitations" v="Forecasts carry uncertainty — always plan with the day's likely range, not the single number. The assistant can still be wrong; verify before acting. Accuracy figures are shown to admins (below), hidden from front-line users by design." />
          <Field label="Accountability" v="Named accountable owner: [assign on deployment]. Every AI call is recorded in the durable audit trail below. Incident / concern escalation: contact the platform administrator." />
          <Field label="Compliance posture" v="Aligned with WHO AI-for-health principles (human oversight, transparency, accountability) and the WHO 2024 generative-AI guidance. Not 'high-risk' under the EU AI Act (administrative/operational, not a medical device)." />
        </div>
      </div>

      {/* ── MODEL PERFORMANCE (real figures) ───────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div>
          <div className="card-title">Model performance · governance view</div>
          <div className="card-sub">Real model identities & validation accuracy — kept out of the public app to avoid biasing front-line users.</div>
        </div></div>
        <div className="table-scroll" role="region" tabIndex={0} aria-label="Data table (scrolls sideways on small screens)"><table className="tbl">
          <thead><tr><th>Public label</th><th>Actual model</th><th className="num">Validation accuracy</th><th className="num">Typical miss</th></tr></thead>
          <tbody>
            {!engines && <tr><td colSpan={4} style={{ color: C.muted, padding: 16 }}>Loading… (build G1 if empty)</td></tr>}
            {engines && [['ml', 'Best ML model'], ['statistical', 'Best statistical model']].map(([k, label]) => (
              <tr key={k}>
                <td>{label}</td>
                <td className="mono">{REAL_NAME[k]}</td>
                <td className="num" style={{ fontWeight: 700, color: (engines[k]?.accuracy_pct ?? 0) >= 80 ? C.green : C.amber }}>
                  {engines[k]?.accuracy_pct != null ? `${Math.round(engines[k].accuracy_pct)}%` : '—'}
                </td>
                <td className="num">{engines[k]?.mae != null ? `±${Math.round(engines[k].mae)} patients/day` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* ── AI USAGE ───────────────────────────────────── */}
      <div className="grid-kpi">
        <KPIc label="AI spend today" value={usage ? `$${(usage.spent_today_usd ?? 0).toFixed(3)}` : '—'} foot={usage ? `of $${usage.daily_budget_usd} daily cap` : ''} />
        <KPIc label="Calls today" value={usage?.calls_today ?? '—'} foot="across all surfaces" />
        <KPIc label="Audit records" value={audit?.stats?.total_events ?? '—'} foot="durable, on disk" />
        <KPIc label="Total AI cost (logged)" value={audit?.stats ? `$${(audit.stats.total_cost_usd ?? 0).toFixed(3)}` : '—'} foot="since the log began" />
      </div>

      {/* ── AUDIT TRAIL ────────────────────────────────── */}
      <div className="card" style={{ marginTop: 4 }}>
        <div className="card-header"><div>
          <div className="card-title">AI audit trail · most recent</div>
          <div className="card-sub">Durable, append-only log of every AI interaction · {audit?.stats?.log_file || ''}</div>
        </div></div>
        <div className="table-scroll" role="region" tabIndex={0} aria-label="Data table (scrolls sideways on small screens)"><table className="tbl">
          <thead><tr><th>When (UTC)</th><th>Surface</th><th>Model</th><th>Request</th><th>Response (scrubbed)</th><th className="num">Tokens</th><th className="num">Cost</th></tr></thead>
          <tbody>
            {err && <tr><td colSpan={7} style={{ color: C.red, padding: 16 }}>{err}</td></tr>}
            {!audit && !err && <tr><td colSpan={7} style={{ color: C.muted, padding: 16 }}>Loading audit log…</td></tr>}
            {audit && audit.events.length === 0 && <tr><td colSpan={7} style={{ color: C.muted, padding: 16 }}>No AI calls logged yet — use the assistant or a “Read this for me” panel, then refresh.</td></tr>}
            {audit?.events?.map((e, i) => (
              <tr key={i}>
                <td style={{ fontSize: 11.5, whiteSpace: 'nowrap' }} className="mono">{(e.ts || '').replace('T', ' ').slice(0, 19)}</td>
                <td><span className="tag" style={{ fontSize: 10 }}>{e.surface}</span></td>
                <td style={{ fontSize: 11.5, color: C.muted }} className="mono">{e.model}</td>
                <td style={{ fontSize: 11.5, color: C.muted, maxWidth: 220 }}>{clip(e.request, 90)}</td>
                <td style={{ fontSize: 11.5, color: C.ink, maxWidth: 320 }}>{clip(e.response, 140)}</td>
                <td className="num" style={{ fontSize: 11.5 }}>{(e.in_tokens || 0) + (e.out_tokens || 0)}</td>
                <td className="num" style={{ fontSize: 11.5 }}>${(e.cost_usd ?? 0).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div style={{ fontSize: 11, color: C.muted, margin: '14px 0 24px', lineHeight: 1.6, maxWidth: 760 }}>
        The audit log records only aggregate operational content and confidentiality-scrubbed responses — no patient data and no hospital identity. For a real deployment, sign Anthropic's data-processing agreement, enable Zero Data Retention, set data residency, move the API key to a secrets manager, and replace this demo gate with proper authentication.
      </div>
    </div>
  );
}

function Field({ label, v, danger }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: danger ? C.red : C.navy, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: C.ink, marginTop: 5, lineHeight: 1.6 }}>{v}</div>
    </div>
  );
}

function KPIc({ label, value, foot }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value"><span>{value}</span></div>
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}

const clip = (s, n) => (!s ? '' : s.length > n ? s.slice(0, n) + '…' : s);
