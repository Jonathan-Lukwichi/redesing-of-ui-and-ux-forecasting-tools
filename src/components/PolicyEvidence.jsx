import { useEffect, useState } from 'react';
import Icon from './Icon';
import { LineChart } from './Charts';
import { api } from '../api/client';

/* Step 2 of the Optimization page (Plan C): choose the STANDING reorder
   policy. Evidence (policy ladder + lead-time sweep) computes only on
   demand; deployable families carry a "Use this policy" button; the adopted
   family can be parameter-tuned per item. Oracle is gone from the product;
   naive stays as the benchmark floor and is never adoptable. */

const C = { ink: '#0f172a', muted: '#64748b', teal: '#0d9488', navy: '#1e6091', red: '#dc2626' };
const zar = (n) => (n == null ? '—' : 'R ' + Math.round(n).toLocaleString('en-ZA'));

const POLICY_ORDER = ['naive', 's_q', 'r_s', 'ss_static', 'dynamic'];
const POLICY_LABEL = {
  naive: 'Naive monthly bulk', s_q: '(s, Q) reorder / EOQ', r_s: '(R, S) periodic',
  ss_static: 'Static (s, S)', dynamic: 'Forecast base-stock',
};
const POLICY_SHORT = { naive: 'Naive', s_q: '(s,Q)', r_s: '(R,S)', ss_static: '(s,S)', dynamic: 'Base-stock' };
const POLICY_COLOR = { naive: '#94a3b8', s_q: '#7c3aed', r_s: '#0ea5e9', ss_static: '#d97706', dynamic: '#0d9488' };
const DEPLOYABLE = ['s_q', 'r_s', 'ss_static', 'dynamic'];
const LEAD_TIME_CHOICES = [3, 5, 7, 10, 14, 21, 30];

function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: C.muted, minWidth: 0 }}>{label}</span>
      <span className="tnum" style={{ fontWeight: 600, color: valueColor || C.ink, flexShrink: 0 }}>{value}</span>
    </div>
  );
}

export default function PolicyEvidence({ onPolicyChange }) {
  const [state, setState] = useState(null);        // standing-policy state (light GET)
  const [compare, setCompare] = useState(null);
  const [sweep, setSweep] = useState(null);
  const [tune, setTune] = useState(null);          // last tuning result shown
  const [busy, setBusy] = useState({});
  const [err, setErr] = useState(null);
  const [cmpLead, setCmpLead] = useState(null);

  const setB = (k, v) => setBusy((b) => ({ ...b, [k]: v }));
  const notify = (s) => { setState(s); onPolicyChange && onPolicyChange(s); };

  useEffect(() => {
    let alive = true;
    api.optimization.policy().then((d) => { if (alive) notify(d.state); }).catch(() => {});
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runCompare = async (leadTime = cmpLead) => {
    setB('compare', true); setErr(null);
    try { setCompare(await api.supply.compareDemo(leadTime != null ? { leadTime } : {})); }
    catch (e) { setErr(e.message || String(e)); }
    finally { setB('compare', false); }
  };
  const runSweep = async () => {
    setB('sweep', true); setErr(null);
    try { setSweep(await api.supply.sweepDemo()); }
    catch (e) { setErr(e.message || String(e)); }
    finally { setB('sweep', false); }
  };
  const loadLast = async () => {
    setB('load', true); setErr(null);
    try {
      const [c, s, t] = await Promise.all([
        api.supply.compareLast().catch(() => null),
        api.supply.sweepLast().catch(() => null),
        api.optimization.tuneLast().catch(() => null),
      ]);
      if (c?.result) setCompare(c.result);
      if (s?.result) setSweep(s.result);
      const cur = state?.policy;
      if (t?.results && cur && t.results[cur]) setTune(t.results[cur]);
      if (!c?.result && !s?.result) setErr('No previous evidence runs on the server yet.');
    } finally { setB('load', false); }
  };
  const adopt = async (p) => {
    setB('adopt', true); setErr(null);
    try {
      const d = await api.optimization.setPolicy(p);
      notify(d.state);
      setTune(null);
    } catch (e) { setErr(e.detail?.message || e.message || String(e)); }
    finally { setB('adopt', false); }
  };
  const runTune = async () => {
    if (!state?.policy) return;
    setB('tune', true); setErr(null);
    try {
      const t = await api.optimization.tunePolicy(state.policy);
      setTune(t);
      const d = await api.optimization.policy();   // refresh stored params
      notify(d.state);
    } catch (e) { setErr(e.detail?.message || e.message || String(e)); }
    finally { setB('tune', false); }
  };

  const bestPolicy = compare
    ? DEPLOYABLE.reduce((best, p) => {
        const c = compare.policies?.[p]?.total_cost_mean;
        if (c == null) return best;
        return best == null || c < compare.policies[best].total_cost_mean ? p : best;
      }, null)
    : null;

  return (
    <div className="card" style={{ marginBottom: 16, border: '1px solid #99f6e4' }}>
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          <div className="card-title">Standing reorder policy</div>
          <div className="card-sub">
            Your default way of ordering. Adopted:{' '}
            <b style={{ color: C.teal }}>{state?.label || '…'}</b>
            {state?.tuned_at
              ? <span className="tag tag-success" style={{ fontSize: 10, marginLeft: 6 }}>tuned</span>
              : <span className="tag" style={{ fontSize: 10, marginLeft: 6 }}>textbook parameters</span>}
            {' '}· the supply run below optimizes within this family.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={loadLast} disabled={busy.load}>
            <Icon name="refresh" size={12} /> {busy.load ? 'Loading…' : 'Load last results'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => runCompare()} disabled={busy.compare}>
            <Icon name="chart" size={13} /> {busy.compare ? 'Comparing…' : 'Compare policies (evidence)'}
          </button>
        </div>
      </div>
      <div className="card-body">
        {err && (
          <div style={{ padding: 12, background: '#fef2f2', color: C.red, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>{err}</div>
        )}

        {!compare && (
          <div style={{ color: C.muted, fontSize: 13, padding: '8px 0' }}>
            Press <strong>Compare policies</strong> to simulate the four deployable families
            (plus the naive benchmark) on the real 30-item panel — then adopt the winner
            for your conditions. Nothing runs until you ask.
          </div>
        )}

        {compare && (
          <>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: C.muted, marginRight: 4 }}>Lead time</span>
              {LEAD_TIME_CHOICES.map((L) => (
                <button key={L} className="btn btn-sm" disabled={busy.compare}
                  onClick={() => { setCmpLead(L); runCompare(L); }}
                  style={cmpLead === L ? { background: '#e8f1f8', color: C.navy, borderColor: C.navy } : {}}>
                  {L}d
                </button>
              ))}
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>
                mean {compare.lead_time_mean_days?.toFixed(1)}d · {compare.basket}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(190px, 100%),1fr))', gap: 12 }}>
              {POLICY_ORDER.map((p) => {
                const s = compare.policies?.[p];
                if (!s) return null;
                const isWinner = p === bestPolicy;
                const isBenchmark = p === 'naive';
                const isAdopted = state?.policy === p;
                const delta = s.delta_vs_baseline_pct;
                return (
                  <div key={p} style={{
                    border: `1px solid ${isAdopted ? C.navy : isWinner ? C.teal : '#e4e7eb'}`,
                    borderStyle: isBenchmark ? 'dashed' : 'solid',
                    borderRadius: 8, padding: '14px 14px',
                    background: isAdopted ? '#f0f6fc' : isWinner ? '#ecfeff' : 'white',
                    opacity: busy.compare ? 0.55 : 1, transition: 'opacity .15s',
                    display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
                  }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: POLICY_COLOR[p], textTransform: 'uppercase', letterSpacing: 1 }}>
                        {POLICY_LABEL[p]}
                      </span>
                      {isWinner && <span style={{ fontSize: 9, fontWeight: 700, color: 'white', background: C.teal, borderRadius: 4, padding: '2px 6px' }}>BEST HERE</span>}
                      {isAdopted && <span style={{ fontSize: 9, fontWeight: 700, color: 'white', background: C.navy, borderRadius: 4, padding: '2px 6px' }}>ADOPTED</span>}
                      {isBenchmark && <span style={{ fontSize: 9, fontWeight: 600, color: C.muted }}>benchmark · not deployable</span>}
                    </div>
                    <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 4 }}>{zar(s.total_cost_mean)}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>total cost · {compare.sim_horizon_days}d sim</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, fontSize: 12 }}>
                      <Row label="Service" value={`${(s.service_level_mean * 100).toFixed(2)}%`} />
                      <Row label="Stockouts" value={s.stockouts_mean.toFixed(1)} />
                      <Row label="vs (s,S)" value={`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
                        valueColor={p === 'ss_static' ? C.muted : delta > 0 ? '#16a34a' : C.red} />
                    </div>
                    {DEPLOYABLE.includes(p) && (
                      <button className="btn btn-sm" onClick={() => adopt(p)}
                        disabled={busy.adopt || isAdopted}
                        style={{ marginTop: 10, justifyContent: 'center', ...(isAdopted ? {} : { borderColor: C.teal, color: C.teal }) }}>
                        {isAdopted ? 'Current policy' : 'Use this policy'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Parameter tuning for the adopted family */}
        <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={runTune} disabled={busy.tune || !state}>
            <Icon name="cpu" size={13} /> {busy.tune ? 'Tuning…' : `Tune ${state?.label || 'policy'} parameters`}
          </button>
          {tune && (
            <span style={{ fontSize: 12, color: C.ink }}>
              Tuned per item across {tune.n_items} items:{' '}
              <b style={{ color: '#16a34a' }}>{tune.saving_vs_default_pct}% cheaper</b> than textbook
              parameters ({zar(tune.default_cost_mean)} → {zar(tune.tuned_cost_mean)}) ·
              service {tune.service_level_mean}%
            </span>
          )}
          {!tune && <span style={{ fontSize: 11.5, color: C.muted }}>Grid-searches each item's parameters within the adopted family (on demand).</span>}
        </div>

        {/* Lead-time sweep (secondary evidence) */}
        <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>Where forecasting pays · cost vs lead time</div>
            <button className="btn btn-sm" onClick={runSweep} disabled={busy.sweep}>
              <Icon name="forecast" size={13} /> {busy.sweep ? 'Sweeping…' : 'Run lead-time sweep'}
            </button>
          </div>
          {!sweep && <div style={{ fontSize: 11.5, color: C.muted }}>Simulates every policy across 3–30 day lead times to find where the forecast-driven policy stops winning.</div>}
          {sweep && (
            <>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
                {sweep.crossover_lead_time_days
                  ? <>Forecast base-stock beats static (s,S) up to a mean lead time of about <b>{sweep.crossover_lead_time_days} days</b>.</>
                  : 'Comparing policies across lead times.'}
              </div>
              <LineChart
                height={240}
                xLabels={sweep.lead_times.map((L) => `${L}d`)}
                series={POLICY_ORDER.map((p) => ({ data: sweep.series[p], color: POLICY_COLOR[p] }))}
              />
              <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                {POLICY_ORDER.map((p) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#334155' }}>
                    <span style={{ width: 16, height: 3, background: POLICY_COLOR[p], borderRadius: 2 }} />
                    {POLICY_SHORT[p]}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
