// Streaming client for the AI assistant. Reads the plain-text stream from the
// backend and calls onDelta with each chunk as it arrives.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export const aiApi = {
  health: () => fetch(`${API_BASE}/api/ai/health`).then((r) => r.json()),

  // Stream a plain-English explanation of a forecast result.
  // onDelta(textChunk) is called repeatedly; resolves when the stream ends.
  explainForecast: async (forecast, onDelta, signal) => {
    const res = await fetch(`${API_BASE}/api/ai/explain/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forecast }),
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
  },
};
