import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi } from '../api/aiClient';
import { api } from '../api/client';
import { runProgress, usePipelineContext } from './PipelineStatus';

// Global "Ask" assistant — a floating button + chat panel, on every page.
// The assistant reads: it looks up forecasts, supply and staffing and explains
// them. It runs pipeline steps only after the user confirms its offer, with the
// Run button on the offer card or a typed "yes"; it never changes anything else.
// The card is drawn from the server's plan (the reply's trailer), never from
// the model's words, and only the visible text goes back in the chat history.

const POLL_MS = 2000;
const YES_RE = /^\s*(yes|y|yeah|yep|ok|okay|sure|go|go ahead|run|run it|do it|please do|yes please)\s*[.!]*\s*$/i;
const FINISHED_PROMPT = 'The run I confirmed has finished. Check its status and results, then summarise them for me.';
const STOPPED_PROMPT = 'The run I confirmed stopped before the end. Check its status and tell me plainly what went wrong and what to do.';
const ENDED = ['done', 'amber', 'skipped', 'failed'];
const REASON_NOTE = { needed: 'needed first', rerun: 're-run so every page matches' };

function fmt(s) {
  const t = Math.max(0, Math.round(Number(s) || 0));
  if (t < 60) return `${t} s`;
  const m = Math.floor(t / 60);
  const r = t % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

// Seconds the plan still has to go: every stage that has not ended. The sample
// load is not a status stage, so it counts while loading or before any stage starts.
function remainingSeconds(proposal, s) {
  const stages = s?.stages || [];
  const started = stages.some((x) => x.status && x.status !== 'pending');
  return (proposal?.stages || []).reduce((sum, { id, seconds }) => {
    if (id === 'load') return sum + (s?.loading || !started ? seconds : 0);
    const entry = stages.find((x) => x.id === id);
    return sum + (entry && ENDED.includes(entry.status) ? 0 : seconds);
  }, 0);
}

function lastAssistantIndex(msgs) {
  for (let j = msgs.length - 1; j >= 0; j -= 1) if (msgs[j].role === 'assistant') return j;
  return -1;
}

export default function AskChat({ onNavigate }) {
  const [open, setOpen] = useState(false);
  // {role:'user'|'assistant', content, hidden?, proposal?, run?}; run.phase is
  // active | starting | running | finished | stopped | refused | declined | inactive.
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [follow, setFollow] = useState(null);        // {index, proposal}: the run being followed
  const [runStatus, setRunStatus] = useState(null);  // its latest status
  const [pending, setPending] = useState(null);      // a hidden prompt waiting for the chat to be free
  const scrollRef = useRef(null);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const confirmingRef = useRef(false);               // one confirmation at a time, even on a double click
  const { setStatus } = usePipelineContext();
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;
  const setStatusRef = useRef(setStatus);
  setStatusRef.current = setStatus;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open, runStatus]);

  const go = (page) => {
    if (typeof page === 'string' && /^[a-z][a-z-]*$/.test(page)) navRef.current?.(page);
  };

  const patchRun = (i, patch) => setMsgs((m) => m.map((x, j) => (
    j === i ? { ...x, run: { ...x.run, ...patch } } : x)));

  const sendTurn = useCallback(async (content, { hidden = false } = {}) => {
    const userMsg = hidden ? { role: 'user', content, hidden: true } : { role: 'user', content };
    const history = [...msgsRef.current, userMsg];
    const idx = history.length;   // where the reply goes
    // Only role and visible text go back: never a card, a token or a trailer.
    const payload = history.filter((m) => m.content).map(({ role, content: c }) => ({ role, content: c }));
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    const setReply = (fn) => setMsgs((m) => m.map((x, j) => (j === idx ? fn(x) : x)));
    try {
      const { proposal, navigate } = await aiApi.chatTurn(payload, (visible) => {
        setReply((x) => ({ ...x, content: visible }));
      });
      if (proposal) {
        // A newer offer retires every earlier one still waiting for an answer.
        setMsgs((m) => m.map((x, j) => {
          if (j === idx) return { ...x, proposal, run: { phase: 'active' } };
          if (x.run?.phase === 'active') return { ...x, run: { ...x.run, phase: 'inactive', note: null } };
          return x;
        }));
      }
      if (navigate) go(navigate);
    } catch (e) {
      setReply((x) => ({ ...x, content: `[unavailable: ${e.message || 'error'}]` }));
    } finally {
      setBusy(false);
    }
  }, []);

  // A finished or stopped run asks the assistant for its summary once the chat is free.
  useEffect(() => {
    if (!pending || busy) return;
    setPending(null);
    sendTurn(pending, { hidden: true });
  }, [pending, busy, sendTurn]);

  // Follow the confirmed run until it ends, sharing each answer with the app shell.
  useEffect(() => {
    if (!follow) return undefined;
    let alive = true;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const s = await api.pipeline.status();
        if (!alive) return;
        setStatusRef.current?.(s);
        setRunStatus(s);
        if (s.running) return;
        alive = false;
        const failed = (s.stages || []).find((x) => x.status === 'failed');
        if (failed) {
          patchRun(follow.index, { phase: 'stopped', stoppedAt: failed.label || failed.id });
          setPending(STOPPED_PROMPT);
        } else {
          patchRun(follow.index, { phase: 'finished' });
          go(follow.proposal.page);
          setPending(FINISHED_PROMPT);
        }
        setFollow(null);
        setRunStatus(null);
      } catch {
        /* a missed answer: the next tick asks again */
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [follow]);

  const confirm = async (i, via) => {
    const m = msgsRef.current[i];
    if (!m?.proposal || m.run?.phase !== 'active' || confirmingRef.current) return;
    confirmingRef.current = true;
    const p = m.proposal;
    // The server decides whether the offer is still valid (it answers 409
    // proposal_expired with its own words), so a skewed device clock never blocks a run.
    patchRun(i, { phase: 'starting', note: null });
    try {
      const res = await aiApi.runProposal(p.token, via);
      if (res?.status) {
        setStatusRef.current?.(res.status);
        setRunStatus(res.status);
      }
      patchRun(i, { phase: 'running' });
      setFollow({ index: i, proposal: p });
    } catch (e) {
      // Only a busy pipeline leaves the offer open: it can be tried again later.
      patchRun(i, {
        phase: e.code === 'already_running' ? 'active' : 'refused',
        note: e.message || 'The run could not be started.',
      });
    } finally {
      confirmingRef.current = false;
    }
  };

  const send = () => {
    const q = input.trim();
    if (!q || busy) return;
    const all = msgsRef.current;
    const last = lastAssistantIndex(all);
    // A typed yes confirms the latest offer, and only while it is still open.
    if (YES_RE.test(q) && last >= 0 && all[last].proposal && all[last].run?.phase === 'active') {
      setMsgs((m) => [...m, { role: 'user', content: q }]);
      setInput('');
      confirm(last, 'typed');
      return;
    }
    setInput('');
    sendTurn(q);
  };

  const following = !!follow || !!pending || msgs.some((m) => m.run?.phase === 'starting');
  const newChatOff = busy || following || msgs.length === 0;
  const newChat = () => { if (newChatOff) return; setMsgs([]); setInput(''); };

  const SUGGEST = [
    'What can this app do?',
    'How does the forecast work?',
    'Why do we hold safety stock?',
    'Which supplies are at risk?',
  ];

  const btn = (primary, disabled) => ({
    border: primary ? 0 : '1px solid #c4b5fd', cursor: disabled ? 'default' : 'pointer',
    background: primary ? '#6d28d9' : '#fff', color: primary ? '#fff' : '#5b21b6',
    borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 12.5, fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
  });

  const renderCard = (m, i) => {
    const p = m.proposal;
    const run = m.run || {};
    const isFollowed = follow?.index === i;
    const progress = isFollowed ? runProgress(runStatus) : null;
    const left = isFollowed ? remainingSeconds(p, runStatus) : 0;
    const showButtons = run.phase === 'active' || run.phase === 'starting';
    const off = run.phase !== 'active';
    const ending = {
      starting: 'Starting…',
      finished: 'Finished',
      stopped: `Stopped at ${run.stoppedAt}`,
      declined: 'Not run.',
      inactive: 'A newer offer replaced this one.',
    }[run.phase];
    return (
      <div data-testid="chat-proposal" data-phase={run.phase} style={{
        alignSelf: 'stretch', minWidth: 0, border: '1px solid #ddd6fe', background: '#faf5ff',
        borderRadius: 12, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5, color: '#1e293b',
        opacity: run.phase === 'inactive' || run.phase === 'declined' ? 0.7 : 1,
      }}>
        <div style={{ fontWeight: 800, color: '#5b21b6', marginBottom: 6 }}>
          Ready to run · about {fmt(p.total_seconds)}
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(p.steps || []).map((s) => (
            <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <strong style={{ fontWeight: 700 }}>{s.label}</strong>
                {REASON_NOTE[s.reason] && <span style={{ color: '#64748b' }}> · {REASON_NOTE[s.reason]}</span>}
              </span>
              <span style={{ whiteSpace: 'nowrap', color: '#475569' }}>~{fmt(s.seconds)}</span>
            </li>
          ))}
        </ul>
        {isFollowed && progress && (
          <div data-testid="chat-run-progress" role="status" aria-live="polite" style={{
            marginTop: 8, color: '#5b21b6', fontWeight: 600, overflowWrap: 'anywhere',
          }}>
            {progress}{left > 0 ? ` · about ${fmt(left)} left` : ''}
          </div>
        )}
        {run.note && (
          <div role="status" style={{ marginTop: 8, color: '#b45309', overflowWrap: 'anywhere' }}>{run.note}</div>
        )}
        {ending && <div style={{ marginTop: 8, color: '#475569', fontWeight: 600 }}>{ending}</div>}
        {showButtons && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => confirm(i, 'button')} disabled={off} style={btn(true, off)}>Run</button>
            <button type="button" onClick={() => patchRun(i, { phase: 'declined', note: null })} disabled={off}
              style={btn(false, off)}>Not now</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Floating button */}
      <button onClick={() => setOpen((o) => !o)} title="Analyst Assistant" style={{
        position: 'fixed',
        right: 'calc(22px + env(safe-area-inset-right, 0px))',
        bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))',
        zIndex: 1000,
        width: 56, height: 56, borderRadius: '50%', border: 0, cursor: 'pointer',
        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff',
        boxShadow: '0 8px 24px rgba(109,40,217,0.45)', fontSize: 22, fontWeight: 700,
      }}>{open ? '×' : '✦'}</button>

      {open && (
        <div data-testid="chat-panel" style={{
          position: 'fixed', right: 'min(22px, 3vw)',
          bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))', zIndex: 1000,
          width: 380, maxWidth: 'calc(100vw - 16px)', height: 520,
          maxHeight: 'calc(100dvh - 110px)',
          background: '#fff', border: '1px solid #ddd6fe', borderRadius: 16,
          boxShadow: '0 20px 50px rgba(15,23,41,0.25)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, var(--purple), #6d28d9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>✦ Analyst Assistant</div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>Explains the app & reads your live data</div>
            </div>
            <button onClick={newChat} disabled={newChatOff} title="Start a new chat" style={{
              border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.12)', color: '#fff',
              borderRadius: 8, padding: '5px 10px', cursor: newChatOff ? 'default' : 'pointer',
              fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
              opacity: newChatOff ? 0.5 : 1,
            }}>↻ New chat</button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.length === 0 && (
              <div style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.6 }}>
                Ask how the app works, what a page does, or about your live forecasts, staffing and supplies — in plain English.
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {SUGGEST.map((s) => (
                    <button key={s} onClick={() => setInput(s)} style={{
                      textAlign: 'left', border: '1px solid #ddd6fe', background: '#f5f3ff',
                      borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 12.5, color: '#5b21b6', fontFamily: 'inherit',
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => {
              if (m.hidden) return null;
              const streaming = busy && i === msgs.length - 1;
              const text = m.content || (streaming ? '…' : '');
              return (
                <div key={i} style={{ display: 'contents' }}>
                  {(text || m.role === 'user') && (
                    <div style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '88%',
                      background: m.role === 'user' ? '#6d28d9' : '#f1f5f9',
                      color: m.role === 'user' ? '#fff' : '#1e293b',
                      borderRadius: 12, padding: '9px 12px', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}>
                      {text}
                    </div>
                  )}
                  {m.proposal && renderCard(m, i)}
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--divider)', padding: 10, display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask a question…"
              disabled={busy}
              style={{
                flex: 1, minWidth: 0, border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 11px',
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button onClick={send} disabled={busy || !input.trim()} style={{
              border: 0, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
              background: '#6d28d9', color: '#fff', borderRadius: 8, padding: '0 14px', fontWeight: 700, fontSize: 13,
              opacity: busy || !input.trim() ? 0.5 : 1,
            }}>{busy ? '…' : 'Send'}</button>
          </div>
        </div>
      )}
    </>
  );
}
