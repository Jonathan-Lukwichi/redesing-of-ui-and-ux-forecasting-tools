import { useState } from 'react';
import { aiApi } from '../api/aiClient';

// "Read this for me" — a small streaming card. Pass the forecast result as
// `context`; it streams a plain-English explanation grounded in those numbers.
export default function AiPanel({ context, label = 'Read this for me' }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const run = async () => {
    setBusy(true); setError(null); setText(''); setDone(false);
    try {
      await aiApi.explainForecast(context, (chunk) => setText((t) => t + chunk));
      setDone(true);
    } catch (e) {
      setError(e.message || 'The assistant is temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  };

  const C = { ink: '#0f172a', muted: '#64748b', violet: '#7c3aed', soft: '#f5f3ff', border: '#ddd6fe' };

  return (
    <div style={{
      marginTop: 16, background: C.soft, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.violet, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          ✦ AI assistant
        </span>
        {!text && !busy && (
          <button onClick={run} style={{
            border: 0, cursor: 'pointer', fontFamily: 'inherit',
            background: `linear-gradient(135deg, #8b5cf6, #6d28d9)`, color: '#fff',
            borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700,
          }}>{label}</button>
        )}
        {busy && <span style={{ fontSize: 12, color: C.muted }}>Reading the forecast…</span>}
        {done && (
          <button onClick={run} style={{
            border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: C.ink,
          }}>↻ Re-read</button>
        )}
      </div>

      {text && (
        <div style={{ marginTop: 10, fontSize: 13.5, color: '#1e293b', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
          {text}
          {busy && <span style={{ opacity: 0.5 }}>▍</span>}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: '#b91c1c' }}>
          {error}
        </div>
      )}
      {(text || done) && (
        <div style={{ marginTop: 10, fontSize: 10.5, color: C.muted, lineHeight: 1.5 }}>
          AI-generated from the numbers above. It can be wrong — verify before acting. No patient data is used.
        </div>
      )}
    </div>
  );
}
