// Streaming client for the AI assistant. Reads the plain-text stream from the
// backend and calls onDelta with each chunk as it arrives.
// Dev: Vite on :5173 talks to the API on :8000. Production: the API serves the
// built frontend itself, so requests are same-origin (empty base).
const API_BASE = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

async function streamPost(path, body, onDelta, signal) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.message || ''; } catch { /* ignore */ }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onDelta(decoder.decode(value, { stream: true }));
  }
  const tail = decoder.decode();
  if (tail) onDelta(tail);
}

// The chat's last chunk may be a trailer from the server: this mark, then JSON
// ({proposal?, navigate?}). Only the text before the mark is the reply.
const TRAILER_MARK = '\x1e';

function splitTrailer(raw) {
  const cut = raw.indexOf(TRAILER_MARK);
  return cut < 0 ? [raw, ''] : [raw.slice(0, cut), raw.slice(cut + 1)];
}

export const aiApi = {
  health: () => fetch(`${API_BASE}/api/ai/health`, { credentials: 'include' }).then((r) => r.json()),
  usage: () => fetch(`${API_BASE}/api/ai/usage`, { credentials: 'include' }).then((r) => r.json()),

  // Stream a plain-English explanation for any page surface.
  explain: (surface, context, onDelta, signal) =>
    streamPost('/api/ai/explain', { surface, context }, onDelta, signal),

  // Stream the dashboard daily briefing.
  briefing: (context, onDelta, signal) =>
    streamPost('/api/ai/briefing', { context }, onDelta, signal),

  // Streaming chat with read-only tools. messages = [{role, content}].
  chat: (messages, onDelta, signal) =>
    streamPost('/api/ai/chat', { messages }, onDelta, signal),

  // One chat turn. onText(visible) gets the whole reply so far, without the
  // trailer; once the stream ends the trailer is parsed and returned:
  // { proposal, navigate }, each null when absent.
  chatTurn: async (messages, onText, signal) => {
    let raw = '';
    await streamPost('/api/ai/chat', { messages }, (chunk) => {
      raw += chunk;
      onText(splitTrailer(raw)[0]);
    }, signal);
    const [, json] = splitTrailer(raw);
    let t = null;
    if (json) {
      try { t = JSON.parse(json); } catch { t = null; }
    }
    const p = t?.proposal;
    const proposal = p && typeof p === 'object' && typeof p.token === 'string' && Array.isArray(p.steps) ? p : null;
    return { proposal, navigate: typeof t?.navigate === 'string' ? t.navigate : null };
  },

  // Start the run the assistant offered, once the user confirmed it (via:
  // 'button' or 'typed'). Answers {status, proposal}; a refusal throws an
  // Error carrying .status, .code and the server's plain-English message.
  runProposal: async (token, via) => {
    const res = await fetch(`${API_BASE}/api/ai/run`, {
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, via }),
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) {
      const d = body?.detail;
      const b = d && typeof d === 'object' && !Array.isArray(d) ? d : body;
      const err = new Error((b && typeof b.message === 'string' && b.message)
        || `The run could not be started (${res.status}).`);
      err.status = res.status;
      err.code = b?.error || null;
      throw err;
    }
    return body;
  },

  // AI-ranked action list from live signals. A plain read serves the stored
  // list; refresh asks the server to rebuild it (Re-generate).
  actions: (refresh = false) => fetch(`${API_BASE}/api/ai/actions${refresh ? '?refresh=1' : ''}`, { credentials: 'include' }).then((r) => r.json()),

  // Admin / governance: durable AI audit trail.
  audit: (n = 50) => fetch(`${API_BASE}/api/ai/audit?n=${n}`, { credentials: 'include' }).then((r) => r.json()),
};
