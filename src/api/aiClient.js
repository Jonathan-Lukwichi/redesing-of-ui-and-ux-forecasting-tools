// Streaming client for the AI assistant. Reads the plain-text stream from the
// backend and calls onDelta with each chunk as it arrives.
// Dev: Vite on :5173 talks to the API on :8000. Production: the API serves the
// built frontend itself, so requests are same-origin (empty base).
const API_BASE = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

async function streamPost(path, body, onDelta, signal) {
  const res = await fetch(`${API_BASE}${path}`, {
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
}

export const aiApi = {
  health: () => fetch(`${API_BASE}/api/ai/health`).then((r) => r.json()),
  usage: () => fetch(`${API_BASE}/api/ai/usage`).then((r) => r.json()),

  // Stream a plain-English explanation for any page surface.
  explain: (surface, context, onDelta, signal) =>
    streamPost('/api/ai/explain', { surface, context }, onDelta, signal),

  // Stream the dashboard daily briefing.
  briefing: (context, onDelta, signal) =>
    streamPost('/api/ai/briefing', { context }, onDelta, signal),

  // Streaming chat with read-only tools. messages = [{role, content}].
  chat: (messages, onDelta, signal) =>
    streamPost('/api/ai/chat', { messages }, onDelta, signal),

  // AI-ranked action list from live signals.
  actions: () => fetch(`${API_BASE}/api/ai/actions`).then((r) => r.json()),

  // Admin / governance: durable AI audit trail.
  audit: (n = 50) => fetch(`${API_BASE}/api/ai/audit?n=${n}`).then((r) => r.json()),
};
