import { useEffect, useRef, useState } from 'react';
import { aiApi } from '../api/aiClient';

// Global "Ask" assistant — a floating button + chat panel, on every page.
// Read-only: it can look up forecasts/supply/staffing, never change anything.
export default function AskChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);   // {role:'user'|'assistant', content}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    const history = [...msgs, { role: 'user', content: q }];
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setInput(''); setBusy(true);
    try {
      await aiApi.chat(history, (chunk) => {
        setMsgs((m) => {
          const next = [...m];
          next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + chunk };
          return next;
        });
      });
    } catch (e) {
      setMsgs((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: `[unavailable: ${e.message || 'error'}]` };
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => { setMsgs([]); setInput(''); setBusy(false); };

  const SUGGEST = [
    'What can this app do?',
    'How does the forecast work?',
    'Why do we hold safety stock?',
    'Which supplies are at risk?',
  ];

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
        <div style={{
          position: 'fixed', right: 'min(22px, 3vw)',
          bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))', zIndex: 1000,
          width: 380, maxWidth: 'calc(100vw - 16px)', height: 520,
          maxHeight: 'calc(100dvh - 110px)',
          background: '#fff', border: '1px solid #ddd6fe', borderRadius: 16,
          boxShadow: '0 20px 50px rgba(15,23,41,0.25)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>✦ Analyst Assistant</div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>Explains the app & reads your live data</div>
            </div>
            <button onClick={newChat} disabled={busy || msgs.length === 0} title="Start a new chat" style={{
              border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.12)', color: '#fff',
              borderRadius: 8, padding: '5px 10px', cursor: busy || msgs.length === 0 ? 'default' : 'pointer',
              fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
              opacity: busy || msgs.length === 0 ? 0.5 : 1,
            }}>↻ New chat</button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.length === 0 && (
              <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
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
            {msgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                background: m.role === 'user' ? '#6d28d9' : '#f1f5f9',
                color: m.role === 'user' ? '#fff' : '#1e293b',
                borderRadius: 12, padding: '9px 12px', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
              }}>
                {m.content || (busy && i === msgs.length - 1 ? '…' : '')}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #eef0f3', padding: 10, display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask a question…"
              disabled={busy}
              style={{
                flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 11px',
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
