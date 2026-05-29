const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

async function request(path, { method = 'GET', body, signal } = {}) {
  const opts = { method, signal };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    let detail = null;
    let parsed = null;
    try {
      parsed = await res.json();
      detail = parsed?.detail ?? parsed;
    } catch {
      try { detail = await res.text(); } catch { /* ignore */ }
    }
    const messageText =
      typeof detail === 'string'
        ? detail
        : (detail && typeof detail === 'object' && detail.message)
          ? detail.message
          : detail
            ? JSON.stringify(detail)
            : `${res.status} ${res.statusText}`;
    const err = new Error(`${res.status} ${res.statusText} — ${path}: ${messageText}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json();
}

export const api = {
  forecastDemo: (signal) => request('/api/forecast/demo', { signal }),

  datasets: {
    inventory: (signal) => request('/api/datasets/inventory', { signal }),
    get: (id, signal) => request(`/api/datasets/${id}`, { signal }),
    preview: (id, n = 10, signal) =>
      request(`/api/datasets/${id}/preview?n=${n}`, { signal }),
    upload: (id, file) => {
      const fd = new FormData();
      fd.append('file', file);
      return request(`/api/datasets/${id}/upload`, { method: 'POST', body: fd });
    },
    clear: (id) => request(`/api/datasets/${id}`, { method: 'DELETE' }),
    clearAll: () => request('/api/datasets', { method: 'DELETE' }),
  },

  prepare: {
    groups: (signal) => request('/api/prepare/groups', { signal }),
    build: ({ group, dateStart, dateEnd }) =>
      request('/api/prepare/build', {
        method: 'POST',
        body: { group, date_start: dateStart, date_end: dateEnd },
      }),
    get: (id, signal) => request(`/api/prepare/${id}`, { signal }),
    preview: (id, n = 20, signal) =>
      request(`/api/prepare/${id}/preview?n=${n}`, { signal }),
    quality: (id, signal) => request(`/api/prepare/${id}/quality`, { signal }),
    clear: (id) => request(`/api/prepare/${id}`, { method: 'DELETE' }),
    clearAll: () => request('/api/prepare', { method: 'DELETE' }),
  },
};
